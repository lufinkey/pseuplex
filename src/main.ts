import url from 'url';
import fs from 'fs';
import express from 'express';
import { readConfigFile } from './config';
import * as constants from './constants';
import { parseCmdArgs } from './cmdargs';
import {
	plexProxy,
	plexJsonProxy } from './proxy';

// parse command line arguments
const args = parseCmdArgs(process.argv.slice(2));
if(!args.configPath) {
	console.error("No config path specified");
	process.exit(1);
}

// load config
const cfg = readConfigFile(args.configPath);

// prepare server
const app = express();
app.use('*', plexProxy(cfg));

// start server
app.listen(cfg.port, () => {
	console.log(`${constants.APP_NAME} is listening at http://localhost:${cfg.port}`);
});
