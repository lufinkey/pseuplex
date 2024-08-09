import url from 'url';
import qs from 'querystring';
import fs from 'fs';
import httpolyglot from 'httpolyglot';
import express from 'express';
import { readConfigFile } from './config';
import * as constants from './constants';
import { parseCmdArgs } from './cmdargs';
import {
	plexProxy,
	plexThinProxy,
	plexApiProxy } from './plex/proxy';
import * as plexTypes from './plex/types';
import { handlePlexAPIRequest } from './plex/requesthandling';
import pseuplex from './pseuplex';
import {
	httpError,
	stringParam,
	intParam } from './utils';

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

// handle letterboxd requests
app.get(`${pseuplex.letterboxd.metadata.basePath}/:filmSlugs`, async (req, res) => {
	await handlePlexAPIRequest(req, res, async (): Promise<plexTypes.MediaContainerResponse> => {
		console.log(`got request for letterboxd movie ${req.params.filmSlugs}`);
		const filmSlugsStr = req.params.filmSlugs?.trim();
		if(!filmSlugsStr) {
			throw httpError(400, "No slug was provided");
		}
		const filmSlugs = filmSlugsStr.split(',');
		return await pseuplex.letterboxd.metadata.get(filmSlugs);
	});
});

app.get(pseuplex.letterboxd.hubs.userFollowingActivity.path, async (req, res) => {
	await handlePlexAPIRequest(req, res, async (): Promise<plexTypes.MediaContainerResponse> => {
		const username = stringParam(req.query['username']);
		const count = intParam(req.query['count']);
		console.log(`got request for letterboxd following feed for user ${username} (count=${count})`);
		if(!username) {
			throw httpError(400, "No user provided");
		}
		return await pseuplex.letterboxd.hubs.userFollowingActivity.get({
			username: username,
			count: count
		});
	});
});

// proxy requests to plex
app.get('/hubs', plexApiProxy(cfg, args, {
	requestModifier: (proxyReqOpts, userReq) => {
		return proxyReqOpts;
	},
	responseModifier: async (proxyRes, resData: plexTypes.MediaContainerResponse, userReq, userRes) => {
		const letterboxdHub = await pseuplex.letterboxd.hubs.userFollowingActivity.get({
			username: 'luisfinke'
		});
		resData.MediaContainer.$.size += 1;
		resData.MediaContainer.Hub.splice(0, 0, letterboxdHub.MediaContainer.Hub[0]);
		return resData;
	}
}));

// proxy requests to plex
app.use(plexThinProxy(cfg, args));

const server = httpolyglot.createServer({
	key: fs.readFileSync(cfg.ssl.keyPath),
	cert: fs.readFileSync(cfg.ssl.certPath)
}, app);

// start server
server.listen(cfg.port, () => {
	console.log(`${constants.APP_NAME} is listening at localhost:${cfg.port}\n`);
});
