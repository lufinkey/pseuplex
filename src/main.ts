import url from 'url';
import fs from 'fs';
import httpolyglot from 'httpolyglot';
import express from 'express';
import { readConfigFile } from './config';
import * as constants from './constants';
import { parseCmdArgs } from './cmdargs';
import {
	plexApiProxy } from './proxy';

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

// proxy requests to plex
app.use(plexApiProxy(cfg, args, {
	requestModifier: (proxyReqOpts, userReq) => {
		return proxyReqOpts;
	},
	responseModifier: (proxyRes, proxyResData, userReq, userRes) => {
		return proxyResData;
	}
}));

const server = httpolyglot.createServer({
	key: fs.readFileSync(cfg.ssl.keyPath),
	cert: fs.readFileSync(cfg.ssl.certPath)
}, app);

// start server
server.listen(cfg.port, () => {
	console.log(`${constants.APP_NAME} is listening at http://localhost:${cfg.port}\n`);
});
