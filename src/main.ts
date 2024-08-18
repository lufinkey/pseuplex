import url from 'url';
import qs from 'querystring';
import fs from 'fs';
import stream from 'stream';
import https from 'https';
import httpolyglot from 'httpolyglot';
import express from 'express';
import { readConfigFile } from './config';
import * as constants from './constants';
import { parseCmdArgs } from './cmdargs';
import {
	plexThinProxy,
	plexApiProxy,
	plexHttpProxy
} from './plex/proxy';
import * as plexTypes from './plex/types';
import { handlePlexAPIRequest } from './plex/requesthandling';
import pseuplex from './pseuplex';
import {
	httpError,
	stringParam,
	intParam,
	stringArrayParam,
	booleanParam,
	parseURLPath
} from './utils';

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

// prepare server
const app = express();
const clientSockets: {[key: string]: stream.Duplex[]} = {};

// handle letterboxd requests
app.get(`${pseuplex.letterboxd.metadata.basePath}/:filmSlugs`, async (req, res) => {
	await handlePlexAPIRequest(req, res, async (): Promise<plexTypes.PlexMediaContainerResponse> => {
		console.log(`got request for letterboxd movie ${req.params.filmSlugs}`);
		const filmSlugsStr = req.params.filmSlugs?.trim();
		if(!filmSlugsStr) {
			throw httpError(400, "No slug was provided");
		}
		const filmSlugs = filmSlugsStr.split(',');
		const page = await pseuplex.letterboxd.metadata.get(filmSlugs);
		return {MediaContainer:page};
	});
});

app.get(pseuplex.letterboxd.hubs.userFollowingActivity.path, async (req, res) => {
	await handlePlexAPIRequest(req, res, async (): Promise<plexTypes.PlexMediaContainerResponse> => {
		const letterboxdUsername = stringParam(req.query['letterboxdUsername']);
		if(!letterboxdUsername) {
			throw httpError(400, "No user provided");
		}
		const params = plexTypes.parsePlexHubQueryParams(req.query, {includePagination:true});
		const hub = pseuplex.letterboxd.hubs.userFollowingActivity.get(letterboxdUsername);
		const page = await hub.getHub({
			...params,
			listStartToken: stringParam(req.query['listStartToken'])
		});
		return {MediaContainer:page};
	});
});

app.get('/hubs', plexApiProxy(cfg, args, {
	responseModifier: async (proxyRes, resData: plexTypes.PlexMediaContainerResponse, userReq, userRes) => {
		const params = plexTypes.parsePlexHubQueryParams(userReq.query, {includePagination:false});
		const hub = pseuplex.letterboxd.hubs.userFollowingActivity.get('luisfinke');
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
		return resData;
	}
}));

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

const plexWSProxy = plexHttpProxy(cfg, args);
app.get('/:/websockets/notifications', (req, res) => {
	plexWSProxy.web(req,res);
});

// proxy requests to plex
app.use(plexThinProxy(cfg, args));

const server: https.Server = httpolyglot.createServer({
	key: fs.readFileSync(cfg.ssl.keyPath),
	cert: fs.readFileSync(cfg.ssl.certPath)
}, app);

server.on('upgrade', (req, socket, head) => {
	if(args.logUserRequests) {
		console.log(`upgrade ws ${req.url}`);
	}
	const urlParts = parseURLPath(req.url);
	const plexToken = stringParam(urlParts.query['X-Plex-Token']);
	if(plexToken) {
		let sockets = clientSockets[plexToken];
		if(!sockets) {
			sockets = [];
			clientSockets[plexToken] = sockets;
		}
		sockets.push(socket);
		socket.on('close', () => {
			const socketIndex = sockets.indexOf(socket);
			if(socketIndex != -1) {
				sockets.splice(socketIndex, 1);
			} else {
				console.error(`Couldn't find socket to remove for ${req.url}`);
			}
			if(args.verbose) {
				console.log(`closed socket ${req.url}`);
			}
		});
	}
	plexWSProxy.ws(req, socket, head);
});

// start server
server.listen(cfg.port, () => {
	console.log(`${constants.APP_NAME} is listening at localhost:${cfg.port}\n`);
});
