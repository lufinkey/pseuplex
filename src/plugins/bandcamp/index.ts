import express from 'express';
import bandcamp from 'bandcamp-retriever';
import tough from 'tough-cookie';
import FileCookieStore, { FileFormat } from 'tough-cookie-file-store';
import * as plexTypes from '../../plex/types';
import { IncomingPlexAPIRequest } from '../../plex/requesthandling';
import { PlexServerAccountInfo } from '../../plex/accounts';
import {
	PseuplexApp,
	PseuplexHub,
	PseuplexHubProvider,
	PseuplexHubProviderBase,
	PseuplexMetadataProvider,
	PseuplexPlugin,
	PseuplexPluginClass,
	PseuplexReadOnlyResponseFilters,
	PseuplexRequestContext
} from '../../pseuplex';
import { BandcampPluginConfig } from './config';
import { BandcampPluginDef } from './plugindef';
import { createFanFeedHub } from './hubs';
import { BandcampMetadataProvider } from './metadata';
import { parseStringQueryParam } from '../../utils/queryparams';

export default (class BandcampPlugin implements BandcampPluginDef, PseuplexPlugin {
	static slug = 'bandcamp';
	readonly slug = BandcampPlugin.slug;
	readonly app: PseuplexApp;
	readonly metadata: BandcampMetadataProvider;
	readonly hubs: {
		readonly fanFeed: PseuplexHubProvider & {readonly path: string};
	};

	private _bandcampClients: {[cookesFile: string]: bandcamp.Bandcamp} = {};
	private _sharedBandcampClient: bandcamp.Bandcamp;

	constructor(app: PseuplexApp) {
		this.app = app;
		const self = this;

		this._sharedBandcampClient = new bandcamp.Bandcamp();

		// create hub providers
		this.hubs = {
			fanFeed: new class extends PseuplexHubProviderBase {
				readonly path = `${self.basePath}/hubs/fanFeed`;
				override transformHubID(id: undefined, context: PseuplexRequestContext): (string | Promise<string>) {
					const cookiesFile = self.config.perUser?.[context.plexUserInfo.email]?.cookiesFile;
					if(!cookiesFile) {
						throw new Error("Bandcamp hasn't been configured for this user");
					}
					return cookiesFile;
				}
				override fetch(cookiesFile: string): PseuplexHub | Promise<PseuplexHub> {
					const bandcampClient = self.bandcampClientForCookiesFile(cookiesFile);
					if(!bandcampClient) {
						throw new Error("No bandcamp client available for plex user");
					}
					return createFanFeedHub({
						...app.requiredHubMetadataTransformOptions(),
						bandcampClient,
						hubPath: this.path,
						style: plexTypes.PlexHubStyle.Shelf,
						promoted: true,
						uniqueItemsOnly: true,
						bandcampMetadataProvider: self.metadata,
						//section: section,
						//matchToPlexServerMetadata: true
						logger: app.logger,
					});
				}
			}(),
		};

		// create metadata provider
		this.metadata = new BandcampMetadataProvider({
			plugin: this,
			basePath: `${this.basePath}/metadata`,
			//section: this.section,
			plexMetadataClient: this.app.plexMetadataClient,
			//similarItemsHubProvider: this.hubs.similar,
			plexIdToInfoCache: this.app.plexIdToInfoCache,
		});
	}

	get basePath(): string {
		return `/${this.app.slug}/${this.slug}`;
	}

	get metadataProviders(): PseuplexMetadataProvider[] {
		return [this.metadata];
	}

	get config(): BandcampPluginConfig {
		return this.app.config;
	}
	
	responseFilters?: PseuplexReadOnlyResponseFilters = {
		//
	}

	defineRoutes(router: express.Express) {
		// get bandcamp fan feed as a hub
		router.get(this.hubs.fanFeed.path, [
			this.app.middlewares.plexAuthentication,
			this.app.middlewares.plexAPIRequestHandler(async (req: IncomingPlexAPIRequest, res): Promise<plexTypes.PlexMetadataPage> => {
				const context = this.app.contextForRequest(req);
				const params = plexTypes.parsePlexHubPageParams(req, {fromListPage:false});
				const hub = await this.hubs.fanFeed.get({context});
				return await hub.getHubPage({
					...params,
					listStartToken: parseStringQueryParam(req.query['listStartToken'])
				}, context);
			})
		]);
	}



	bandcampClientForPlexUser(plexUserInfo: PlexServerAccountInfo): bandcamp.Bandcamp {
		const cookiesFile = this.config.perUser?.[plexUserInfo.email]?.cookiesFile;
		if(cookiesFile) {
			return this.bandcampClientForCookiesFile(cookiesFile);
		}
		return this._sharedBandcampClient;
	}

	bandcampClientForCookiesFile(cookiesFile: string) {
		let bandcampClient = this._bandcampClients[cookiesFile];
		if(!bandcampClient) {
			bandcampClient = new bandcamp.Bandcamp({
				cookies: new FileCookieStore(cookiesFile, {
					async: true,
					loadAsync: true,
					fileFormat: FileFormat.txt,
					forceParse: true,
					onLoadLineError: (line, lineNumber) => {
						console.warn(`Cookies file ${cookiesFile}: Invalid cookie on line ${lineNumber}`);
					},
					onLoadError: (error) => {
						console.error(error);
					},
				})
			});
			this._bandcampClients[cookiesFile] = bandcampClient;
		}
		return bandcampClient;
	}

} as PseuplexPluginClass);
