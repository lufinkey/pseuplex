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
	parseQueryParams
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
import {
	plexAPIRequestHandler,
	IncomingPlexAPIRequest,
	createPlexAuthenticationMiddleware,
	handlePlexAPIRequest
} from './plex/requesthandling';
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
	pseuplexMetadataIdsRequestMiddleware
} from './pseuplex/requesthandling';

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
		const page = await pseuplex.letterboxd.metadata.get(ids, {
			plexServerURL,
			plexAuthContext: reqAuthContext,
			includeDiscoverMatches: true,
			includeUnmatched: true,
			transformMatchKeys: true,
			metadataBasePath: pseuplex.letterboxd.metadata.basePath,
			qualifiedMetadataIds: false,
			plexParams: params
		});
		if(page?.MediaContainer?.Metadata) {
			let metadataItems = page.MediaContainer.Metadata;
			if(!(metadataItems instanceof Array)) {
				metadataItems = [metadataItems];
			}
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
	}),
	expressErrorHandler
]);

app.get(`${pseuplex.letterboxd.metadata.basePath}/:id/related`, [
	plexAuthenticator,
	plexAPIRequestHandler(async (req: IncomingPlexAPIRequest, res): Promise<plexTypes.PlexHubsPage> => {
		// TODO fetch related hub
		return {
			MediaContainer: {
				size: 0,
				identifier: plexTypes.PlexPluginIdentifier.PlexAppLibrary,
				Hub: []
			}
		}
	}),
	expressErrorHandler
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
	}),
	expressErrorHandler
]);



// handle plex requests

app.get('/hubs', [
	plexAuthenticator,
	plexApiProxy(cfg, args, {
		responseModifier: async (proxyRes, resData: plexTypes.PlexLibraryHubsPage, userReq: IncomingPlexAPIRequest, userRes): Promise<plexTypes.PlexLibraryHubsPage> => {
			try {
				const plexToken = plexTypes.parsePlexTokenFromRequest(userReq);
				const userInfo = await plexServerAccountsStore.getTokenUserInfoOrNull(plexToken);
				console.log(`userInfo for token ${plexToken} is ${userInfo?.email} (isServerOwner=${userInfo?.isServerOwner})`);
				if(userInfo) {
					const perUserCfg = userInfo ? cfg.perUser[userInfo.email] : null;
					if(perUserCfg?.letterboxdUsername) {
						const params = plexTypes.parsePlexHubPageParams(userReq, {fromListPage:true});
						const hub = await pseuplex.letterboxd.hubs.userFollowingActivity.get(perUserCfg.letterboxdUsername);
						const page = await hub.getHubListEntry(params, {
							plexServerURL,
							plexAuthContext: userReq.plex.authContext
						});
						if(!resData.MediaContainer.Hub) {
							resData.MediaContainer.Hub = [];
						} else if(!(resData.MediaContainer.Hub instanceof Array)) {
							resData.MediaContainer.Hub = [resData.MediaContainer.Hub];
						}
						resData.MediaContainer.Hub.splice(0, 0, page);
						resData.MediaContainer.size += 1;
					}
				}
			} catch(error) {
				console.error(error);
			}
			return resData;
		}
	})
]);

app.get(`/library/metadata/:metadataId`, [
	plexAuthenticator,
	pseuplexMetadataIdsRequestMiddleware(async (req: IncomingPlexAPIRequest, res, metadataIds, params): Promise<PseuplexMetadataPage> => {
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
				const userInfo = userReq.plex.userInfo;
				const userPrefs = cfg.perUser[userInfo.email];
				if(userPrefs && userPrefs.letterboxdUsername) {
					if(metadata instanceof Array) {
						if(metadata.length == 1) {
							metadata[0] = await pseuLetterboxd.attachLetterboxdReviewsToPlexMetadata(metadata[0], {
								letterboxdMetadataProvider: pseuplex.letterboxd.metadata,
								letterboxdUsername: userPrefs.letterboxdUsername
							});
						}
					} else {
						metadata = await pseuLetterboxd.attachLetterboxdReviewsToPlexMetadata(metadata, {
							letterboxdMetadataProvider: pseuplex.letterboxd.metadata,
							letterboxdUsername: userPrefs.letterboxdUsername
						});
					}
					resData.MediaContainer.Metadata = metadata;
				}
			}
			return resData;
		}
	}),
	expressErrorHandler
]);

app.get(`/library/metadata/:metadataId/related`, [
	plexAuthenticator,
	asyncRequestHandler(async (req: IncomingPlexAPIRequest, res): Promise<boolean> => {
		const metadataId = req.params.metadataId;
		if(!metadataId) {
			// let plex handle the empty api request
			return false;
		}
		const idParts = parseMetadataID(metadataId);
		if(!idParts.source || idParts.source == PseuplexMetadataSource.Plex) {
			// id is a plex ID, so no need to handle this request
			return false;
		}
		await handlePlexAPIRequest(req, res, async (req: IncomingPlexAPIRequest, res): Promise<plexTypes.PlexHubsPage> => {
			// TODO fetch related hub
			return {
				MediaContainer: {
					size: 0,
					identifier: plexTypes.PlexPluginIdentifier.PlexAppLibrary,
					Hub: []
				}
			};
		});
		return true;
	}),
	expressErrorHandler
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
			let uri = queryItems['uri'];
			if(!uri) {
				return req.originalUrl;
			}
			// resolve play queue uri
			const resolveOptions = {
				plexMachineIdentifier: await plexServerPropertiesStore.getMachineIdentifier(),
				plexServerURL,
				plexAuthContext: req.plex.authContext
			};
			if(uri instanceof Array) {
				uri = await Promise.all(uri.map(async (uriElement) => {
					return await pseuplex.resolvePlayQueueURI(uriElement, resolveOptions);
				}));
			} else {
				uri = await pseuplex.resolvePlayQueueURI(uri, resolveOptions);
			}
			queryItems['uri'] = uri;
			return stringifyURLPath(urlPathParts);
		},
		requestBodyModifier: (bodyContent, req) => {
			console.log(`body ${bodyContent} (type ${typeof bodyContent})`);
			return bodyContent;
		}
	}),
	expressErrorHandler
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
/*app.use('/library/metadata/:metadataId', plexApiProxy(cfg, args, {
	requestModifier: (proxyReqOpts, userReq) => {
		const urlPathObj = parseURLPath(userReq.originalUrl);
		return proxyReqOpts;
	},
	proxyReqPathResolver: (req) => {
		return req.originalUrl;
	},
	responseModifier: async (proxyRes, resData, userReq, userRes) => {
		return resData;
	}
}));*/

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
