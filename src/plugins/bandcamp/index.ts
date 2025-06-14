
import express from 'express';
import * as plexTypes from '../../plex/types';
import { IncomingPlexAPIRequest } from '../../plex/requesthandling';
import {
	PseuplexApp,
	PseuplexPlugin,
	PseuplexPluginClass,
	PseuplexReadOnlyResponseFilters
} from '../../pseuplex';
import { BandcampPluginConfig } from './config';


export default (class BandcampPlugin implements PseuplexPlugin {
	static slug = 'bandcamp';
	readonly slug = BandcampPlugin.slug;
	readonly app: PseuplexApp;

	constructor(app: PseuplexApp) {
		this.app = app;
	}

	get config(): BandcampPluginConfig {
		return this.app.config;
	}

	responseFilters?: PseuplexReadOnlyResponseFilters = {
		//
	}

	defineRoutes(router: express.Express) {
		//
	}

} as PseuplexPluginClass);
