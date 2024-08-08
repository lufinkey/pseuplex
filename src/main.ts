import url from 'url';
import qs from 'querystring';
import fs from 'fs';
import httpolyglot from 'httpolyglot';
import express from 'express';
import { readConfigFile } from './config';
import * as constants from './constants';
import { parseCmdArgs } from './cmdargs';
import * as appPaths from './paths';
import {
	plexProxy,
	plexThinProxy,
	plexApiProxy } from './plex/proxy';
import * as plexTypes from './plex/types';
import { handlePlexAPIRequest } from './plex/requesthandling';
import * as pseuLetterboxd from './letterboxd';
import { httpError } from './utils';

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
app.get(`${appPaths.letterboxdMetadataBasePath}/:filmSlugs`, async (req, res) => {
	await handlePlexAPIRequest(req, res, async (): Promise<plexTypes.MediaContainerResponse> => {
		const filmSlugsStr = req.params.filmSlugs?.trim();
		if(!filmSlugsStr) {
			throw httpError(400, "No slug was provided");
		}
		const filmSlugs = filmSlugsStr.split(',');
		const metadatas = await pseuLetterboxd.getLetterboxdMetadataItems(filmSlugs, {
			letterboxdMetadataBasePath: appPaths.letterboxdMetadataBasePath
		});
		return {
			MediaContainer: {
				[constants.XML_ATTRIBUTES_CHAR]: {
					size: metadatas.length,
					allowSync: false,
					augmentationKey: '/library/metadata/augmentations/1',
					librarySectionID: constants.LETTERBOXD_LIBRARY_SECTION_ID,
					librarySectionTitle: constants.LETTERBOXD_LIBRARY_SECTION_TITLE,
					librarySectionUUID: constants.LETTERBOXD_LIBRARY_SECTION_GUID
				},
				Metadata: metadatas
			}
		};
	});
});

const testLetterboxdHub = pseuLetterboxd.letterboxdUserFollowingActivityFeedHub('lufinkey', {
	title: "Letterboxd Following Feed",
	context: 'hub.letterboxd.following',
	hubPath: `${appPaths.letterboxdFollowingActivityPath}?username=lufinkey`,
	style: plexTypes.PlexHubStyle.Hero,
	letterboxdMetadataBasePath: appPaths.letterboxdMetadataBasePath
});
app.get(`${appPaths.letterboxdFollowingActivityPath}`, async (req, res) => {
	await handlePlexAPIRequest(req, res, async (): Promise<plexTypes.MediaContainerResponse> => {
		const username = req.query['username'];
		const count = req.query['count'];
		if(username !== 'lufinkey') {
			throw httpError(404, "Unknown user");
		}
		return {
			MediaContainer: {
				[constants.XML_ATTRIBUTES_CHAR]: {
					size: 1,
					allowSync: false,
					librarySectionID: constants.LETTERBOXD_LIBRARY_SECTION_ID,
					librarySectionTitle: constants.LETTERBOXD_LIBRARY_SECTION_TITLE,
					librarySectionUUID: constants.LETTERBOXD_LIBRARY_SECTION_GUID
				},
				Hub: [
					await testLetterboxdHub({
						count: (typeof count === 'string' && count) ? Number.parseInt(count) : undefined
					})
				]
			}
		};
	});
});

// proxy requests to plex
app.use('/media/providers', plexApiProxy(cfg, args, {
	requestModifier: (proxyReqOpts, userReq) => {
		return proxyReqOpts;
	},
	responseModifier: (proxyRes, proxyResData, userReq, userRes) => {
		return proxyResData;
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
