import express from 'express';
import * as plexTypes from '../../plex/types';
import { IncomingPlexAPIRequest } from '../../plex/requesthandling';
import {
	PseuplexApp,
	PseuplexPlugin,
	PseuplexPluginClass,
	PseuplexHubProvider,
	PseuplexRequestContext,
	PseuplexMetadataProvider
} from '../../pseuplex';
import { JustWatchPluginConfig } from './config';
import { JustWatchHubConfig, JustWatchObjectType, JustWatchLanguage, JustWatchCountry, JustWatchSortBy } from './types';
import { JustWatchHub } from './hub';
import { JustWatchMetadataProvider } from './metadata';
import { httpError } from '../../utils/error';

export default (class JustWatchPlugin implements PseuplexPlugin {
	static slug = 'justwatch';
	readonly slug = JustWatchPlugin.slug;
	readonly app: PseuplexApp;
	readonly metadata: JustWatchMetadataProvider;
	readonly hubs: {
		readonly popularTitles: PseuplexHubProvider;
	};

	constructor(app: PseuplexApp) {
		this.app = app;
		const self = this;

		// Create metadata provider
		this.metadata = new JustWatchMetadataProvider({
			basePath: `${this.basePath}/metadata`,
			plexMetadataClient: this.app.plexMetadataClient,
			relatedHubsProviders: [],
			//plexGuidToInfoCache: this.app.plexGuidToInfoCache,
		});

		// Create hub providers
		this.hubs = {
			popularTitles: new class extends PseuplexHubProvider {
				readonly basePath = `${self.basePath}/hubs/popularTitles`;
				
				override async get(id: string | any): Promise<JustWatchHub> {
					// Convert to string only if it's not already a string
					const stringId = typeof id === 'string' ? id : JSON.stringify(id);
					return super.get(stringId) as Promise<JustWatchHub>;
				}
				
				override fetch(configInput: string | any): JustWatchHub {
					// Parse the config from JSON string or object
					let config: JustWatchHubConfig;
					let configString: string;
					
					try {
						// Handle both string and object inputs
						if (typeof configInput === 'string') {
							configString = configInput;
							config = JSON.parse(configInput);
						} else {
							// configInput is actually a config object (dashboard case)
							config = configInput as JustWatchHubConfig;
							configString = JSON.stringify(config);
						}
					} catch (error) {
						// Fallback to default config
						config = {
							first: 15,
							objectType: JustWatchObjectType.Movie,
							packages: ['']
						};
						configString = JSON.stringify(config);
					}
					
					const hub = new JustWatchHub({
						hubPath: `${this.basePath}?${this._createQueryString(config)}`,
						title: this._createTitle(config),
						type: config.objectType === JustWatchObjectType.Show ? plexTypes.PlexMediaItemType.TVShow : plexTypes.PlexMediaItemType.Movie,
						style: plexTypes.PlexHubStyle.Shelf,
						hubIdentifier: `custom.justwatch.${config.objectType?.toLowerCase() || 'movie'}.${config.packages?.join('-').toLowerCase() || 'all'}`,
						context: 'hub.custom.justwatch.popular',
						defaultItemCount: config.first || 15,
						uniqueItemsOnly: false,
						config: config,
						justWatchMetadataProvider: self.metadata
					});
					return hub;
				}

				private _createTitle(config: JustWatchHubConfig): string {
					// Use custom title if provided, otherwise generate default title
					if (config.title) {
						return config.title;
					}
					
					const objectType = config.objectType === JustWatchObjectType.Show ? 'Shows' : 'Movies';
					const packages = config.packages?.join(', ') || 'All Platforms';
					return `Popular ${objectType} on ${packages}`;
				}

				private _createQueryString(config: JustWatchHubConfig): string {
					const params = new URLSearchParams();
					
					if (config.title) params.set('title', config.title);
					if (config.first) params.set('first', config.first.toString());
					if (config.objectType) params.set('objectType', config.objectType);
					if (config.packages && config.packages.length > 0) params.set('packages', config.packages.join(','));
					if (config.language) params.set('language', config.language);
					if (config.country) params.set('country', config.country);
					if (config.popularTitlesSortBy) params.set('sortBy', config.popularTitlesSortBy);
					if (config.monetizationTypes && config.monetizationTypes.length > 0) params.set('monetizationTypes', config.monetizationTypes.join(','));
					if (config.genres && config.genres.length > 0) params.set('genres', config.genres.join(','));
					if (config.excludeGenres && config.excludeGenres.length > 0) params.set('excludeGenres', config.excludeGenres.join(','));
					
					return params.toString();
				}
			}()
		};
	}

	get basePath(): string {
		return `/${this.app.slug}/${this.slug}`;
	}

	get metadataProviders(): PseuplexMetadataProvider[] {
		return [this.metadata];
	}

	get config(): JustWatchPluginConfig {
		return this.app.config;
	}

	defineRoutes(router: express.Express) {
		// Get metadata item(s)
		router.get(`${this.metadata.basePath}/:id`, [
			this.app.middlewares.plexAuthentication,
			this.app.middlewares.plexRequestHandler(async (req: IncomingPlexAPIRequest, res): Promise<plexTypes.PlexMetadataPage> => {
				console.log(`\ngot request for justwatch item ${req.params.id}`);
				const context = this.app.contextForRequest(req);
				const params: plexTypes.PlexMetadataPageParams = req.plex.requestParams;
				const itemIdsStr = req.params.id?.trim();
				if(!itemIdsStr) {
					throw httpError(400, "No title ID was provided");
				}
				const metadataIds = itemIdsStr.split(',');
				// get metadatas from justwatch
				const metadataProvider = this.metadata;
				const resData = await metadataProvider.get(metadataIds, {
					context: context,
					includePlexDiscoverMatches: true,
					includeUnmatched: true,
					transformMatchKeys: true,
					metadataBasePath: metadataProvider.basePath,
					qualifiedMetadataIds: false,
					plexParams: params,
				});
				// cache metadata access if needed
				if(metadataIds.length == 1) {
					this.app.pluginMetadataAccessCache?.cachePluginMetadataAccessIfNeeded(metadataProvider, metadataIds[0], req.path, resData.MediaContainer.Metadata, context);
				}
				return resData;
			})
		]);

		// Get JustWatch popular titles as a hub with query parameters
		router.get(`${this.basePath}/hubs/popularTitles`, [
			this.app.middlewares.plexAuthentication,
			this.app.middlewares.plexRequestHandler(async (req: IncomingPlexAPIRequest, res): Promise<plexTypes.PlexHubPage> => {
				const context = this.app.contextForRequest(req);
				const params = plexTypes.parsePlexHubPageParams(req, { fromListPage: false });
				
				// Build config from query parameters
				const config: JustWatchHubConfig = {
					title: req.query.title as string || undefined,
					first: req.query.first ? parseInt(req.query.first as string) : 15,
					objectType: (req.query.objectType as JustWatchObjectType) || JustWatchObjectType.Movie,
					packages: req.query.packages ? (req.query.packages as string).split(',') : [''],
					language: (req.query.language as JustWatchLanguage) || JustWatchLanguage.English,
					country: (req.query.country as JustWatchCountry) || JustWatchCountry.Netherlands,
					popularTitlesSortBy: (req.query.sortBy as JustWatchSortBy) || JustWatchSortBy.Popular,
					monetizationTypes: req.query.monetizationTypes ? (req.query.monetizationTypes as string).split(',') : [],
					genres: req.query.genres ? (req.query.genres as string).split(',') : [],
					excludeGenres: req.query.excludeGenres ? (req.query.excludeGenres as string).split(',') : []
				};
				
				const hub = await this.hubs.popularTitles.get(JSON.stringify(config));
				return await hub.getHubPage(params, context);
			})
		]);
	}

} as PseuplexPluginClass);
