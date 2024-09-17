import url from 'url';
import qs from 'querystring';
import fs from 'fs';
import stream from 'stream';
import https from 'https';
import httpolyglot from 'httpolyglot';
import express from 'express';
import {
	httpError,
	stringParam,
	parseURLPath,
	stringifyURLPath,
	expressErrorHandler,
	asyncRequestHandler,
	parseQueryParams,
	forArrayOrSingleAsyncParallel,
	transformArrayOrSingleAsyncParallel,
	forArrayOrSingle
} from './utils';
import { readConfigFile } from './config';
import * as constants from './constants';
import { parseCmdArgs } from './cmdargs';
import { urlLogString } from './logging';
import {
	plexApiProxy,
	plexHttpProxy
} from './plex/proxy';
import * as plexTypes from './plex/types';
import * as plexServerAPI from './plex/api';
import { PlexServerPropertiesStore } from './plex/serverproperties';
import { PlexServerAccountsStore } from './plex/accounts';
import { createPlexServerIdToGuidCache } from './plex/metadata';
import {
	plexAPIRequestHandler,
	IncomingPlexAPIRequest,
	createPlexAuthenticationMiddleware,
	handlePlexAPIRequest
} from './plex/requesthandling';
import { parseMetadataIDFromKey } from './plex/utils';
import pseuplex from './pseuplex';
import {
	PseuplexMetadataSource,
	PseuplexMetadataItem,
	PseuplexMetadataPage
} from './pseuplex/types';
import * as pseuLetterboxd from './pseuplex/letterboxd';
import * as pseuplexNotifications from './pseuplex/notifications';
import {
	parseMetadataID,
	stringifyMetadataID,
	stringifyPartialMetadataID
} from './pseuplex/metadataidentifier';
import {
	parseMetadataIdsFromPathParam,
	pseuplexMetadataIdRequestMiddleware,
	pseuplexMetadataIdsRequestMiddleware
} from './pseuplex/requesthandling';
import * as tweaks from './tweaks';

// parse command line arguments
const args = parseCmdArgs(process.argv.slice(2));
if(!args.configPath) {
	console.error("No config path specified");
	process.exit(1);
}
if(args.verbose) {
	console.log(`parsed arguments:\n${JSON.stringify(args, null, '\t')}\n`);
}

// load config
const cfg = readConfigFile(args.configPath);
if (args.verbose) {
	console.log(`parsed config:\n${JSON.stringify(cfg, null, '\t')}\n`);
}
if (!cfg.ssl?.keyPath) {
	console.error("No ssl key path specified in config");
	process.exit(1);
}
if (!cfg.ssl?.certPath) {
	console.error("No ssl cert path specified in config");
	process.exit(1);
}
const plexServerURL = cfg.plex.host.indexOf('://') != -1 ? `${cfg.plex.host}:${cfg.plex.port}` : `http://${cfg.plex.host}:${cfg.plex.port}`;
const plexAuthContext = {
	'X-Plex-Token': cfg.plex.token
};

// prepare server
const app = express();
const plexServerPropertiesStore = new PlexServerPropertiesStore({
	plexServerURL,
	plexAuthContext
});
const plexServerAccountsStore = new PlexServerAccountsStore({
	plexServerProperties: plexServerPropertiesStore,
	sharedServersMinLifetime: 60 * 5
});
const plexServerIdToGuidCache = createPlexServerIdToGuidCache({
	plexServerURL,
	plexAuthContext,
	onFetchMetadataItem: async (id, metadataItem) => {
		// pre-fetch associated letterboxd item
		try {
			await pseuplex.letterboxd.metadata.getIDForPlexItem(metadataItem);
		} catch(error) {
			console.error(error);
		}
	}
});
const clientWebSockets: {[key: string]: stream.Duplex[]} = {};
const plexAuthenticator = createPlexAuthenticationMiddleware(plexServerAccountsStore);


app.use((req, res, next) => {
	// log request if needed
	if(args.logUserRequests) {
		console.log(`\nUser ${req.method} ${urlLogString(args, req.originalUrl)}`);
	}
	next();
});


// handle letterboxd requests

app.get(`${pseuplex.letterboxd.metadata.basePath}/:id`, [
	plexAuthenticator,
	plexAPIRequestHandler(async (req: IncomingPlexAPIRequest, res): Promise<plexTypes.PlexMetadataPage> => {
		console.log(`\ngot request for letterboxd item ${req.params.id}`);
		//console.log(JSON.stringify(req.query));
		//console.log(JSON.stringify(req.headers));
		const reqAuthContext = req.plex.authContext;
		const reqUserInfo = req.plex.userInfo
		const params: plexTypes.PlexMetadataPageParams = parseQueryParams(req, (key) => !(key in reqAuthContext));
		const itemIdsStr = req.params.id?.trim();
		if(!itemIdsStr) {
			throw httpError(400, "No slug was provided");
		}
		const ids = itemIdsStr.split(',');
		const userInfo = req.plex.userInfo;
		const userPrefs = cfg.perUser[userInfo.email];
		// get metadatas
		const page = await pseuplex.letterboxd.metadata.get(ids, {
			plexServerURL,
			plexAuthContext: reqAuthContext,
			includeDiscoverMatches: true,
			includeUnmatched: true,
			transformMatchKeys: true,
			metadataBasePath: pseuplex.letterboxd.metadata.basePath,
			qualifiedMetadataIds: false,
			plexParams: params,
			transformMetadataItem: async (metadataItem, id) => {
				// attach extra data if needed
				try {
					// attach letterboxd friends reviews if needed
					if(userPrefs && userPrefs.letterboxdUsername) {
						if(params.includeReviews == true) {
							// attach letterboxd friends reviews
							await pseuLetterboxd.attachLetterboxdFriendsReviewsToPlexMetadata(metadataItem, {
								letterboxdMetadataId: id,
								letterboxdMetadataProvider: pseuplex.letterboxd.metadata,
								letterboxdUsername: userPrefs.letterboxdUsername
							});
						}
					}
				} catch(error) {
					console.error(error);
				}
				return metadataItem;
			}
		});
		if(page?.MediaContainer?.Metadata) {
			let metadataItems = page.MediaContainer.Metadata;
			if(!(metadataItems instanceof Array)) {
				metadataItems = [metadataItems];
			}
			// send unavailable notification(s) if needed
			if(metadataItems.length > 0
				&& (params.checkFiles == 1 || params.asyncCheckFiles == 1
					|| params.refreshLocalMediaAgent == 1 || params.asyncRefreshLocalMediaAgent == 1
					|| params.refreshAnalysis == 1 || params.asyncRefreshAnalysis)) {
				setTimeout(() => {
					const sockets = clientWebSockets[reqAuthContext['X-Plex-Token']];
					if(sockets && sockets.length > 0) {
						for(const metadataItem of metadataItems) {
							if(!metadataItem.Pseuplex?.isOnServer) {
								console.log(`Sending unavailable notifications for ${metadataItem.key} on ${sockets.length} sockets`);
								pseuplexNotifications.sendMediaUnavailableNotifications(sockets, {
									userID: reqUserInfo.userID,
									metadataKey: metadataItem.key
								});
							}
						}
					}
				}, 100);
			}
		}
		return page;
	})
]);

app.get(`${pseuplex.letterboxd.metadata.basePath}/:id/related`, [
	plexAuthenticator,
	plexAPIRequestHandler(async (req: IncomingPlexAPIRequest, res): Promise<plexTypes.PlexHubsPage> => {
		const id = req.params.id;
		const hubs: plexTypes.PlexHubWithItems[] = [];
		const params = plexTypes.parsePlexHubPageParams(req, {fromListPage:true});
		// add similar items hub
		const hub = await pseuplex.letterboxd.hubs.similar.get(id);
		const hubEntry = await hub.getHubListEntry(params, {
			plexServerURL,
			plexAuthContext: req.plex.authContext
		});
		hubs.push(hubEntry);
		return {
			MediaContainer: {
				size: hubs.length,
				identifier: plexTypes.PlexPluginIdentifier.PlexAppLibrary,
				Hub: hubs
			}
		};
	})
]);

app.get(`${pseuplex.letterboxd.metadata.basePath}/:id/similar`, [
	plexAuthenticator,
	plexAPIRequestHandler(async (req: IncomingPlexAPIRequest, res): Promise<plexTypes.PlexHubsPage> => {
		const id = req.params.id;
		const params = plexTypes.parsePlexHubPageParams(req, {fromListPage:false});
		const hub = await pseuplex.letterboxd.hubs.similar.get(id);
		return await hub.getHub(params, {
			plexServerURL,
			plexAuthContext: req.plex.authContext
		});
	})
]);

app.get(pseuplex.letterboxd.hubs.userFollowingActivity.path, [
	plexAuthenticator,
	plexAPIRequestHandler(async (req: IncomingPlexAPIRequest, res): Promise<plexTypes.PlexMetadataPage> => {
		const letterboxdUsername = stringParam(req.query['letterboxdUsername']);
		if(!letterboxdUsername) {
			throw httpError(400, "No user provided");
		}
		const params = plexTypes.parsePlexHubPageParams(req, {fromListPage:false});
		const hub = await pseuplex.letterboxd.hubs.userFollowingActivity.get(letterboxdUsername);
		return await hub.getHub({
			...params,
			listStartToken: stringParam(req.query['listStartToken'])
		}, {
			plexServerURL,
			plexAuthContext: req.plex.authContext
		});
	})
]);



// handle plex requests

app.get('/hubs', [
	plexAuthenticator,
	plexApiProxy(cfg, args, {
		responseModifier: async (proxyRes, resData: plexTypes.PlexLibraryHubsPage, userReq: IncomingPlexAPIRequest, userRes): Promise<plexTypes.PlexLibraryHubsPage> => {
			resData = await tweaks.addLetterboxdFeedHub(resData, {
				userReq,
				config: cfg,
				plexServerAccountsStore,
				plexServerURL
			});
			return resData;
		}
	})
]);

app.get('/hubs/promoted', [
	plexAuthenticator,
	plexApiProxy(cfg, args, {
		responseModifier: async (proxyRes, resData: plexTypes.PlexLibraryHubsPage, userReq: IncomingPlexAPIRequest, userRes): Promise<plexTypes.PlexLibraryHubsPage> => {
			const pinnedContentDirectoryID = userReq.query['pinnedContentDirectoryID'];
			const contentDirectoryID = userReq.query['contentDirectoryID'];
			const pinnedContentDirIds = (typeof pinnedContentDirectoryID == 'string') ? pinnedContentDirectoryID.split(',') : pinnedContentDirectoryID;
			if(!pinnedContentDirIds || pinnedContentDirIds.length == 0 || !contentDirectoryID || contentDirectoryID == pinnedContentDirIds[0]) {
				resData = await tweaks.addLetterboxdFeedHub(resData, {
					userReq,
					config: cfg,
					plexServerAccountsStore,
					plexServerURL
				});
			}
			return resData;
		}
	})
]);

app.get(`/library/metadata/:metadataId`, [
	plexAuthenticator,
	pseuplexMetadataIdsRequestMiddleware(async (req: IncomingPlexAPIRequest, res, metadataIds, params: plexTypes.PlexMetadataPageParams): Promise<PseuplexMetadataPage> => {
		// get request info
		const userInfo = req.plex.userInfo;
		const userPrefs = cfg.perUser[userInfo.email];
		// get metadatas
		return await pseuplex.getMetadata(metadataIds, {
			plexServerURL,
			plexAuthContext: req.plex.authContext,
			includeDiscoverMatches: true,
			includeUnmatched: true,
			transformMatchKeys: true,
			metadataBasePath: '/library/metadata',
			qualifiedMetadataIds: true,
			plexParams: params
		});
	}),
	plexApiProxy(cfg, args, {
		responseModifier: async (proxyRes, resData: plexTypes.PlexMetadataPage, userReq: IncomingPlexAPIRequest, userRes) => {
			let metadata = resData.MediaContainer.Metadata;
			if(metadata) {
				// get request info
				const userInfo = userReq.plex.userInfo;
				const userPrefs = cfg.perUser[userInfo.email];
				const params: plexTypes.PlexMetadataPageParams = parseQueryParams(userReq, (key) => !(key in userReq.plex.authContext));
				// map ids to guids
				await forArrayOrSingleAsyncParallel(metadata, async (metadataItem) => {
					try {
						// cache id => guid mapping
						if(metadataItem.guid) {
							const itemId = parseMetadataIDFromKey(metadataItem.key, '/library/metadata/')?.id;
							if(itemId) {
								plexServerIdToGuidCache.setSync(itemId, metadataItem.guid);
							}
						}
						// attach letterboxd data if needed
						if(userPrefs && userPrefs.letterboxdUsername) {
							if(params.includeReviews == true) {
								// attach letterboxd friends reviews
								await pseuLetterboxd.attachLetterboxdFriendsReviewsToPlexMetadata(metadataItem, {
									letterboxdMetadataProvider: pseuplex.letterboxd.metadata,
									letterboxdUsername: userPrefs.letterboxdUsername
								});
							}
						} else {
							// pre-fetch and cache letterboxd id
							await pseuplex.letterboxd.metadata.getIDForPlexItem(metadataItem);
						}
					} catch(error) {
						console.error(error);
					}
				});
			}
			return resData;
		}
	})
]);

app.get(`/library/metadata/:metadataId/related`, [
	plexAuthenticator,
	pseuplexMetadataIdsRequestMiddleware(async (req: IncomingPlexAPIRequest, res, metadataIds, params): Promise<plexTypes.PlexHubsPage> => {
		let hubs: plexTypes.PlexHubWithItems[] = [];
		const hubPageParams = plexTypes.parsePlexHubPageParams(req, {fromListPage:true});
		// get hub(s) from plex
		const plexIds = await metadataIds.filter((metadataId) => metadataId.source == PseuplexMetadataSource.Plex);
		let caughtError: Error = undefined;
		if(plexIds.length > 0) {
			try {
				const plexHubsPage: plexTypes.PlexHubsPage = (await plexServerAPI.fetch({
					method: 'GET',
					endpoint: `/library/metadata/${plexIds.map((idParts) => {
						const idString = stringifyMetadataID(idParts);
						return qs.escape(idString);
					})}/related`,
					params: params,
					serverURL: plexServerURL,
					authContext: req.plex.authContext
				}));
				if(plexHubsPage?.MediaContainer?.Hub) {
					hubs = hubs.concat(plexHubsPage.MediaContainer.Hub);
				}
			} catch(error) {
				console.error(error);
				caughtError = error;
			}
		}
		// get hub(s) from other providers
		// TODO combine same hubs from same provider
		await Promise.all(metadataIds.map(async (metadataId) => {
			switch(metadataId.source) {
				case PseuplexMetadataSource.Letterboxd: {
					// add similar letterboxd items hub
					const id = stringifyPartialMetadataID(metadataId);
					const hub = await pseuplex.letterboxd.hubs.similar.get(id);
					const hubPage = await hub.getHubListEntry(hubPageParams, {
						plexServerURL,
						plexAuthContext: req.plex.authContext
					});
					hubs.push(hubPage);
				} break;
			}
		}));
		// throw error if no hubs
		if(hubs.length == 0 && caughtError) {
			throw caughtError;
		}
		// build results page
		return {
			MediaContainer: {
				size: hubs.length,
				identifier: plexTypes.PlexPluginIdentifier.PlexAppLibrary,
				Hub: hubs
			}
		};
	}),
	plexApiProxy(cfg, args, {
		responseModifier: async (proxyRes, resData: plexTypes.PlexHubsPage, userReq: IncomingPlexAPIRequest, userRes) => {
			const hubPageParams = plexTypes.parsePlexHubPageParams(userReq, {fromListPage:true});
			// add similar letterboxd movies hub
			try {
				let hubEntries = resData.MediaContainer.Hub;
				if(!hubEntries) {
					hubEntries = [];
					resData.MediaContainer.Hub = hubEntries;
				}
				// all metadata ids are plex ids
				const metadataIds = parseMetadataIdsFromPathParam(userReq.params.metadataId);
				// get hubs for metadata ids
				const hubs = await Promise.all(metadataIds.map(async (metadataId) => {
					// get plex guid from metadata id
					const metadataIdString = stringifyMetadataID(metadataId);
					let plexGuid: string;
					if(metadataId.isURL) {
						plexGuid = metadataIdString;
					} else {
						plexGuid = await plexServerIdToGuidCache.getOrFetch(metadataIdString);
					}
					if(!plexGuid) {
						return null;
					}
					// get letterboxd id for plex guid
					const letterboxdId = await pseuplex.letterboxd.metadata.getIDForPlexGUID(plexGuid, {
						plexServerURL,
						plexAuthContext
					});
					if(!letterboxdId) {
						return null;
					}
					// get letterboxd similar movies hub
					return await pseuplex.letterboxd.hubs.similar.get(letterboxdId);
				}));
				// append hubs
				for(const hub of hubs) {
					if(!hub) {
						continue;
					}
					try {
						const hubEntry = await hub.getHubListEntry(hubPageParams, {
							plexServerURL,
							plexAuthContext: userReq.plex.authContext
						});
						hubEntries.push(hubEntry);
					} catch(error) {
						console.error(error);
					}
				}
			} catch(error) {
				console.error(error);
			}
			return resData;
		}
	})
]);

app.post('/playQueues', [
	plexAuthenticator,
	plexApiProxy(cfg, args, {
		requestPathModifier: async (req: IncomingPlexAPIRequest): Promise<string> => {
			// parse url path
			const urlPathParts = parseURLPath(req.originalUrl);
			const queryItems = urlPathParts.queryItems;
			if(!queryItems) {
				return req.originalUrl;
			}
			// check for play queue uri
			let uriProp = queryItems['uri'];
			if(!uriProp) {
				return req.originalUrl;
			}
			// resolve play queue uri
			const resolveOptions = {
				plexMachineIdentifier: await plexServerPropertiesStore.getMachineIdentifier(),
				plexServerURL,
				plexAuthContext: req.plex.authContext
			};
			uriProp = await transformArrayOrSingleAsyncParallel(uriProp, async (uri) => {
				return await pseuplex.resolvePlayQueueURI(uri, resolveOptions);
			});
			queryItems['uri'] = uriProp;
			return stringifyURLPath(urlPathParts);
		}
		/*requestBodyModifier: (bodyContent, req) => {
			console.log(`body ${bodyContent} (type ${typeof bodyContent})`);
			return bodyContent;
		}*/
	})
]);

/*app.get('/:/prefs', (req, res) => {
	res.status(200);
	res.appendHeader('access-control-allow-origin', 'https://app.plex.tv')
	res.status(200).send(
`<MediaContainer size="163">
	<Setting id="TestSetting" label="Tee Hee" summary="This name will be used to identify this media server to other computers on your network. If you leave it blank, your computer&#39;s name will be used instead." type="text" default="" value="pseuplex" hidden="0" advanced="0" group="general" />
</MediaContainer>`
	);
});

app.get('/media/providers', plexApiProxy(cfg, args, {
	responseModifier: (proxyRes, resData: plexTypes.PlexMediaProvidersPage, userReq, userRes) => {
		if(resData.MediaContainer.MediaProvider[0].Feature.findIndex((f) => f.type == 'manage') == -1) {
			resData.MediaContainer.MediaProvider[0].Feature.push({type:'manage'} as any);
		}
		return resData;
	}
}));

app.get('/activities', (req, res) => {
	res.status(200);
	res.appendHeader('access-control-allow-origin', 'https://app.plex.tv');
	res.appendHeader('content-type', 'application/json');
	res.status(200).send(JSON.stringify({MediaContainer:{size:0}}));
});*/

// proxy requests to plex
const plexGeneralProxy = plexHttpProxy(cfg, args);
app.use('/notifications', (req, res) => {
	plexGeneralProxy.web(req, res);
});
app.use('/eventstream', (req, res) => {
	plexGeneralProxy.web(req, res);
});

app.use((req, res) => {
	plexGeneralProxy.web(req,res);
});
/*app.use(plexApiProxy(cfg, args, {
	responseModifier: (proxyRes, resData, userReq, userRes) => {
		return resData;
	}
}));*/
app.use(expressErrorHandler);

// create http+https server
const server: https.Server = httpolyglot.createServer({
	key: fs.readFileSync(cfg.ssl.keyPath),
	cert: fs.readFileSync(cfg.ssl.certPath)
}, app);

// handle upgrade to socket
server.on('upgrade', (req, socket, head) => {
	if(args.logUserRequests) {
		console.log(`\nupgrade ws ${req.url}`);
	}
	const plexToken = plexTypes.parsePlexTokenFromRequest(req);
	if(plexToken) {
		// save socket per plex token
		let sockets = clientWebSockets[plexToken];
		if(!sockets) {
			sockets = [];
			clientWebSockets[plexToken] = sockets;
		}
		sockets.push(socket);
		socket.on('close', () => {
			const socketIndex = sockets.indexOf(socket);
			if(socketIndex != -1) {
				sockets.splice(socketIndex, 1);
				if(sockets.length == 0) {
					delete clientWebSockets[plexToken];
				}
			} else {
				console.error(`Couldn't find socket to remove for ${req.url}`);
			}
			if(args.logUserRequests) {
				console.log(`closed socket ${req.url}`);
			}
		});
	}
	plexGeneralProxy.ws(req, socket, head);
});

// start server
server.listen(cfg.port, () => {
	console.log(`${constants.APP_NAME} is listening at localhost:${cfg.port}\n`);
});
