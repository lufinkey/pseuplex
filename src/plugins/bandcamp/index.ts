import express from 'express';
import bandcamp from 'bandcamp-retriever';
import tough from 'tough-cookie';
import FileCookieStore from 'tough-cookie-file-store';
import * as plexTypes from '../../plex/types';
import { IncomingPlexAPIRequest } from '../../plex/requesthandling';
import {
	PseuplexApp,
	PseuplexPlugin,
	PseuplexPluginClass,
	PseuplexReadOnlyResponseFilters
} from '../../pseuplex';
import { BandcampPluginConfig } from './config';
import { BandcampPluginDef } from './plugindef';
import { PlexServerAccountInfo } from '../../plex/accounts';

export default (class BandcampPlugin implements BandcampPluginDef, PseuplexPlugin {
	static slug = 'bandcamp';
	readonly slug = BandcampPlugin.slug;
	readonly app: PseuplexApp;
	private _bandcampClients: {[cookesFile: string]: bandcamp.Bandcamp} = {};
	private _sharedBandcampClient: bandcamp.Bandcamp;

	constructor(app: PseuplexApp) {
		this.app = app;
		this._sharedBandcampClient = new bandcamp.Bandcamp();
	}

	get config(): BandcampPluginConfig {
		return this.app.config;
	}

	getBandcampClient(plexUserInfo: PlexServerAccountInfo): bandcamp.Bandcamp {
		const cookiesFile = this.config.perUser?.[plexUserInfo.email]?.cookiesFile;
		if(cookiesFile) {
			let bandcampClient = this._bandcampClients[cookiesFile];
			if(!bandcampClient) {
				bandcampClient = new bandcamp.Bandcamp({
					cookies: new FileCookieStore(cookiesFile, {
						async: true,
						loadAsync: true,
					})
				});
				this._bandcampClients[cookiesFile] = bandcampClient;
			}
			return bandcampClient;
		}
		return this._sharedBandcampClient;
	}
	

	responseFilters?: PseuplexReadOnlyResponseFilters = {
		//
	}

	defineRoutes(router: express.Express) {
		//
	}

} as PseuplexPluginClass);
