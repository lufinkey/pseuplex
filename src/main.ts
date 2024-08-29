import url from 'url';
import qs from 'querystring';
import fs from 'fs';
import stream from 'stream';
import https from 'https';
import httpolyglot from 'httpolyglot';
import express from 'express';
import * as letterboxd from 'letterboxd-retriever';
import {
	httpError,
	stringParam
} from './utils';
import { readConfigFile } from './config';
import * as constants from './constants';
import { parseCmdArgs } from './cmdargs';
import {
	plexApiProxy,
	plexHttpProxy
} from './plex/proxy';
import * as plexTypes from './plex/types';
import pseuplex from './pseuplex';
import * as pseuLetterboxd from './pseuplex/letterboxd';
import { PseuplexAccountsStore } from './pseuplex/accounts';
import { handleAuthenticatedPlexAPIRequest } from './pseuplex/requesthandling';
import * as pseuplexNotifications from './pseuplex/notifications';

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
const accountsStore = new PseuplexAccountsStore({
	plexServerURL,
	plexAuthContext,
	sharedServersMinLifetime: 60 * 5
});
const clientWebSockets: {[key: string]: stream.Duplex[]} = {};

// handle letterboxd requests
app.get(`${pseuplex.letterboxd.metadata.basePath}/:filmSlugs`, async (req, res) => {
	await handleAuthenticatedPlexAPIRequest(req, res, accountsStore, async (reqInfo): Promise<plexTypes.PlexMetadataPage> => {
		console.log(`\ngot request for letterboxd movie ${req.params.filmSlugs}`);
		const filmSlugsStr = req.params.filmSlugs?.trim();
		if(!filmSlugsStr) {
			throw httpError(400, "No slug was provided");
		}
		const filmSlugs = filmSlugsStr.split(',');
		const page = await pseuplex.letterboxd.metadata.get(filmSlugs, {
			plexServerURL,
			plexAuthContext: reqInfo.authContext
		});
		if(page?.MediaContainer?.Metadata) {
			let metadataItems = page.MediaContainer.Metadata;
			if(!(metadataItems instanceof Array)) {
				metadataItems = [metadataItems];
			}
			if(metadataItems.length > 0) {
				setTimeout(() => {
					const sockets = clientWebSockets[reqInfo.authContext['X-Plex-Token']];
					if(sockets && sockets.length > 0) {
						for(const metadataItem of metadataItems) {
							if(!metadataItem.Pseuplex?.isOnServer) {
								console.log(`Sending unavailable notification for ${metadataItem.key} item(s) on ${sockets.length} sockets`);
								pseuplexNotifications.sendMediaUnavailableNotification(sockets, {
									userID: reqInfo.userInfo.userID,
									metadataKey: metadataItem.key
								});
							}
						}
					}
				}, 100);
			}
		}
		return page;
	});
});

app.get(pseuplex.letterboxd.hubs.userFollowingActivity.path, async (req, res) => {
	await handleAuthenticatedPlexAPIRequest(req, res, accountsStore, async (reqInfo): Promise<plexTypes.PlexHubPage> => {
		const letterboxdUsername = stringParam(req.query['letterboxdUsername']);
		if(!letterboxdUsername) {
			throw httpError(400, "No user provided");
		}
		const params = plexTypes.parsePlexHubQueryParams(req.query, {includePagination:true});
		const hub = pseuplex.letterboxd.hubs.userFollowingActivity.get(letterboxdUsername);
		return await hub.getHub({
			...params,
			listStartToken: stringParam(req.query['listStartToken'])
		});
	});
});

app.get('/hubs', plexApiProxy(cfg, args, {
	responseModifier: async (proxyRes, resData: plexTypes.PlexHubsPage, userReq, userRes): Promise<plexTypes.PlexHubsPage> => {
		try {
			const plexToken = plexTypes.parsePlexTokenFromRequest(userReq);
			const userInfo = await accountsStore.getTokenUserInfoOrNull(plexToken);
			console.log(`userInfo for token ${plexToken} is ${userInfo?.email} (isServerOwner=${userInfo?.isServerOwner})`);
			if(userInfo) {
				const perUserCfg = userInfo ? cfg.perUser[userInfo.email] : null;
				if(perUserCfg?.letterboxdUsername) {
					const params = plexTypes.parsePlexHubQueryParams(userReq.query, {includePagination:false});
					const hub = pseuplex.letterboxd.hubs.userFollowingActivity.get(perUserCfg.letterboxdUsername);
					const page = await hub.getHubListEntry({
						...params,
						listStartToken: stringParam(userReq.query['listStartToken'])
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
}));

app.get(`/library/metadata/:metadataId`, plexApiProxy(cfg, args, {
	responseModifier: async (proxyRes, resData: plexTypes.PlexMetadataPage, userReq, userRes) => {
		let metadata = resData.MediaContainer.Metadata;
		if(metadata) {
			const plexToken = plexTypes.parsePlexTokenFromRequest(userReq);
			const userInfo = await accountsStore.getTokenUserInfoOrNull(plexToken);
			if(userInfo) {
				const userPrefs = cfg.perUser[userInfo.email];
				if(userPrefs && userPrefs.letterboxdUsername) {
					if(!(metadata instanceof Array)) {
						metadata = [ metadata ];
					}
					resData.MediaContainer.Metadata = await Promise.all(metadata.map(async (item) => {
						try {
							if(item.Guid) {
								let tmdbId: string = item.Guid.find((g) => g.id.startsWith('tmdb://'))?.id;
								if(tmdbId) {
									tmdbId = tmdbId.substring(7);
									const letterboxdSlug = await letterboxd.getFilmSlugFromExternalID({tmdbId});
									if(letterboxdSlug) {
										const friendViewings = await letterboxd.getFriendsReviews({
											username: userPrefs.letterboxdUsername,
											filmSlug: letterboxdSlug
										});
										const reviews = friendViewings.items.map((viewing) => {
											return pseuLetterboxd.viewingToPlexReview(viewing);
										});
										if(item.Review) {
											item.Review = reviews.concat(item.Review);
										} else {
											item.Review = reviews;
										}
									}
								}
							}
						} catch(error) {
							console.error(error);
						}
						return item;
					}));
				}
			}
		}
		return resData;
	}
}));

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
app.use((req, res) => {
	plexGeneralProxy.web(req,res);
});

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
