
import express from 'express';
import * as plexTypes from '../../plex/types';
import { IncomingPlexAPIRequest } from '../../plex/requesthandling';
import {
	PseuplexApp,
	PseuplexMetadataProvider,
	PseuplexPlugin,
	PseuplexPluginClass,
	PseuplexReadOnlyResponseFilters
} from '../../pseuplex';
//import { TemplateMetadataProvider } from './metadata'; // uncomment if defining a custom metadata provider
import { TemplatePluginConfig } from './config';
import { TemplatePluginDef } from './plugindef';

export default (class TemplatePlugin implements TemplatePluginDef, PseuplexPlugin {
	static slug = '<plugin_name>';
	readonly slug = TemplatePlugin.slug;
	readonly app: PseuplexApp;
	//readonly metadata: TemplateMetadataProvider; // uncomment if defining a custom metadata provider

	constructor(app: PseuplexApp) {
		this.app = app;

		// create custom metadata provider
		/*this.metadata = new TemplateMetadataProvider({
			basePath: `${this.basePath}/metadata`,
			plexMetadataClient: this.app.plexMetadataClient,
			relatedHubsProviders: [
				//this.hubs.similar, // if you define a "similar items" hub in this plugin, you can include that
			],
			plexIdToInfoCache: this.app.plexIdToInfoCache,
		});*/
	}

	// if you define custom routes or a metadata provider, its useful to have a common base path
	/*get basePath(): string {
		return `/${this.app.slug}/${this.slug}`;
	}*/

	get metadataProviders(): PseuplexMetadataProvider[] {
		return [
			//this.metadata // if you want the plugin to define a custom metadata provider
		];
	}

	get config(): TemplatePluginConfig {
		return this.app.config;
	}

	responseFilters?: PseuplexReadOnlyResponseFilters = {
		// TODO define any functions to modify plex server responses
	}

	defineRoutes(router: express.Express) {
		// TODO define any custom routes
	}

} satisfies PseuplexPluginClass);
