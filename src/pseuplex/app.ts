import http from 'http';
import https from 'https';
import stream from 'stream';
import qs from 'querystring';
import express from 'express';
import httpolyglot from 'httpolyglot';
import sharp from 'sharp';
import * as plexTypes from '../plex/types';
import * as plexServerAPI from '../plex/api';
import { PlexServerPropertiesStore } from '../plex/serverproperties';
import {
	PlexServerAccountInfo,
	PlexServerAccountsStore
} from '../plex/accounts';
import {
	PlexIdToInfoCache,
	createPlexServerIdToGuidCache,
} from '../plex/metadata';
import {
	parseMetadataIDFromKey,
	parsePlexMetadataGuid,
} from '../plex/metadataidentifier';
import {
	PseuplexMetadataAccessCache,
	PseuplexMetadataAccessCacheOptions
} from './metadataAccessCache';
import {
	plexApiProxy,
	plexHttpProxy,
	PlexProxyOptions,
} from '../plex/proxy';
import {
	createPlexAuthenticationMiddleware,
	IncomingPlexAPIRequest,
	PlexAPIRequestHandler,
	plexAPIRequestHandler,
	PlexAPIRequestHandlerOptions,
	PlexAuthedRequestHandler
} from '../plex/requesthandling';
import { PlexClient } from '../plex/client';
import {
	PlexNotificationSender,
	PlexNotificationSenderType,
	SendPlexNotificationOptions,
	sendPlexNotifications,
	WebsocketNotificationsEndpoint,
} from '../plex/notifications';
import * as extPlexTransform from './externalplex/transform';
import {
	PseuplexMetadataPage,
	PseuplexMetadataItem,
	PseuplexMetadataSource,
	PseuplexServerProtocol,
	PseuplexRequestContext,
	PseuplexMetadataChildrenPage,
} from './types';
import { PseuplexConfigBase } from './configbase';
import {
	stringifyPartialMetadataID,
	stringifyMetadataID,
	PseuplexMetadataIDParts,
	parseMetadataID,
} from './metadataidentifier';
import {
	PseuplexMetadataPathTransformOptions,
	PseuplexMetadataProvider,
	PseuplexMetadataProviderParams,
	PseuplexMetadataTransformOptions,
	PseuplexRelatedHubsParams,
	PseuplexRelatedHubsSource,
} from './metadata';
import {
	PseuplexClientWebSocketInfo,
	PseuplexPossiblyConfirmedClientWebSocketInfo,
} from './types/websocket';
import {
	PseuplexEventSourceSubscriber
} from './types/eventsource';
import {
	PseuplexPlugin,
	PseuplexResponseFilterName,
	PseuplexResponseFilters,
} from './plugin';
import {
	parseMetadataIdFromPathParam,
	parseMetadataIdsFromPathParam,
	pseuplexMetadataIdRequestMiddleware,
	pseuplexMetadataIdsRequestMiddleware,
	PseuplexRemappedMetadataIdsRequest,
	remapPublicToPrivateMetadataIdMiddleware,
	remapPublicToPrivateMetadataIdsMiddleware
} from './requesthandling';
import { PseuplexHubMetadataTransformOptions } from './hub';
import {
	PseuplexIDRemappings,
	PseuplexPrivateToPublicIDsMap,
} from './idmappings';
import { PseuplexSection } from './section';
import {
	sendMediaUnavailableNotifications,
	sendMetadataRefreshTimelineNotifications,
} from './notifications';
import { Logger } from '../logging';
import { CachedFetcher } from '../fetching/CachedFetcher';
import { httpError, HttpResponseError } from '../utils/error';
import {
	asyncRequestHandler,
	expressErrorHandler,
	requestIsEncrypted
} from '../utils/requesthandling';
import {
	parseURLPath,
	stringifyURLPath,
	forArrayOrSingle,
	forArrayOrSingleAsyncParallel,
	transformArrayOrSingle,
	transformArrayOrSingleAsyncParallel,
	intParam,
	parseURLPathParts,
	findInArrayOrSingle,
} from '../utils/misc';
import { IPv4NormalizeMode } from '../utils/ip';
import type { WebSocketEventMap } from '../utils/websocket';
import { applyOverlayToImage } from '../utils/images';


// plugins

type ResponseFilterDefinition<TFilter> = {
	slug: string;
	filter: TFilter;
};
export type PseuplexResponseFilterOrders = { [filterName in PseuplexResponseFilterName]: string[]; };
export type PseuplexResponseFilterLists = { [filterName in PseuplexResponseFilterName]?: ResponseFilterDefinition<PseuplexResponseFilters[filterName]>[] };
export type PseuplexPluginClass = {
	readonly slug: string;
	new(app: PseuplexApp): PseuplexPlugin;
};


// app

type PseuplexAppMetadataParams = {
	plexParams?: plexTypes.PlexMetadataPageParams;
	context: PseuplexRequestContext;
	cachePluginMetadataAccess?: boolean;
};

type PseuplexAppMetadataChildrenParams = {
	plexParams?: plexTypes.PlexMetadataChildrenPageParams;
	context: PseuplexRequestContext;
	cachePluginMetadataAccess?: boolean;
};

type PseuplexAppConfig = PseuplexConfigBase<{[key: string]: any}>;

type PseuplexPlexServerNotificationsOptions = {
	socketRetryInterval?: number;
};

type PseuplexPlayQueueURIResolverOptions = {
	plexMachineIdentifier: string;
	context: PseuplexRequestContext;
};

export type PseuplexAppOptions = {
	slug?: string;
	protocol?: PseuplexServerProtocol;
	httpPort?: number;
	httpsPort?: number;
	ipv4ForwardingMode?: IPv4NormalizeMode;
	forwardMetadataRefreshToPluginMetadata?: boolean;
	sendMetadataUnavailability?: boolean;
	overwritePlexPrivatePort?: number | boolean;
	alwaysUseLibraryMetadataPath?: boolean;
	serverOptions: https.ServerOptions;
	plexServerURL: string;
	plexAdminAuthContext: plexTypes.PlexAuthContext;
	plexMetadataClient: PlexClient;
	pluginMetadataAccessCacheOptions?: PseuplexMetadataAccessCacheOptions;
	plexServerNotifications?: PseuplexPlexServerNotificationsOptions;
	overlaysEnabled?: boolean;
	overlayImageOverrides?: {
		[imageName: string]: string
	}
	logger?: Logger;
	responseFilterOrders?: PseuplexResponseFilterOrders;
	plugins?: PseuplexPluginClass[];
	config: PseuplexAppConfig;
	mapPseuplexMetadataIds?: boolean;
};

const overlayImageNameRegex = /^[a-z0-9 ._-]+$/i;

export class PseuplexApp {
	readonly slug: string;
	readonly config: PseuplexAppConfig;
	readonly httpPort?: number;
	readonly httpsPort?: number;
	readonly forwardsMetadataRefreshToPluginMetadata: boolean;
	readonly sendsMetadataUnavailability: boolean;
	readonly overwritePlexPrivatePort: number | boolean;
	readonly logger?: Logger;
	readonly plexServerNotificationsOptions: PseuplexPlexServerNotificationsOptions;
	readonly plugins: { [slug: string]: PseuplexPlugin } = {};
	readonly metadataProviders: { [sourceSlug: string]: PseuplexMetadataProvider } = {};
	readonly responseFilters: PseuplexResponseFilterLists = {};
	readonly alwaysUseLibraryMetadataPath: boolean;
	readonly metadataIdMappings?: PseuplexIDRemappings;

	readonly plexServerURL: string;
	readonly plexAdminAuthContext: plexTypes.PlexAuthContext;
	readonly plexServerProperties: PlexServerPropertiesStore;
	readonly plexServerAccounts: PlexServerAccountsStore;
	readonly plexServerIdToGuidCache: CachedFetcher<string | null | undefined>;
	readonly plexIdToInfoCache?: PlexIdToInfoCache;
	readonly pluginMetadataAccessCache?: PseuplexMetadataAccessCache;
	readonly plexMetadataClient: PlexClient;

	readonly clientWebSockets: {
		[plexToken: string]: PseuplexPossiblyConfirmedClientWebSocketInfo[]
	} = {};
	readonly eventSourceSubscribers: {
		[plexToken: string]: PseuplexEventSourceSubscriber[]
	} = {};

	readonly overlayedImageEndpoint?: string | undefined;
	readonly overlayImageCache?: CachedFetcher<Buffer>;
	readonly overlayImageOverrides?: {
		[imageName: string]: string
	}
	
	private _plexServerNotificationsSocket?: WebSocket | undefined;
	private _listeningToPlexServerNotifications: boolean;
	private _plexServerNotificationsSocketRetryTimeout?: NodeJS.Timeout | undefined;

	readonly middlewares: {
		plexAuthentication: express.RequestHandler;
		plexServerOwnerOnly: PlexAuthedRequestHandler;
		plexRequestHandler: <TResult>(handler: PlexAPIRequestHandler<TResult>) => ((req: express.Request, res: express.Response) => Promise<void>)
	};

	httpServer?: http.Server;
	httpsServer?: https.Server;
	httpolyglotServer?: httpolyglot.Server;

	constructor(options: PseuplexAppOptions) {
		const httpPort = (options.httpPort && (!options.protocol || options.protocol == PseuplexServerProtocol.http || options.protocol == PseuplexServerProtocol.httpolyglot))
			? options.httpPort
			: undefined;
		const httpsPort = (options.httpsPort && (!options.protocol || options.protocol == PseuplexServerProtocol.https || options.protocol == PseuplexServerProtocol.httpolyglot))
			? options.httpsPort
			: undefined;
		if(!httpPort && !httpsPort) {
			throw new Error("Server must listen on atleast 1 port");
		}
		this.slug = options.slug ?? 'pseuplex';
		this.config = options.config;
		this.httpPort = httpPort;
		this.httpsPort = httpsPort;
		this.forwardsMetadataRefreshToPluginMetadata = options.forwardMetadataRefreshToPluginMetadata ?? true;
		this.sendsMetadataUnavailability = options.sendMetadataUnavailability ?? true;
		this.overwritePlexPrivatePort = options.overwritePlexPrivatePort ?? true;
		this.alwaysUseLibraryMetadataPath = (options.mapPseuplexMetadataIds || this.forwardsMetadataRefreshToPluginMetadata || options.alwaysUseLibraryMetadataPath) ?? false;
		this.plexServerNotificationsOptions = options.plexServerNotifications ?? {};
		this.logger = options.logger;
		if(options.mapPseuplexMetadataIds) {
			this.metadataIdMappings = PseuplexIDRemappings.create();
		}
		
		// define properties
		this.plexServerURL = options.plexServerURL;
		this.plexAdminAuthContext = options.plexAdminAuthContext;
		this.plexServerProperties = new PlexServerPropertiesStore({
			serverURL: this.plexServerURL,
			authContext: this.plexAdminAuthContext,
			logger: this.logger,
		});
		this.plexServerAccounts = new PlexServerAccountsStore({
			plexServerProperties: this.plexServerProperties,
			logger: this.logger,
		});
		this.plexMetadataClient = options.plexMetadataClient;
		this.plexServerIdToGuidCache = createPlexServerIdToGuidCache({
			serverURL: this.plexServerURL,
			authContext: this.plexAdminAuthContext,
			logger: this.logger,
		});
		this.plexIdToInfoCache = new PlexIdToInfoCache({
			plexMetadataClient: this.plexMetadataClient
		});
		this.pluginMetadataAccessCache = this
			? new PseuplexMetadataAccessCache(options.pluginMetadataAccessCacheOptions)
			: undefined;
		
		this.overlayImageOverrides = options.overlayImageOverrides;

		// define middlewares
		const plexReqHandlerOpts: PlexAPIRequestHandlerOptions = {
			logger: this.logger,
		};
		this.middlewares = {
			plexAuthentication: createPlexAuthenticationMiddleware(this.plexServerAccounts),
			plexServerOwnerOnly: (req: IncomingPlexAPIRequest, res, next) => {
				if(!req.plex) {
					next(httpError(500, "Cannot access endpoint without plex authentication"));
					return;
				}
				if (!req.plex.userInfo.isServerOwner) {
					next(httpError(403, "Get out of here you sussy baka"));
					return;
				}
				next();
			},
			plexRequestHandler: <TResult>(handler: PlexAPIRequestHandler<TResult>) => plexAPIRequestHandler(handler, plexReqHandlerOpts)
		};
		
		// loop through and instantiate plugins
		const responseFilterOrders = options.responseFilterOrders ?? {};
		const tmpPluginSlugsSet = new Set<string>();
		if(options.plugins && options.plugins.length > 0) {
			for(const pluginClass of options.plugins) {
				// instantiate plugin
				if(pluginClass.slug in this.plugins) {
					console.error(`Ignoring duplicate plugin slug '${pluginClass.slug}'`);
					continue;
				}
				if(!pluginClass.slug) {
					console.error(`Skipping plugin with no defined slug`);
					continue;
				}
				
				console.log(`Initializing ${pluginClass.slug} plugin`);
				let plugin: PseuplexPlugin;
				try {
					plugin = new pluginClass(this);
				} catch(error) {
					console.error(`Failed to initialize ${pluginClass.slug} plugin`);
					throw error;
				}
				
				// add plugin metadata providers
				const metadataProviders = plugin.metadataProviders;
				if(metadataProviders) {
					for(const metadataProvider of metadataProviders) {
						const metadataSlug = metadataProvider.sourceSlug;
						if(metadataSlug in this.metadataProviders) {
							console.error(`Ignoring duplicate metadata provider '${metadataProvider.sourceSlug}' in plugin '${pluginClass.slug}'`);
							continue;
						}
						this.metadataProviders[metadataSlug] = metadataProvider;
					}
				}

				// add plugin response filters
				const pluginResponseFilters = plugin.responseFilters;
				if(pluginResponseFilters) {
					for(const filterName of Object.keys(pluginResponseFilters)) {
						const pluginResponseFilter = pluginResponseFilters[filterName as PseuplexResponseFilterName];
						if(!pluginResponseFilter) {
							continue;
						}
						const filter: ResponseFilterDefinition<any> = {
							slug: pluginClass.slug,
							filter: pluginResponseFilter
						};
						// get or create list for filter
						let filterList = this.responseFilters[filterName as PseuplexResponseFilterName];
						if(!filterList) {
							filterList = [];
							this.responseFilters[filterName] = filterList;
						}
						// determine plugin order of filters
						const filterOrder = responseFilterOrders[filterName];
						const filterIndex = filterOrder ? filterOrder.indexOf(pluginClass.slug) : -1;
						if(filterIndex === -1) {
							// no order defined, so just add the filter
							filterList.push(filter);
							continue;
						}
						// filter has a defined order, so find any filters ahead of this filter
						tmpPluginSlugsSet.clear();
						for(let i=(filterIndex+1); i<filterOrder.length; i++) {
							tmpPluginSlugsSet.add(filterOrder[i]);
						}
						// loop through already-added filters and insert this one where needed
						let filterInsertIndex = 0;
						for(const existingFilter of filterList) {
							if(tmpPluginSlugsSet.has(existingFilter.slug)) {
								break;
							}
							filterInsertIndex++;
						}
						filterList.splice(filterInsertIndex, 0, filter);
					}
				}

				// add plugin
				this.plugins[pluginClass.slug] = plugin;
			}

			// extra space after initializing plugins
			console.log();
		}

		// create router and define routes
		const plexProxyArgs: PlexProxyOptions = {
			logger: this.logger,
			ipv4Mode: options.ipv4ForwardingMode
		};
		const router = express();

		// log request if needed
		router.use((req, res, next) => {
			this.logger?.logIncomingUserRequest(req);
			next();
		});

		// handle remapping public to private metadata IDs, if enabled
		if(this.metadataIdMappings) {
			const getIdReplacer = (pathPrefix: string) => {
				return (req: express.Request, newMetadataId: string) => {
					const path = req.path;
					if(!path.startsWith(pathPrefix)) {
						console.warn(`Request path cannot be remapped because it doesn't start with ${pathPrefix}`);
						return path;
					}
					const idsEndIndex = path.indexOf('/', pathPrefix.length);
					const trailingPath = idsEndIndex != -1 ? path.slice(idsEndIndex) : '';
					return `${pathPrefix}${newMetadataId}${trailingPath}`;
				};
			};

			router.get('/library/metadata/:metadataId', [
				remapPublicToPrivateMetadataIdsMiddleware(this.metadataIdMappings!, plexReqHandlerOpts, getIdReplacer('/library/metadata/'))
			]);

			router.get('/library/metadata/:metadataId/children', [
				remapPublicToPrivateMetadataIdMiddleware(this.metadataIdMappings!, plexReqHandlerOpts, getIdReplacer('/library/metadata/'))
			]);

			for(const hubsSource of Object.values(PseuplexRelatedHubsSource)) {
				const pathPrefix = `/${hubsSource}/metadata/`;
				router.get(`/${hubsSource}/metadata/:metadataId/related`, [
					remapPublicToPrivateMetadataIdMiddleware(this.metadataIdMappings!, plexReqHandlerOpts, getIdReplacer(pathPrefix))
				]);
			}

			router.post('/playQueues', [
				asyncRequestHandler(async (req, res) => {
					// parse url path
					const urlPathParts = parseURLPath(req.url);
					const queryItems = urlPathParts.queryItems;
					// TODO is very possible some platforms send the query in the body, so we should maybe handle that
					if(!queryItems) {
						return false;
					}
					// check for play queue uri
					let uriProp = queryItems['uri'];
					if(!uriProp) {
						return false;
					}
					// resolve play queue uri
					const plexMachineId = await this.plexServerProperties.getMachineIdentifier();
					let urisChanged = false;
					const libraryMetadataPrefix = '/library/metadata/';
					uriProp = transformArrayOrSingle(uriProp, (uri) => {
						const originalURI = uri;
						const uriParts = plexTypes.parsePlayQueueURI(uri);
						if(!uriParts.path || (uriParts.machineIdentifier != plexMachineId && uriParts.machineIdentifier != "x")) {
							return uri;
						}
						const metadataKeyParts = parseMetadataIDFromKey(uriParts.path, libraryMetadataPrefix);
						if(!metadataKeyParts) {
							return uri;
						}
						let idsChanged = false;
						// path is using /library/metadata
						let metadataIdStrings = metadataKeyParts.id.split(',');
						// remap if the path is using a mapped id
						for(let i=0; i<metadataIdStrings.length; i++) {
							const metadataIdString = metadataIdStrings[i];
							const metadataIdParts = parseMetadataIdFromPathParam(metadataIdString);
							if(!metadataIdParts.source) {
								const privateId = this.metadataIdMappings!.getPrivateIDFromPublicID(metadataKeyParts.id);
								if(privateId != null) {
									const escapedPrivateId = qs.escape(privateId);
									metadataIdStrings[i] = escapedPrivateId;
									idsChanged = true;
									console.log(`Remapped public metadata id ${metadataIdParts.id} to private id ${privateId}`);
								}
							}
						}
						// remake uri if ids changed
						if(!idsChanged) {
							return uri;
						}
						urisChanged = true;
						uriParts.path = `${libraryMetadataPrefix}${metadataIdStrings.join(',')}${metadataKeyParts.relativePath ?? ''}`;
						return plexTypes.stringifyPlayQueueURIParts(uriParts);
					});
					if(urisChanged) {
						queryItems['uri'] = uriProp;
						req.url = stringifyURLPath(urlPathParts);
					}
					return false;
				})
			]);
		}

		// define plugin routes early, so they can intercept requests
		for(const pluginSlug of Object.keys(this.plugins)) {
			const plugin = this.plugins[pluginSlug];
			plugin.defineRoutes?.(router);
		}

		router.get('/media/providers', [
			this.middlewares.plexAuthentication,
			plexApiProxy(this.plexServerURL, plexProxyArgs, {
				filter: async (req: IncomingPlexAPIRequest, res) => {
					const context = this.contextForRequest(req);
					return ((await this.hasPluginSections(context)) || (this.responseFilters?.mediaProviders?.length ?? 0) > 0);
				},
				responseModifier: async (proxyRes, resData: plexTypes.PlexServerMediaProvidersPage, userReq: IncomingPlexAPIRequest, userRes) => {
					const context = this.contextForRequest(userReq);
					// add sections
					const allSections = await this.getPluginSections(context);
					const sectionsFeature = resData.MediaContainer.MediaProvider[0].Feature.find((f) => f.type == plexTypes.PlexFeatureType.Content) as plexTypes.PlexContentFeature;
					if(sectionsFeature) {
						sectionsFeature.Directory.push(...await Promise.all(Array.from(allSections).map(async (section) => {
							return await section.getMediaProviderDirectory(context);
						})));
					}
					// filter response
					await this.filterResponse('mediaProviders', resData, { proxyRes, userReq, userRes });
					return resData;
				}
			})
		]);

		router.get(['/library/sections', '/library/sections/all'], [
			this.middlewares.plexAuthentication,
			plexApiProxy(this.plexServerURL, plexProxyArgs, {
				filter: async (req: IncomingPlexAPIRequest, res) => {
					const context = this.contextForRequest(req);
					return await this.hasPluginSections(context);
				},
				responseModifier: async (proxyRes, resData: plexTypes.PlexLibrarySectionsPage, userReq: IncomingPlexAPIRequest, userRes) => {
					const context = this.contextForRequest(userReq);
					const reqParams = userReq.plex.requestParams;
					// add sections
					const allSections = await this.getPluginSections(context);
					const existingSections = resData.MediaContainer.Directory ?? [];
					const newSections = await Promise.all(Array.from(allSections).map(async (section) => {
						return await section.getLibrarySectionsEntry(reqParams,context);
					}));
					existingSections.push(...newSections);
					resData.MediaContainer.Directory = existingSections;
					resData.MediaContainer.size = (resData.MediaContainer.size ?? 0) + newSections.length;
					return resData;
				}
			})
		]);

		router.get('/hubs', [
			this.middlewares.plexAuthentication,
			plexApiProxy(this.plexServerURL, plexProxyArgs, {
				responseModifier: async (proxyRes, resData: plexTypes.PlexLibraryHubsPage, userReq: IncomingPlexAPIRequest, userRes) => {
					const context = this.contextForRequest(userReq);
					const reqParams = userReq.plex.requestParams;
					// get hubs for each section
					// TODO maybe add some sort of sorting?
					const hubsPromisesForSections = (await this.getPluginSections(context)).map((section) => {
						return section.getHubsPage(reqParams, context);
					});
					// add hubs from sections
					const allSectionHubs: plexTypes.PlexHubWithItems[] = [];
					for(const sectionHubsPromise of hubsPromisesForSections) {
						const sectionHubs = (await sectionHubsPromise)?.MediaContainer?.Hub;
						if(sectionHubs && sectionHubs.length > 0) {
							allSectionHubs.push(...sectionHubs);
						}
					}
					if(allSectionHubs.length > 0) {
						resData.MediaContainer.Hub = allSectionHubs.concat(resData.MediaContainer.Hub ?? []);
						resData.MediaContainer.size += allSectionHubs.length;
						if(resData.MediaContainer.totalSize != null) {
							resData.MediaContainer.totalSize += allSectionHubs.length;
						}
					}
					// filter response
					await this.filterResponse('hubs', resData, { proxyRes, userReq, userRes });
					// remap IDs if needed (since filters may modify hubs)
					if(this.metadataIdMappings && resData.MediaContainer.Hub) {
						for(const hub of resData.MediaContainer.Hub) {
							this.remapHubMetadataIdsIfNeeded(hub);
						}
					}
					return resData;
				}
			})
		]);

		router.get('/hubs/promoted', [
			this.middlewares.plexAuthentication,
			plexApiProxy(this.plexServerURL, plexProxyArgs, {
				responseModifier: async (proxyRes, resData: plexTypes.PlexLibraryHubsPage, userReq: IncomingPlexAPIRequest, userRes) => {
					const context = this.contextForRequest(userReq);
					const reqParams = userReq.plex.requestParams;
					// get section IDs to include
					const contentDirectoryID = userReq.query?.['contentDirectoryID'];
					const contentDirIds = ((typeof contentDirectoryID == 'string') ? contentDirectoryID.split(',') : contentDirectoryID) as (string[] | undefined);
					// get promoted hubs for included sections
					// TODO maybe add some sort of sorting?
					const hubsPromisesForSections = (await this.getPluginSections(context)).map((section) => {
						// ensure we're including this section
						if(!contentDirIds || contentDirIds.findIndex((id) => (id == section.id)) == -1) {
							return null;
						}
						// get promoted hubs for this section
						return section.getPromotedHubsPage(reqParams, context);
					});
					// add hubs from sections
					const allSectionHubs: plexTypes.PlexHubWithItems[] = [];
					for(const sectionHubsPromise of hubsPromisesForSections) {
						const sectionHubs = (await sectionHubsPromise)?.MediaContainer?.Hub;
						if(sectionHubs && sectionHubs.length > 0) {
							allSectionHubs.push(...sectionHubs);
						}
					}
					if(allSectionHubs.length > 0) {
						resData.MediaContainer.Hub = allSectionHubs.concat(resData.MediaContainer.Hub ?? []);
						resData.MediaContainer.size += allSectionHubs.length;
						if(resData.MediaContainer.totalSize != null) {
							resData.MediaContainer.totalSize += allSectionHubs.length;
						}
					}
					// filter response
					await this.filterResponse('promotedHubs', resData, { proxyRes, userReq, userRes });
					// remap IDs if needed (since filters may modify hubs)
					if(this.metadataIdMappings && resData.MediaContainer.Hub) {
						for(const hub of resData.MediaContainer.Hub) {
							this.remapHubMetadataIdsIfNeeded(hub);
						}
					}
					return resData;
				}
			})
		]);

		router.get('/hubs/sections/:sectionId', [
			this.middlewares.plexAuthentication,
			// TODO handle custom sections
			plexApiProxy(this.plexServerURL, plexProxyArgs, {
				responseModifier: async (proxyRes, resData: plexTypes.PlexSectionHubsPage, userReq: IncomingPlexAPIRequest, userRes) => {
					const sectionId = userReq.params.sectionId;
					// filter response
					await this.filterResponse('sectionHubs', resData, { proxyRes, userReq, userRes, sectionId });
					// remap IDs if needed (since filters may modify hubs)
					if(this.metadataIdMappings && resData.MediaContainer.Hub) {
						for(const hub of resData.MediaContainer.Hub) {
							this.remapHubMetadataIdsIfNeeded(hub);
						}
					}
					return resData;
				}
			})
		]);

		router.get(`/library/metadata/:metadataId`, [
			this.middlewares.plexAuthentication,
			pseuplexMetadataIdsRequestMiddleware(plexReqHandlerOpts, async (req: PseuplexRemappedMetadataIdsRequest, res, metadataIds): Promise<PseuplexMetadataPage> => {
				const privateToPublicIds = req.remappedPlexMetadataIds;
				const context = this.contextForRequest(req);
				const params: plexTypes.PlexMetadataPageParams = req.plex.requestParams;
				// get metadatas
				const resData = await this.getMetadata(metadataIds, {
					plexParams: req.plex.requestParams,
					context,
					cachePluginMetadataAccess: true,
				});
				// process metadata items
				await forArrayOrSingleAsyncParallel(resData.MediaContainer.Metadata, async (metadataItem) => {
					if(metadataItem.guid) {
						// cache plex id => guid mapping if exists
						const metadataId = metadataItem.Pseuplex.plexMetadataIds?.[this.plexServerURL];
						if(metadataId) {
							this.plexServerIdToGuidCache.setSync(metadataId, metadataItem.guid);
						}
					}
					// filter related hubs if included
					if(params.includeRelated == 1) {
						// get metadata id
						let metadataIdString = parseMetadataIDFromKey(metadataItem.key, '/library/metadata/')?.id;
						if(!metadataIdString) {
							metadataIdString = metadataItem.ratingKey;
						}
						if(metadataIdString) {
							// filter related hubs
							const metadataId = parseMetadataID(metadataIdString);
							const relatedHubsResponse: plexTypes.PlexHubsPage = {
								MediaContainer: {
									...metadataItem.Related,
									size: (metadataItem.Related?.Hub?.length ?? 0),
								}
							};
							await this.filterResponse('metadataRelatedHubs', relatedHubsResponse, {
								userReq:req,
								userRes:res,
								metadataId,
								from: PseuplexRelatedHubsSource.Library,
							});
							metadataItem.Related = relatedHubsResponse.MediaContainer;
						} else {
							console.error("Failed to determine metadataId from metadata item");
						}
					}
				});
				// filter metadata page
				await this.filterResponse('metadata', resData, {
					userReq:req,
					userRes:res,
					metadataIds,
				});
				// remap IDs if needed
				if(this.metadataIdMappings) {
					forArrayOrSingle(resData.MediaContainer.Metadata, (metadataItem) => {
						this.remapMetadataIdsIfNeeded(metadataItem, privateToPublicIds);
					});
				}
				// send unavailable notifications if needed
				this.sendMetadataUnavailableNotificationsIfNeeded(resData, params, context);
				return resData;
			}),
			plexApiProxy(this.plexServerURL, plexProxyArgs, {
				responseModifier: async (proxyRes, resData: plexTypes.PlexMetadataPage, userReq: IncomingPlexAPIRequest, userRes) => {
					const context = this.contextForRequest(userReq);
					const plexParams: plexTypes.PlexMetadataPageParams = userReq.plex.requestParams;
					const metadataIds = parseMetadataIdsFromPathParam(userReq.params.metadataId);
					// process metadata items
					await forArrayOrSingleAsyncParallel(resData.MediaContainer.Metadata, async (metadataItem: PseuplexMetadataItem) => {
						const metadataId = parseMetadataIDFromKey(metadataItem.key, '/library/metadata/')?.id;
						metadataItem.Pseuplex = {
							isOnServer: true,
							unavailable: false,
							metadataIds: {},
							plexMetadataIds: {
								[this.plexServerURL]: metadataId
							}
						};
						// cache id => guid mapping
						if(metadataItem.guid && metadataId) {
							this.plexServerIdToGuidCache.setSync(metadataId, metadataItem.guid);
						}
						// filter related hubs if included
						if(metadataId && plexParams.includeRelated == 1) {
							// filter related hubs
							const metadataIdParts = parseMetadataID(metadataId);
							const relatedHubsResponse: plexTypes.PlexHubsPage = {
								MediaContainer: {
									...metadataItem.Related,
									size: (metadataItem.Related?.Hub?.length ?? 0),
								}
							};
							await this.filterResponse('metadataRelatedHubs', relatedHubsResponse, {
								proxyRes,
								userReq,
								userRes,
								metadataId:metadataIdParts,
								from: PseuplexRelatedHubsSource.Library,
							});
							metadataItem.Related = relatedHubsResponse.MediaContainer;
						}
					});
					// filter metadata page
					await this.filterResponse('metadata', resData as PseuplexMetadataPage, {
						proxyRes,
						userReq,
						userRes,
						metadataIds,
					});
					// send unavailable notifications if needed
					this.sendMetadataUnavailableNotificationsIfNeeded(resData  as PseuplexMetadataPage, plexParams, context);
					// no need to remap IDs here, since the request was proxied
					return resData;
				}
			})
		]);

		router.get(`/library/metadata/:metadataId/children`, [
			this.middlewares.plexAuthentication,
			pseuplexMetadataIdRequestMiddleware(plexReqHandlerOpts, async (req: PseuplexRemappedMetadataIdsRequest, res, metadataId): Promise<plexTypes.PlexMetadataPage | PseuplexMetadataPage> => {
				const privateToPublicIds = req.remappedPlexMetadataIds;
				const context = this.contextForRequest(req);
				const plexParams: plexTypes.PlexMetadataChildrenPageParams = {
					...req.plex.requestParams,
					'X-Plex-Container-Start': intParam(req.query['X-Plex-Container-Start'] ?? req.header('x-plex-container-start')),
					'X-Plex-Container-Size': intParam(req.query['X-Plex-Container-Size'] ?? req.header('x-plex-container-size'))
				};
				// get metadatas
				const resData = await this.getMetadataChildren(metadataId, {
					plexParams: plexParams,
					context,
					cachePluginMetadataAccess: true,
				});
				// filter metadata children page
				await this.filterResponse('metadataChildren', resData, {
					userReq:req,
					userRes:res,
					metadataId,
				});
				// remap IDs if needed
				if(this.metadataIdMappings) {
					forArrayOrSingle(resData.MediaContainer.Metadata, (metadataItem) => {
						this.remapMetadataIdsIfNeeded(metadataItem, privateToPublicIds);
					});
				}
				// send unavailable notifications if needed
				this.sendMetadataUnavailableNotificationsIfNeeded(resData, plexParams as plexTypes.PlexMetadataPageParams, context);
				return resData;
			}),
			plexApiProxy(this.plexServerURL, plexProxyArgs, {
				responseModifier: async (proxyRes, resData: plexTypes.PlexMetadataChildrenPage, userReq: IncomingPlexAPIRequest, userRes) => {
					const context = this.contextForRequest(userReq);
					const metadataId = parseMetadataIdFromPathParam(userReq.params.metadataId);
					const plexParams: plexTypes.PlexMetadataChildrenPageParams = {
						...userReq.plex.requestParams,
						'X-Plex-Container-Start': intParam(userReq.query['X-Plex-Container-Start'] ?? userReq.header('x-plex-container-start')),
						'X-Plex-Container-Size': intParam(userReq.query['X-Plex-Container-Size'] ?? userReq.header('x-plex-container-size'))
					};
					// process metadata items
					await forArrayOrSingleAsyncParallel(resData.MediaContainer.Metadata, async (metadataItem: PseuplexMetadataItem) => {
						const metadataId = parseMetadataIDFromKey(metadataItem.key, '/library/metadata/')?.id;
						metadataItem.Pseuplex = {
							isOnServer: true,
							unavailable: false,
							metadataIds: {},
							plexMetadataIds: {
								[this.plexServerURL]: metadataId
							}
						};
					});
					// filter metadata page
					await this.filterResponse('metadataChildren', resData as PseuplexMetadataChildrenPage, {
						proxyRes,
						userReq,
						userRes,
						metadataId,
					});
					// send unavailable notifications if needed
					this.sendMetadataUnavailableNotificationsIfNeeded(resData as PseuplexMetadataPage, plexParams as plexTypes.PlexMetadataPageParams, context);
					return resData;
				},
			})
		]);

		for(const hubsSource of Object.values(PseuplexRelatedHubsSource)) {
			router.get(`/${hubsSource}/metadata/:metadataId/related`, [
				this.middlewares.plexAuthentication,
				pseuplexMetadataIdRequestMiddleware(plexReqHandlerOpts, async (req: PseuplexRemappedMetadataIdsRequest, res, metadataId): Promise<plexTypes.PlexHubsPage> => {
					const privateToPublicIds = req.remappedPlexMetadataIds;
					const context = this.contextForRequest(req);
					// get metadata
					const resData = await this.getMetadataRelatedHubs(metadataId, {
						plexParams: req.plex.requestParams,
						context,
						from: hubsSource,
					});
					// filter hub list page
					await this.filterResponse('metadataRelatedHubs', resData, {
						userReq:req,
						userRes:res,
						metadataId,
						from: hubsSource,
					});
					// remap private IDs if needed
					if(this.metadataIdMappings && resData.MediaContainer.Hub) {
						for(const hub of resData.MediaContainer.Hub) {
							this.remapHubMetadataIdsIfNeeded(hub, privateToPublicIds);
						}
					}
					return resData;
				}),
				plexApiProxy(this.plexServerURL, plexProxyArgs, {
					responseModifier: async (proxyRes, resData: plexTypes.PlexHubsPage, userReq: IncomingPlexAPIRequest, userRes) => {
						// get request info
						const metadataId = parseMetadataIdFromPathParam(userReq.params.metadataId);
						// filter hub list page
						await this.filterResponse('metadataRelatedHubs', resData, {
							proxyRes,
							userReq,
							userRes,
							metadataId,
							from: hubsSource,
						});
						// remap private IDs if needed (since filters may modify hubs)
						if(this.metadataIdMappings && resData.MediaContainer.Hub) {
							for(const hub of resData.MediaContainer.Hub) {
								this.remapHubMetadataIdsIfNeeded(hub);
							}
						}
						return resData;
					}
				})
			]);
		}

		router.get(`/library/all`, [
			this.middlewares.plexAuthentication,
			plexApiProxy(this.plexServerURL, plexProxyArgs, {
				filter: (req, res) => {
					// only filter if guid is included
					if(req.query['guid'] || req.query['show.guid']) {
						return true;
					}
					return false
				},
				responseModifier: async (proxyRes, resData: plexTypes.PlexMetadataPage, userReq: IncomingPlexAPIRequest, userRes) => {
					// filter metadata
					await this.filterResponse('findGuidInLibrary', resData, { proxyRes, userReq, userRes });
					// remap private IDs if needed
					if(this.metadataIdMappings) {
						forArrayOrSingle(resData.MediaContainer.Metadata, (metadataItem) => {
							this.remapMetadataIdsIfNeeded(metadataItem);
						});
					}
					return resData;
				}
			})
		]);

		router.get('/myplex/account', [
			this.middlewares.plexAuthentication,
			// ensure that this endpoint NEVER gives data to non-owners
			this.middlewares.plexServerOwnerOnly,
			plexApiProxy(this.plexServerURL, plexProxyArgs, {
				responseModifier: async (proxyRes, resData: plexTypes.PlexMyPlexAccountPage, userReq: IncomingPlexAPIRequest, userRes) => {
					// overwrite privatePort if needed
					if(this.overwritePlexPrivatePort) {
						if(this.overwritePlexPrivatePort === true) {
							const secure = requestIsEncrypted(userReq);
							let port: number | undefined;
							if(secure) {
								port = this.httpsPort ?? this.httpPort;
							} else {
								port = this.httpPort;
							}
							if(port) {
								resData.MyPlex.privatePort = port;
							}
						} else {
							resData.MyPlex.privatePort = this.overwritePlexPrivatePort;
						}
					}
					return resData;
				}
			})
		]);

		router.post('/playQueues', [
			this.middlewares.plexAuthentication,
			plexApiProxy(this.plexServerURL, plexProxyArgs, {
				requestPathModifier: async (req: IncomingPlexAPIRequest): Promise<string> => {
					const context = this.contextForRequest(req);
					// parse url path
					const urlPathParts = parseURLPath(req.url);
					const queryItems = urlPathParts.queryItems;
					if(!queryItems) {
						return req.url;
					}
					// check for play queue uri
					let uriProp = queryItems['uri'];
					if(!uriProp) {
						return req.url;
					}
					// resolve play queue uri
					const resolveOptions: PseuplexPlayQueueURIResolverOptions = {
						plexMachineIdentifier: await this.plexServerProperties.getMachineIdentifier(),
						context,
					};
					uriProp = await transformArrayOrSingleAsyncParallel(uriProp, async (uri) => {
						const uriParts = plexTypes.parsePlayQueueURI(uri);
						if(!uriParts.path) {
							return uri;
						}
						const uriChanged = await this.resolvePlayQueueURI(uriParts, resolveOptions);
						if(!uriChanged) {
							return uri;
						}
						const newUri = plexTypes.stringifyPlayQueueURIParts(uriParts);
						console.log(`Remapped play queue uri ${uri} to ${newUri}`);
						return newUri;
					});
					queryItems['uri'] = uriProp;
					return stringifyURLPath(urlPathParts);
				}
			})
		]);

		const pathEndingChars = ['/','?',undefined];

		router.get('/photo/\\:/transcode', [
			this.middlewares.plexAuthentication,
			asyncRequestHandler(async (req: IncomingPlexAPIRequest, res) => {
				try {
					const urlParts = parseURLPath(req.url);
					let photoUrl = urlParts.queryItems?.['url'];
					if(photoUrl && typeof photoUrl === 'string') {
						let changedUrl = false;
						const urlsToRewrite = [
							'http://127.0.0.1:32400',
							'https://127.0.0.1:32400',
						];
						if(this.httpsPort) {
							urlsToRewrite.push(`https://127.0.0.1:${this.httpsPort}`);
						}
						if(this.httpPort) {
							urlsToRewrite.push(`http://127.0.0.1:${this.httpPort}`);
						}
						// rewrite 127.0.0.1 urls query params to absolute paths
						for(const urlToRewrite of urlsToRewrite) {
							if(photoUrl.startsWith(urlToRewrite) && photoUrl[urlToRewrite.length] == '/') {
								const ogPhotoUrl = photoUrl;
								photoUrl = photoUrl.substring(urlToRewrite.length);
								// TODO log photo url rewrite
								changedUrl = true;
								break;
							}
						}
						// replace photo url if it matches the overlay url
						if(this.overlayedImageEndpoint
							&& photoUrl.startsWith(this.overlayedImageEndpoint)
							&& pathEndingChars.indexOf(photoUrl[this.overlayedImageEndpoint.length]) !== -1) {
							// photo transcode requests for the overlayed image endpoint should just get redirected
							const photoUrlParts = parseURLPath(photoUrl);
							// replace url in photo transcode url with the url passed to the overlay endpoint
							urlParts.queryItems ??= {};
							urlParts.queryItems['url'] = photoUrlParts.queryItems?.['url'];
							photoUrlParts.queryItems ??= {};
							photoUrlParts.queryItems['url'] = stringifyURLPath(urlParts);
							const newUrl = stringifyURLPath(photoUrlParts);
							req.url = newUrl;
							// handle overlayed image request
							await this._handleOverlayedImageRequest(req, res);
							this.logger?.logIncomingUserRequestResponse(req, res, undefined);
							return true;
						}
						if(changedUrl) {
							urlParts.queryItems!['url'] = photoUrl;
							req.url = stringifyURLPath(urlParts);
						}
					}
				} catch(error) {
					console.error(`Error rewriting plex photo url:`);
					console.error(error);
				}
				return false;
			})
		]);

		if(options.overlaysEnabled ?? true) {
			this.overlayImageCache = new CachedFetcher<Buffer>(async (imageName: string) => {
				let imagePath = this.overlayImageOverrides?.[imageName];
				if(imagePath) {
					if(!imagePath.startsWith('/') && !imagePath.startsWith('./') && !imagePath.startsWith('../')) {
						imagePath = `${require.main!.path}/../${imagePath}`;
					}
				} else {
					imagePath = `${require.main!.path}/../images/overlays/${imageName}.png`;
				}
				const image = sharp(imagePath);
				try {
					return await image.toBuffer();
				} finally {
					try {
						image.destroy();
					} catch(error) {
						console.error("Error destroying loaded image:");
						console.error(error);
					}
				}
			});
			
			this.overlayedImageEndpoint = `/${this.slug}/image/withoverlay`;
			router.get(this.overlayedImageEndpoint, [
				this.middlewares.plexAuthentication,
				asyncRequestHandler(async (req, res) => {
					await this._handleOverlayedImageRequest(req, res);
					this.logger?.logIncomingUserRequestResponse(req, res, undefined);
					return true;
				})
			]);
		}

		// handle eventsource requests
		const plexSSEProxy = plexHttpProxy(this.plexServerURL, plexProxyArgs, {
			onProxyResponse: (proxyReq, proxyRes, userReq: IncomingPlexAPIRequest, userRes) => {
				// save subscriber list per plex token
				const plexToken = userReq.plex.authContext['X-Plex-Token']!;
				let subscribers = this.eventSourceSubscribers[plexToken];
				const subscriberInfo: PseuplexEventSourceSubscriber = {
					response: userRes,
					proxyResponse: proxyRes,
				};
				if(subscribers) {
					subscribers.push(subscriberInfo);
				} else {
					subscribers = [subscriberInfo];
					this.eventSourceSubscribers[plexToken] = subscribers;
				}
				// remove subscriber when response ends
				let done = false;
				const onResponseDone = () => {
					if(done) {
						return;
					}
					done = true;
					// remove subscriber
					const subscriberIndex = subscribers.indexOf(subscriberInfo);
					if(subscriberIndex != -1) {
						subscribers.splice(subscriberIndex, 1);
						if(subscribers.length == 0) {
							delete this.eventSourceSubscribers[plexToken];
						}
					} else {
						console.error(`Couldn't find notification eventsource subscriber to remove`);
					}
				};
				userRes.once('finish', onResponseDone);
				userRes.once('close', onResponseDone);
			},
		});
		router.get('/\\:/eventsource/notifications', [
			this.middlewares.plexAuthentication,
			(req, res) => {
				plexSSEProxy.web(req,res);
			},
		]);

		// proxy requests to plex
		const plexGeneralProxy = plexHttpProxy(this.plexServerURL, plexProxyArgs);
		plexGeneralProxy.on('error', (error) => {
			console.error();
			console.error(`Got proxy error:`);
			console.error(error);
		});
		router.use((req, res) => {
			plexGeneralProxy.web(req,res);
		});
		router.use(expressErrorHandler);
		router.use((error: Error, req: express.Request, res: express.Response, next) => {
			console.error(`Error cascaded past where it should've:`);
			console.error(error);
			next();
		});
		
		// create http/https/http+https server
		let httpServer: http.Server | undefined;
		let httpsServer: https.Server | undefined;
		let httpolyglotServer: httpolyglot.Server | undefined;
		const servers: (http.Server | https.Server | httpolyglot.Server)[] = [];
		if(httpPort == httpsPort) {
			httpolyglotServer = httpolyglot.createServer(options.serverOptions, router);
			servers.push(httpolyglotServer);
		} else {
			if(httpPort) {
				httpServer = http.createServer(options.serverOptions, router);
				servers.push(httpServer);
			}
			if(httpsPort) {
				httpsServer = https.createServer(options.serverOptions, router);
				servers.push(httpsServer);
			}
		}
		console.assert(servers.length > 0, "No servers were created");

		for(const server of servers) {
			// handle upgrade to socket
			server.on('upgrade', (req, socket, head) => {
				this.logger?.logIncomingUserUpgradeRequest(req);
				// socket endpoints seem to only get passed the token
				const plexToken = plexTypes.parsePlexTokenFromRequest(req);
				if(plexToken) {
					// save socket info per plex token
					let sockets = this.clientWebSockets[plexToken];
					let endpoint = (req as express.Request).path || parseURLPathParts(req.url!).path;
					// trim trailing endpoint slash if needed
					if(endpoint && endpoint.length > 1 && endpoint.endsWith('/') && endpoint.startsWith('/')) {
						endpoint = endpoint.slice(0, endpoint.length-1);
					}
					const socketInfo: PseuplexPossiblyConfirmedClientWebSocketInfo = {
						endpoint,
						socket,
						proxySocket: undefined,
					};
					if(sockets) {
						sockets.push(socketInfo);
					} else {
						sockets = [socketInfo];
						this.clientWebSockets[plexToken] = sockets;
					}
					// `pipe` is called on this socket once the proxy socket succeeds
					//  so we want to listen for this function call to "confirm" the websocket as being accepted by the plex server
					const innerSocketPipe = socket.pipe;
					let piped = false;
					socket.pipe = function(...args) {
						if(!piped) {
							piped = true;
							const proxySocket = args[0];
							if(proxySocket instanceof stream.Duplex) {
								socketInfo.proxySocket = proxySocket;
							}
						}
						return innerSocketPipe.call(this, ...args);
					};
					// remove on close
					socket.once('close', () => {
						const socketIndex = sockets.indexOf(socketInfo);
						if(socketIndex != -1) {
							sockets.splice(socketIndex, 1);
							if(sockets.length == 0) {
								delete this.clientWebSockets[plexToken];
							}
						} else {
							console.error(`Couldn't find socket to remove for ${req.url}`);
						}
						this.logger?.logIncomingWebsocketClosed(req);
					});
				}
				plexGeneralProxy.ws(req, socket, head);
			});
		}

		// set servers
		this.httpServer = httpServer;
		this.httpsServer = httpsServer;
		this.httpolyglotServer = httpolyglotServer;
	}


	getAllServers() {
		const servers: (http.Server | https.Server | httpolyglot.Server)[] = [];
		if(this.httpolyglotServer) {
			servers.push(this.httpolyglotServer);
		}
		if(this.httpServer) {
			servers.push(this.httpServer);
		}
		if(this.httpsServer) {
			servers.push(this.httpsServer);
		}
		return servers;
	}


	async listen(evts?: {
		onHttpListening?: (port: number) => void,
		onHttpsListening?: (port: number) => void,
		onHttpolyglotListening?: (port: number) => void,
	}) {
		if(this.httpsServer) {
			const port = this.httpsPort!;
			this.httpsServer!.listen(port, () => {
				evts?.onHttpsListening?.(port);
			});
		}
		if(this.httpServer) {
			const port = this.httpPort!;
			this.httpServer!.listen(port, () => {
				evts?.onHttpListening?.(port);
			});
		}
		if(this.httpolyglotServer) {
			const port = (this.httpsPort ?? this.httpPort)!;
			this.httpolyglotServer!.listen(port, () => {
				evts?.onHttpolyglotListening?.(port);
			});
		}
	}

	close(evts?: {
		onHttpClosed?: (error?: Error) => void,
		onHttpsClosed?: (error?: Error) => void,
		onHttpolyglotClosed?: (error?: Error) => void,
	}) {
		this.stopListeningToPlexServerNotifications();
		this.httpServer?.close((error) => {
			evts?.onHttpClosed?.(error);
		});
		this.httpsServer?.close((error) => {
			evts?.onHttpsClosed?.(error);
		});
		this.httpolyglotServer?.close((error) => {
			evts?.onHttpolyglotClosed?.(error);
		});
	}


	shouldListenToPlexServerNotifications(): boolean {
		if(this.forwardsMetadataRefreshToPluginMetadata) {
			return true;
		}
		for(const pluginSlug of Object.keys(this.plugins)) {
			const plugin = this.plugins[pluginSlug];
			try {
				if(plugin.shouldListenToPlexServerNotifications?.()) {
					return true;
				}
			} catch(error) {
				console.error(`Error in plugin ${pluginSlug} when checking whether to listen to plex server notifications:`);
				console.error(error);
			}
		}
		return false;
	}

	startListeningToPlexServerNotifications() {
		if(this._listeningToPlexServerNotifications) {
			// already listening
			return;
		}
		try {
			this._createPlexServerNotificationWebsocket(true);
		} catch(error) {
			console.error(`Error while creating plex server websocket:`);
			console.error(error);
		}
	}

	stopListeningToPlexServerNotifications() {
		if(!this._listeningToPlexServerNotifications) {
			// not listening
			return;
		}
		const socket = this._plexServerNotificationsSocket;
		// cancel timeout
		if(this._plexServerNotificationsSocketRetryTimeout) {
			clearTimeout(this._plexServerNotificationsSocketRetryTimeout);
			this._plexServerNotificationsSocketRetryTimeout = undefined;
		}
		// clear socket
		this._listeningToPlexServerNotifications = false;
		this._plexServerNotificationsSocket = undefined;
		// close socket
		try {
			socket?.close();
		} catch(error) {
			console.error(`Error while closing plex server websocket:`);
			console.error(error);
		}
	}

	private _createPlexServerNotificationWebsocket(firstAttempt: boolean) {
		const plexServerURL = URL.parse(this.plexServerURL);
		if(!plexServerURL) {
			console.warn(`Plex server url ${plexServerURL} is not a valid url`);
			throw new Error(`Invalid plex server url`);
		}
		const secure = plexServerURL.protocol == 'https:';
		const protocol = secure ? 'wss' : 'ws';
		const socket = new WebSocket(`${protocol}://${plexServerURL.host}/:/websockets/notifications?X-Plex-Token=${this.plexAdminAuthContext['X-Plex-Token'] ?? ''}`);
		this._plexServerNotificationsSocket = socket;
		this._listeningToPlexServerNotifications = true;
		let opened = false;
		let closed = false;
		// listen for errors
		socket.addEventListener('error', (error) => {
			if(!opened) {
				this.logger?.logServerWebsocketFailedToOpen(error, firstAttempt);
			} else {
				this.logger?.logServerWebsocketClosedWithError(error);
			}
			if(closed) {
				return;
			}
			closed = true;
			if(this._plexServerNotificationsSocket === socket) {
				// delay a bit before retrying
				const retryInterval = this.plexServerNotificationsOptions.socketRetryInterval ?? 5;
				const timeout = setTimeout(() => {
					// unset retry timeout
					if(timeout === this._plexServerNotificationsSocketRetryTimeout) {
						this._plexServerNotificationsSocketRetryTimeout = undefined;
					}
					// retry if socket is still set
					if(this._plexServerNotificationsSocket === socket) {
						this._plexServerNotificationsSocket = undefined;
						if(this._listeningToPlexServerNotifications) {
							this._listeningToPlexServerNotifications = false;
							try {
								this._createPlexServerNotificationWebsocket(false);
							} catch(error) {
								console.error(`Error while reconnecting plex server websocket:`);
								console.error(error);
							}
						}
					}
				}, retryInterval * 1000);
				this._plexServerNotificationsSocketRetryTimeout = timeout;
			}
		});
		// listen for close
		socket.addEventListener('close', (evt) => {
			if(closed) {
				return;
			}
			closed = true;
			// TODO log possibly
			if(this._plexServerNotificationsSocket === socket) {
				this._plexServerNotificationsSocket = undefined;
				this._listeningToPlexServerNotifications = false;
			}
		});
		// listen for open
		socket.addEventListener('open', (evt) => {
			opened = true;
			// TODO log possibly
		});
		// listen for message
		socket.addEventListener('message', (evt) => {
			// TODO log possibly
			this._handlePlexServerNotification(evt);
		});
	}

	private _handlePlexServerNotification(event: WebSocketEventMap['message']) {
		this.logger?.logAdminWebsocketMessageFromServer(event);
		// parse data
		let data: plexTypes.PlexNotificationMessage;
		try {
			data = JSON.parse(event.data);
		} catch(error) {
			console.error(`Failed to parse plex server notification:`);
			console.error(error);
			return;
		}
		// handle notification
		try {
			this.onPlexServerNotification(data);
		} catch(error) {
			console.error(`Error while handling plex server notification:`);
			console.error(error);
		}
		// handle notification in plugins
		for(const pluginSlug of Object.keys(this.plugins)) {
			const plugin = this.plugins[pluginSlug];
			try {
				plugin.onPlexServerNotification?.(data);
			} catch(error) {
				console.error(`Error in plugin ${pluginSlug} while handling notification:`);
				console.error(error);
			}
		}
	}

	private onPlexServerNotification(data: plexTypes.PlexNotificationMessage) {
		const notification = data.NotificationContainer;
		// forward metadata refresh if needed
		if(this.forwardsMetadataRefreshToPluginMetadata && this.pluginMetadataAccessCache) {
			// if activity or timeline notification finishes refreshing
			//  then we should try to forward that notification to plugin metadata ids or keys
			switch(notification.type) {
				case plexTypes.PlexNotificationType.Timeline: {
					let timelineEntries = notification.TimelineEntry;
					if(timelineEntries) {
						if(!(timelineEntries instanceof Array)) {
							timelineEntries = [timelineEntries];
						}
						const finishedRefreshingEntries = timelineEntries.filter((entry) => {
							return (
								entry.itemID
								&& entry.state == plexTypes.PlexTimelineEntryNotificationState.FinishedRefresh
								&& entry.sectionID != null && entry.sectionID != "-1"
							);
						});
						if(finishedRefreshingEntries.length > 0) {
							const itemIDs = finishedRefreshingEntries.map((entry) => entry.itemID);
							this.sendPluginMetadataTimelineRefreshForItemIDsIfAble(itemIDs);
						}
					}
				} break;

				case plexTypes.PlexNotificationType.Activity: {
					let activityEntries = notification.ActivityNotification;
					if(activityEntries) {
						if(!(activityEntries instanceof Array)) {
							activityEntries = [activityEntries];
						}
						const finishedRefreshingEntries = activityEntries.filter((entry) => {
							return (
								entry.event == plexTypes.PlexActivityEventType.Ended
								&& entry.Activity.Context?.key
							);
						});
						if(finishedRefreshingEntries.length > 0) {
							this.forwardPluginMetadataActivityRefreshNotificationsIfAble(finishedRefreshingEntries);
						}
					}
				} break;
			}
		}
	}

	plexSendNotificationOptions(): SendPlexNotificationOptions {
		return {
			logger: this.logger,
		};
	}

	requiredMetadataPathTransformOptions(): (PseuplexMetadataPathTransformOptions | undefined) {
		if(this.alwaysUseLibraryMetadataPath) {
			return {
				metadataBasePath: '/library/metadata',
				qualifiedMetadataIds: true,
			};
		}
		return undefined;
	}

	requiredHubMetadataTransformOptions(): PseuplexHubMetadataTransformOptions {
		return {
			metadataTransformOptions: this.requiredMetadataPathTransformOptions(),
			includeMetadataUnavailability: this.sendsMetadataUnavailability,
		};
	}



	contextForRequest(req: IncomingPlexAPIRequest): PseuplexRequestContext {
		return {
			plexServerURL: this.plexServerURL,
			plexAuthContext: req.plex.authContext,
			plexUserInfo: req.plex.userInfo,
		};
	}
	
	
	
	getMetadataProvider(sourceSlug: string): (PseuplexMetadataProvider | null) {
		return this.metadataProviders[sourceSlug] ?? null;
	}


	async getMetadata(metadataIds: PseuplexMetadataIDParts[], options: PseuplexAppMetadataParams): Promise<PseuplexMetadataPage> {
		const { context } = options;
		let caughtError: Error | undefined = undefined;
		let caughtNon404Error: Error | undefined = undefined;
		// create provider params
		const transformOpts: PseuplexMetadataTransformOptions = {
			metadataBasePath: '/library/metadata',
			qualifiedMetadataIds: true,
			includeMetadataUnavailability: this.sendsMetadataUnavailability,
		};
		const providerParams: PseuplexMetadataProviderParams = {
			...options,
			includePlexDiscoverMatches: true,
			includeUnmatched: true,
			transformMatchKeys: true,
			metadataBasePath: transformOpts.metadataBasePath,
			qualifiedMetadataIds: transformOpts.qualifiedMetadataIds,
			includeMetadataUnavailability: transformOpts.includeMetadataUnavailability,
		};
		// get metadata for each id
		const metadataPages = (await Promise.all(metadataIds.map(async (metadataId) => {
			try {
				let source = metadataId.source;
				// if the metadataId doesn't have a source, assume plex
				if (source == null || source == PseuplexMetadataSource.Plex) {
					// fetch from plex
					const fullMetadataId = stringifyMetadataID(metadataId);
					const metadataPage = await plexServerAPI.getLibraryMetadata(fullMetadataId, {
						params: options.plexParams,
						serverURL: context.plexServerURL,
						authContext: context.plexAuthContext,
						logger: this.logger,
					});
					// transform metadata
					metadataPage.MediaContainer.Metadata = transformArrayOrSingle(metadataPage.MediaContainer.Metadata, (metadataItem: PseuplexMetadataItem) => {
						metadataItem.Pseuplex = {
							isOnServer: true,
							unavailable: false,
							metadataIds: {},
							plexMetadataIds: {
								[context.plexServerURL]: metadataItem.ratingKey
							}
						};
						return metadataItem;
					});
					return metadataPage;
				} else if(source == PseuplexMetadataSource.PlexServer) {
					// fetch from from external plex server
					const itemPlexServerURL = metadataId.directory;
					if(!itemPlexServerURL) {
						throw httpError(400, `Invalid metadata id`);
					}
					const metadataPage = await plexServerAPI.getLibraryMetadata(metadataId.id, {
						serverURL: itemPlexServerURL,
						authContext: context.plexAuthContext,
						params: options.plexParams,
						logger: this.logger,
					});
					// transform metadata
					metadataPage.MediaContainer.Metadata = transformArrayOrSingle(metadataPage.MediaContainer.Metadata, (metadataItem: PseuplexMetadataItem) => {
						return extPlexTransform.transformExternalPlexMetadata(metadataItem, itemPlexServerURL, context, transformOpts);
					});
					return metadataPage;
				} else {
					// find matching provider from source
					const metadataProvider = this.getMetadataProvider(source);
					if(!metadataProvider) {
						throw httpError(400, `Unknown metadata source ${source}`);
					}
					// fetch from provider
					const partialId = stringifyPartialMetadataID(metadataId);
					const metadataPage = await metadataProvider.get([partialId], providerParams);
					const metadatas = metadataPage.MediaContainer.Metadata;
					// cache plugin metadata access if needed
					// only cache if fetching a single metadata id and receiving a single result
					if(options.cachePluginMetadataAccess && this.pluginMetadataAccessCache && metadataIds.length == 1 && metadatas) {
						let metadataItem: PseuplexMetadataItem | undefined;
						if(metadatas instanceof Array) {
							if(metadatas.length == 1) {
								metadataItem = metadatas[0];
							}
						} else {
							metadataItem = metadatas;
						}
						const plexGuid = metadataItem?.guid;
						if(plexGuid) {
							const fullMetadataId = stringifyMetadataID(metadataId);
							const metadataKey = `${transformOpts.metadataBasePath}/${fullMetadataId}`;
							this.pluginMetadataAccessCache.addMetadataAccessEntry(plexGuid, fullMetadataId, metadataKey, context);
						}
					}
					return metadataPage;
				}
			} catch(error) {
				if((error as HttpResponseError)?.httpResponse?.status != 404) {
					console.error(`Error fetching metadata for metadata id ${stringifyMetadataID(metadataId)} :`);
					console.error(error);
					if(!caughtNon404Error) {
						caughtNon404Error = error;
					}
				}
				if(!caughtError) {
					caughtError = error;
				}
			}
		}))).filter((metadataPage) => metadataPage) as PseuplexMetadataPage[];
		if(metadataPages.length == 1) {
			return metadataPages[0];
		}
		const metadataItems = metadataPages.flatMap((page) => {
			const pageMetadatas = page.MediaContainer.Metadata;
			if(pageMetadatas) {
				if(pageMetadatas instanceof Array) {
					return pageMetadatas;
				} else {
					return [pageMetadatas];
				}
			} else {
				return [];
			}
		});
		if(metadataItems.length == 0) {
			const error = caughtNon404Error ?? caughtError;
			if(error) {
				throw error;
			}
			throw httpError(404, "Not Found");
		}
		return {
			MediaContainer: {
				size: metadataItems.length,
				allowSync: false,
				identifier: plexTypes.PlexPluginIdentifier.PlexAppLibrary,
				Metadata: metadataItems
			}
		};
	}

	async getMetadataChildren(metadataId: PseuplexMetadataIDParts, options: PseuplexAppMetadataChildrenParams): Promise<PseuplexMetadataChildrenPage> {
		const { context } = options;
		// create provider params
		const transformOpts: PseuplexMetadataTransformOptions = {
			metadataBasePath: '/library/metadata',
			qualifiedMetadataIds: true,
			includeMetadataUnavailability: this.sendsMetadataUnavailability,
		};
		// get metadata for each id
		let source = metadataId.source;
		// if the metadataId doesn't have a source, assume plex
		if (source == null || source == PseuplexMetadataSource.Plex) {
			// fetch from plex server
			const fullMetadataId = stringifyMetadataID(metadataId);
			const metadataPage = await plexServerAPI.getLibraryMetadataChildren(fullMetadataId, {
				params: options.plexParams,
				serverURL: context.plexServerURL,
				authContext: context.plexAuthContext,
				logger: this.logger,
			});
			// transform metadata children
			forArrayOrSingle(metadataPage.MediaContainer.Metadata, (metadataItem: PseuplexMetadataItem) => {
				metadataItem.Pseuplex = {
					isOnServer: true,
					unavailable: false,
					plexMetadataIds: {
						[context.plexServerURL]: metadataItem.ratingKey
					},
					metadataIds: {},
				};
			});
			return metadataPage as PseuplexMetadataPage;
		} else if(source == PseuplexMetadataSource.PlexServer) {
			// fetch from from external plex server
			const itemPlexServerURL = metadataId.directory;
			if(!itemPlexServerURL) {
				throw httpError(400, `Invalid metadata id`);
			}
			const metadataPage = await plexServerAPI.getLibraryMetadataChildren(metadataId.id, {
				params: options.plexParams,
				serverURL: itemPlexServerURL,
				authContext: context.plexAuthContext,
				logger: this.logger,
			});
			// transform metadata
			metadataPage.MediaContainer.Metadata = transformArrayOrSingle(metadataPage.MediaContainer.Metadata, (metadataItem: PseuplexMetadataItem) => {
				return extPlexTransform.transformExternalPlexMetadata(metadataItem, itemPlexServerURL, context, transformOpts);
			});
			return metadataPage as PseuplexMetadataPage;
		} else {
			// find matching provider from source
			const metadataProvider = this.getMetadataProvider(source);
			if(!metadataProvider) {
				throw httpError(404, `Unknown metadata source ${source}`);
			}
			// fetch from provider
			const partialId = stringifyPartialMetadataID(metadataId);
			const page = await metadataProvider.getChildren(partialId, {
				...options,
				metadataBasePath: transformOpts.metadataBasePath,
				qualifiedMetadataIds: transformOpts.qualifiedMetadataIds,
				includeMetadataUnavailability: transformOpts.includeMetadataUnavailability,
			});
			// cache metadata access if needed
			if(options.cachePluginMetadataAccess && this.pluginMetadataAccessCache) {
				let metadatas = page.MediaContainer.Metadata;
				if(metadatas) {
					if(!(metadatas instanceof Array)) {
						metadatas = [metadatas];
					}
					const plexGuid = metadatas[0]?.parentGuid;
					if(plexGuid) {
						const fullMetadataId = stringifyMetadataID(metadataId);
						const metadataKey = `${transformOpts.metadataBasePath}/${fullMetadataId}`;
						this.pluginMetadataAccessCache.addMetadataAccessEntry(plexGuid, fullMetadataId, metadataKey, context);
					}
				}
			}
			return page;
		}
	}

	async getMetadataRelatedHubs(metadataId: PseuplexMetadataIDParts, options: PseuplexRelatedHubsParams): Promise<plexTypes.PlexHubsPage> {
		// determine where each ID comes from
		if(metadataId.source == null || metadataId.source == PseuplexMetadataSource.Plex) {
			// get related hubs from pms
			const metadataIdString = stringifyMetadataID(metadataId);
			const relatedHubsOpts: plexServerAPI.GetRelatedHubsOptions = {
				params: options.plexParams,
				// TODO include forwarded request headers
				serverURL: options.context.plexServerURL,
				authContext: options.context.plexAuthContext,
				logger: this.logger,
			};
			switch(options.from) {
				case PseuplexRelatedHubsSource.Library:
					return await plexServerAPI.getLibraryMetadataRelatedHubs(metadataIdString, relatedHubsOpts);
				case PseuplexRelatedHubsSource.Hubs:
					return await plexServerAPI.getMetadataRelatedHubs(metadataIdString, relatedHubsOpts);
				default:
					throw new Error(`Unknown related hubs source ${options.from}`);
			}
		} else if(metadataId.source == PseuplexMetadataSource.PlexServer) {
			// TODO get related hubs from external server?
			/*const itemPlexServerURL = metadataId.directory;
			if(!itemPlexServerURL) {
				throw httpError(400, `Invalid metadata id`);
			}
			const hubsPage = await plexServerAPI.getLibraryMetadataRelatedHubs(metadataId.id, {
				serverURL: itemPlexServerURL,
				authContext: options.plexAuthContext,
				params: options.plexParams,
				logger: this.logger,
			});*/
			// TODO transform external plex hubs
			return {
				MediaContainer: {
					size: 0,
					totalSize: 0,
					Hub: []
				}
			};
		}
		// get related hubs from provider
		const metadataProvider = this.getMetadataProvider(metadataId.source);
		if(!metadataProvider) {
			throw httpError(404, `Unknown metadata source ${metadataId.source}`);
		}
		const providerMetadataId = stringifyPartialMetadataID(metadataId);
		return await metadataProvider.getRelatedHubs(providerMetadataId, options);
	}


	async resolvePlayQueueURI(uriParts: plexTypes.PlexPlayQueueURIParts, options: PseuplexPlayQueueURIResolverOptions): Promise<boolean> {
		if(!uriParts.path) {
			return false;
		}
		if(uriParts.machineIdentifier != options.plexMachineIdentifier && uriParts.machineIdentifier != "x") {
			return false;
		}
		const libraryMetadataPath = '/library/metadata';
		const metadataKeyParts = parseMetadataIDFromKey(uriParts.path, libraryMetadataPath);
		let uriChanged = false;
		if(metadataKeyParts) {
			// path is using /library/metadata
			let metadataIdStrings = metadataKeyParts.id.split(',');
			// remap metadata ids for custom providers to plex server items
			const mappingTasks: {[index: number]: Promise<PseuplexMetadataPage>} = {};
			for(let i=0; i<metadataIdStrings.length; i++) {
				const metadataIdString = metadataIdStrings[i];
				const metadataIdParts = parseMetadataIdFromPathParam(metadataIdString);
				if(metadataIdParts.source && metadataIdParts.source != PseuplexMetadataSource.Plex) {
					const metadataProvider = this.metadataProviders[metadataIdParts.source];
					if(metadataProvider) {
						const partialMetadataId = stringifyPartialMetadataID(metadataIdParts);
						mappingTasks[i] = metadataProvider.get([partialMetadataId], {
							context: options.context,
							includePlexDiscoverMatches: false,
							includeUnmatched: false,
							transformMatchKeys: false, // keep the key from the plex server
							qualifiedMetadataIds: true,
							includeMetadataUnavailability: this.sendsMetadataUnavailability,
							metadataBasePath: libraryMetadataPath,
						});
					} else {
						console.error(`Cannot resolve metadata id ${metadataIdString} for play queue`);
					}
				}
			}
			const remappedIds = Object.keys(mappingTasks);
			if(remappedIds.length > 0) {
				// wait for all metadata tasks and return the resolved IDs
				let caughtError;
				metadataIdStrings = (await Promise.all(metadataIdStrings.map(async (id, index): Promise<string[]> => {
					try {
						const mappingTask = mappingTasks[index];
						if(!mappingTask) {
							return [id];
						}
						let metadatas = (await mappingTask).MediaContainer.Metadata;
						if(!metadatas) {
							return [];
						}
						if(!(metadatas instanceof Array)) {
							metadatas = [];
						}
						let foundNull = false;
						let ratingKeys = metadatas.map((m) => {
							if(m.ratingKey) {
								return m.ratingKey;
							}
							const parsedKey = parseMetadataIDFromKey(m.key, libraryMetadataPath);
							if(parsedKey) {
								return parsedKey.id;
							}
							foundNull = true;
							console.error(`No metadata ratingKey or key for item with title ${m.title}`);
							return null!;
						});
						if(foundNull) {
							ratingKeys = ratingKeys.filter((rk) => rk);
						}
						console.log(`Remapped metadata id ${id} to ${ratingKeys.join(",")}`);
						return ratingKeys;
					} catch(error) {
						console.error(`Failed to remap metadata id ${id} :`);
						console.error(error);
						if(!caughtError) {
							caughtError = error;
						}
						return [];
					}
				}))).flat();
				if(metadataIdStrings.length == 0) {
					if(caughtError) {
						throw caughtError;
					}
					throw httpError(500, "Failed to resolve custom metadata ids for play queue");
				}
				// rebuild path and uri from metadata ids
				uriParts.path = `${libraryMetadataPath}/${metadataIdStrings.join(',')}${metadataKeyParts.relativePath ?? ''}`;
				uriChanged = true;
			}
		} else {
			// using an unknown metadata base path
			// check all metadata providers to see if one matches
			for(const metadataProvider of Object.values(this.metadataProviders)) {
				const metadataIds = metadataProvider.metadataIdsFromKey(uriParts.path);
				if(!metadataIds) {
					continue;
				}
				// resolve items to plex server items
				let metadatas = (await metadataProvider.get(metadataIds.ids, {
					context: options.context,
					includePlexDiscoverMatches: false,
					includeUnmatched: false,
					transformMatchKeys: false, // keep the key from the plex server
					qualifiedMetadataIds: true,
					includeMetadataUnavailability: this.sendsMetadataUnavailability,
					metadataBasePath: libraryMetadataPath,
				})).MediaContainer.Metadata || [];
				if(!(metadatas instanceof Array)) {
					metadatas = [metadatas];
				}
				if(metadatas.length <= 0) {
					throw httpError(404, "A matching plex server item was not found for this item");
				}
				let foundNull = false;
				let newMetadataIds = metadatas.map((m) => {
					if(m.ratingKey) {
						return m.ratingKey;
					}
					const parsedKey = parseMetadataIDFromKey(m.key, libraryMetadataPath);
					if(parsedKey) {
						return parsedKey.id;
					}
					foundNull = true;
					console.error(`No metadata ratingKey or key for item with title ${m.title}`);
					return null;
				});
				if(foundNull) {
					newMetadataIds = newMetadataIds.filter((rk) => rk);
				}
				// rebuild path from metadata ids
				const newMetadataKey = `${libraryMetadataPath}/${newMetadataIds.join(',')}${metadataIds.relativePath ?? ''}`;
				console.log(`Remapped metadata key ${uriParts.path} to ${newMetadataKey}`);
				uriParts.path = newMetadataKey;
				uriChanged = true;
				break;
			}
		}
		return uriChanged;
	}


	private async _handleOverlayedImageRequest(req: express.Request, res: express.Response) {
		if(!this.overlayImageCache) {
			throw httpError(500, "Overlays are disabled");
		}
		// parse width
		let width: any = req.query['width'];
		if(typeof width === 'string') {
			if(width) {
				width = Number.parseInt(width);
				if(Number.isNaN(width)) {
					throw httpError(500, "Invalid width");
				}
			} else {
				width = null;
			}
		}
		if(width != null && typeof width !== 'number') {
			throw httpError(400, "Invalid width");
		}
		// parse height
		let height: any = req.query['height'];
		if(typeof height === 'string') {
			if(height) {
				height = Number.parseInt(height);
				if(Number.isNaN(height)) {
					throw httpError(500, "Invalid height");
				}
			} else {
				height = null;
			}
		}
		if(height != null && typeof height !== 'number') {
			throw httpError(400, "Invalid height");
		}
		// parse url
		let url = req.query['url'];
		if(url instanceof Array) {
			url = url[0] as string;
		}
		if(!url) {
			throw httpError(400, "Missing url parameter");
		}
		if(typeof url !== 'string') {
			throw httpError(400, "Invalid url");
		}
		if(url.startsWith('/')) {
			url = this.plexServerURL + url;
		}
		// TODO validate url (disallow any local ips that aren't localhost:psport)
		// parse overlay name
		let overlayName = req.query['overlay'];
		if(overlayName instanceof Array) {
			overlayName = overlayName[0] as string;
		}
		if(typeof overlayName !== 'string') {
			throw httpError(400, `Invalid overlay ${overlayName}`);
		}
		if(!overlayName) {
			throw httpError(400, "Missing overlay parameter");
		}
		if(!overlayName || !overlayImageNameRegex.test(overlayName)) {
			throw httpError(400, "Invalid overlay");
		}
		// get overlay image
		const overlayImage = await this.overlayImageCache.getOrFetch(overlayName);
		// get base image
		const baseImageRes = await fetch(url);
		const baseImageData = await baseImageRes.arrayBuffer();
		const outputImageBuffer = await applyOverlayToImage(baseImageData, overlayImage, {
			resize: (width != null && height != null) ? {width,height} : undefined,
			keepAspectRatio: true,
		});
		const contentType = baseImageRes.headers.get('Content-Type');
		if(contentType) {
			res.setHeader('Content-Type', contentType);
		}
		const origin = req.headers['origin'];
		if(origin) {
			res.setHeader('Access-Control-Allow-Origin', origin);
		}
		const cacheControl = baseImageRes.headers.get('Cache-Control');
		if(cacheControl) {
			res.setHeader('Cache-Control', cacheControl);
		}
		res.setHeader('Content-Length', outputImageBuffer.length);
		res.setHeader('X-Plex-Protocol', '1.0');
		res.end(outputImageBuffer);
	}


	async filterResponse<TFilterName extends PseuplexResponseFilterName>(filterName: TFilterName, resData: Parameters<NonNullable<PseuplexResponseFilters[TFilterName]>>[0], context: Parameters<NonNullable<PseuplexResponseFilters[TFilterName]>>[1]) {
		const filtersList = this.responseFilters[filterName];
		if (filtersList) {
			const promises = context.previousFilterPromises?.slice(0) ?? [];
			for(const filterDef of filtersList) {
				const result = filterDef.filter?.(resData as any, {
					...context,
					previousFilterPromises: promises.slice(0)
				} as any);
				if(result) {
					promises.push(result.catch((error) => {
						const urlToLog = this.logger?.urlString(context.userReq.url) ?? context.userReq.url;
						console.error(`Filter for ${urlToLog} response failed:`);
						console.error(error);
					}));
				}
			}
			await Promise.all(promises);
		}
		return resData;
	}

	// remaps private IDs (such as "letterboxd:film:mission-impossible") to plex-acceptable IDs (such as "-2")
	remapHubMetadataIdsIfNeeded(hub: plexTypes.PlexHubWithItems, privateToPublicIds?: PseuplexPrivateToPublicIDsMap) {
		if(!this.metadataIdMappings) {
			return;
		}
		// check if hub key needs to be mapped
		if(hub.hubKey) {
			let metadataKeyParts = parseMetadataIDFromKey(hub.hubKey, '/library/metadata/');
			let metadataIds: (string | number)[] | undefined = metadataKeyParts?.id.split(',');
			if(metadataIds) {
				for(let i=0; i<metadataIds.length; i++) {
					const metadataIdString = `${metadataIds[i]}`;
					const metadataId = parseMetadataID(metadataIdString);
					if(!metadataId.source || metadataId.source == PseuplexMetadataSource.Plex) {
						// don't map plex IDs
						continue;
					}
					// map the ID
					const publicId = privateToPublicIds?.[metadataIdString] ?? this.metadataIdMappings.getPublicIDFromPrivateID(metadataIdString);
					metadataIds[i] = publicId;
				}
				hub.hubKey = `/library/metadata/${metadataIds.join(',')}` + (metadataKeyParts?.relativePath ?? '');
			}
		}
		// remap metadata items if needed
		if(hub.Metadata) {
			for(const metadataItem of hub.Metadata) {
				this.remapMetadataIdsIfNeeded(metadataItem, privateToPublicIds);
			}
		}
	}

	// remaps private IDs (such as "letterboxd:film:mission-impossible") to plex-acceptable IDs (such as "-2")
	remapMetadataIdsIfNeeded(metadataItem: plexTypes.PlexMetadataItem, privateToPublicIds?: PseuplexPrivateToPublicIDsMap) {
		if(!this.metadataIdMappings) {
			return;
		}
		if(metadataItem.key) {
			metadataItem.key = this.metadataIdMappings.getPublicSanitizedMetadataKey(metadataItem.key, metadataItem.ratingKey, privateToPublicIds);
		}
		if(metadataItem.ratingKey) {
			metadataItem.ratingKey = this.metadataIdMappings.getPublicSanitizedMetadataRatingKey(metadataItem.ratingKey, privateToPublicIds);
		}
		if(metadataItem.parentKey) {
			metadataItem.parentKey = this.metadataIdMappings.getPublicSanitizedMetadataKey(metadataItem.parentKey, metadataItem.parentRatingKey, privateToPublicIds);
		}
		if(metadataItem.parentRatingKey) {
			metadataItem.parentRatingKey = this.metadataIdMappings.getPublicSanitizedMetadataRatingKey(metadataItem.parentRatingKey, privateToPublicIds);
		}
		if(metadataItem.grandparentKey) {
			metadataItem.grandparentKey = this.metadataIdMappings.getPublicSanitizedMetadataKey(metadataItem.grandparentKey, metadataItem.grandparentRatingKey, privateToPublicIds);
		}
		if(metadataItem.grandparentRatingKey) {
			metadataItem.grandparentRatingKey = this.metadataIdMappings.getPublicSanitizedMetadataRatingKey(metadataItem.grandparentRatingKey, privateToPublicIds);
		}
		// map related items if needed
		if(metadataItem.Related?.Hub) {
			for(const hub of metadataItem.Related.Hub) {
				this.remapHubMetadataIdsIfNeeded(hub, privateToPublicIds);
			}
		}
	}

	

	async getPluginSections(context: PseuplexRequestContext): Promise<PseuplexSection[]> {
		const sections: PseuplexSection[] = [];
		for(const pluginSlug of Object.keys(this.plugins)) {
			const plugin = this.plugins[pluginSlug];
			const pluginSections = await plugin.getSections?.(context);
			if(pluginSections && pluginSections.length > 0) {
				for(const section of pluginSections) {
					sections.push(section);
				}
			}
		}
		return sections;
	}

	async hasPluginSections(context: PseuplexRequestContext): Promise<boolean> {
		for(const pluginSlug of Object.keys(this.plugins)) {
			const plugin = this.plugins[pluginSlug];
			if(await plugin.hasSections?.(context)) {
				return true;
			}
		}
		return false;
	}



	getClientWebSockets(plexToken: string): PseuplexClientWebSocketInfo[] | undefined {
		const sockets = this.clientWebSockets[plexToken];
		if(!sockets) {
			return undefined;
		}
		return sockets
			.filter((s) => s.proxySocket) as PseuplexClientWebSocketInfo[];
	}

	getEventSourceSubscribers(plexToken: string): PseuplexEventSourceSubscriber[] | undefined {
		const subscribers = this.eventSourceSubscribers[plexToken];
		if(!subscribers) {
			return undefined;
		}
		return subscribers
			.filter((s) => s.proxyResponse) as PseuplexEventSourceSubscriber[];
	}

	getClientNotificationSenders(plexToken: string): PlexNotificationSender[] | undefined {
		const clientWebsockets = this.clientWebSockets[plexToken];
		const eventSubscribers = this.eventSourceSubscribers[plexToken];
		if(!clientWebsockets && !eventSubscribers) {
			return undefined;
		}
		const senders: PlexNotificationSender[] = [];
		if(clientWebsockets) {
			for(const socketInfo of clientWebsockets) {
				if(!socketInfo.proxySocket) {
					// socket hasn't received a response from the server yet, so we shouldn't send any notifications
					continue;
				}
				if(socketInfo.endpoint === WebsocketNotificationsEndpoint) {
					senders.push({
						type: PlexNotificationSenderType.Websocket,
						token: plexToken,
						socket: socketInfo.socket,
					});
				}
			}
		}
		if(eventSubscribers) {
			for(const subscriber of eventSubscribers) {
				if(!subscriber.proxyResponse) {
					// request hasn't received a response from the server yet, so we shouldn't send any notifications
					continue;
				}
				senders.push({
					type: PlexNotificationSenderType.EventSource,
					token: plexToken,
					response: subscriber.response
				});
			}
		}
		return senders;
	}

	sendPluginMetadataTimelineRefreshForItemIDsIfAble(itemIDs: string[]) {
		if(!this.pluginMetadataAccessCache || itemIDs.length == 0) {
			return;
		}
		(async () => {
			try {
				const guids = new Set<string>();
				// fetch item IDs from server
				let metadataPage: plexTypes.PlexMetadataPage | undefined;
				try {
					const metadataTask = plexServerAPI.getLibraryMetadata(itemIDs, {
						serverURL: this.plexServerURL,
						authContext: this.plexAdminAuthContext,
						logger: this.logger,
					});
					for(const itemID of itemIDs) {
						// cache ID to guid mapping
						this.plexServerIdToGuidCache.setSync(itemID, metadataTask.then((metadataPage) => {
							const matchingItem = findInArrayOrSingle(metadataPage.MediaContainer.Metadata, (item) => {
								return item.ratingKey == itemID;
							});
							return matchingItem?.guid;
						}, (error) => {
							if((error as HttpResponseError).httpResponse?.status == 404) {
								return null;
							}
							throw error;
						}));
					}
					metadataPage = await metadataTask;
				} catch(error) {
					if((error as HttpResponseError).httpResponse?.status != 404) {
						console.error(`Error fetching metadata items [ ${itemIDs.join(', ')} ] to forward refresh to plugin metadata:`);
						console.error(error);
					}
					return;
				}
				// find guids to map to plugin metadata
				if(metadataPage) {
					forArrayOrSingle(metadataPage.MediaContainer.Metadata, (item) => {
						if(item.guid) {
							guids.add(item.guid);
						}
					});
				}
				// send notifications for guids if needed
				for(const guid of guids) {
					const guidParts = parsePlexMetadataGuid(guid);
					if(!guidParts || guidParts.protocol != plexTypes.PlexMetadataGuidProtocol.Plex) {
						// skipping
						continue;
					} else if(!guidParts.type) {
						console.warn(`Missing type on plex guid ${guid}`);
						continue;
					}
					const mediaTypeNumeric = plexTypes.PlexMediaItemTypeToNumeric[guidParts.type] ?? guidParts.type;
					const now = (new Date()).getTime() / 1000;
					// get cached plugin metadata IDs for the guid
					const sendNotifOptions = this.plexSendNotificationOptions();
					this.pluginMetadataAccessCache!.forEachAccessorForGuid(guid, ({token,clientId,metadataIds,metadataIdsMap}) => {
						setTimeout(() => {
							try {
								// get notification senders for client
								const notifSenders = this.getClientNotificationSenders(token);
								if(!notifSenders || notifSenders.length == 0) {
									return;
								}
								// send refresh notifications
								for(const metadataId of metadataIds) {
									console.log(`Sending metadata refresh timeline notifications for ${metadataId} on ${notifSenders.length} socket(s)`);
									try {
										sendMetadataRefreshTimelineNotifications(notifSenders, [{
											itemID: metadataId,
											sectionID: "-1",
											type: mediaTypeNumeric,
											updatedAt: now,
										}], sendNotifOptions);
									} catch(error) {
										console.error(`Error sending notification to socket:`);
										console.error(error);
									}
								}
							} catch(error) {
								console.error(`Error handling sockets for forwarded timeline notification:`);
								console.error(error);
							}
						}, 0);
					});
				}
			} catch(error) {
				console.error(`Error forwarding metadata refresh timeline notification to plugin metadata:`);
				console.error(error);
			}
		})();
	}
	
	forwardPluginMetadataActivityRefreshNotificationsIfAble(notifications: plexTypes.PlexActivityNotification[]) {
		if(!this.pluginMetadataAccessCache || notifications.length == 0) {
			return;
		}
		(async () => {
			try {
				const idsToNotifications: {[id: string]: plexTypes.PlexActivityNotification} = {};
				const idsToGuids: {[id: string]: string | null | undefined | Promise<string | null | undefined>} = {};
				// find item ids with existing guid map
				const remainingIdsToMatch = new Set<string>();
				for(const notification of notifications) {
					const metadataKey = notification.Activity?.Context?.key;
					if(!metadataKey) {
						continue;
					}
					// parse metadata id
					const keyParts = parseMetadataIDFromKey(metadataKey, '/library/metadata/');
					if(!keyParts) {
						continue;
					}
					if(!keyParts.id) {
						console.warn(`Unrecognized metadata key structure for key ${metadataKey}`);
						continue;
					}
					// map id to notification
					const { id } = keyParts;
					idsToNotifications[id] = notification;
					// get cached guid task if any
					let guidTask = idsToGuids[id];
					if(guidTask) {
						continue;
					}
					guidTask = this.plexServerIdToGuidCache.get(id);
					if(guidTask) {
						idsToGuids[id] = guidTask;
					} else {
						idsToGuids[id] = undefined; // manually set undefined to ensure id remains consistent
						remainingIdsToMatch.add(id);
					}
				}
				// check that we have any ids mapped
				if(Object.keys(idsToNotifications).length == 0) {
					return;
				}
				// fetch remaining item IDs from server
				if(remainingIdsToMatch.size > 0) {
					// fetch remaining item IDs from server
					const itemIdsToFetch = Array.from(remainingIdsToMatch);
					try {
						const metadataTask = plexServerAPI.getLibraryMetadata(itemIdsToFetch, {
							serverURL: this.plexServerURL,
							authContext: this.plexAdminAuthContext,
							logger: this.logger,
						});
						// convert result to a map of ids to guids
						const guidsMapTask = metadataTask.then((metadataPage) => {
							const idsToGuidsMap: {[id: string]: string} = {};
							forArrayOrSingle(metadataPage.MediaContainer.Metadata, (item) => {
								if(item.guid && item.ratingKey) {
									idsToGuidsMap[item.ratingKey] = item.guid;
								}
							});
							return idsToGuidsMap;
						}, (error) => {
							if((error as HttpResponseError).httpResponse?.status == 404) {
								return null;
							}
							throw error;
						});
						// cache each id to guid mapping
						let lastTask: Promise<any> = guidsMapTask;
						for(const itemID of itemIdsToFetch) {
							// cache ID to guid mapping
							const guidTask = guidsMapTask.then((guidsMap) => {
								return guidsMap?.[itemID] ?? null;
							});
							idsToGuids[itemID] = guidTask;
							this.plexServerIdToGuidCache.setSync(itemID, guidTask);
							lastTask = guidTask;
						}
						await lastTask;
					} catch(error) {
						if((error as HttpResponseError).httpResponse?.status != 404) {
							console.error(`Error fetching metadata items [ ${itemIdsToFetch.join(', ')} ] to forward refresh to plugin metadata:`);
							console.error(error);
						}
					}
				}
				// create map of guids back to the notification
				const guidsToNotifications: {[guid: string]: plexTypes.PlexActivityNotification} = {};
				for(const id of Object.keys(idsToGuids)) {
					const guid = await idsToGuids[id];
					if(!guid) {
						continue;
					}
					const notif = idsToNotifications[id];
					if(!notif) {
						continue;
					}
					guidsToNotifications[guid] = notif;
				}
				// get guids to send notifications
				const guids = Object.keys(guidsToNotifications);
				if(guids.length === 0) {
					return;
				}
				// send notifications for guids after delay
				for(const guid of guids) {
					const notification = guidsToNotifications[guid];
					const sendNotifOptions = this.plexSendNotificationOptions();
					this.pluginMetadataAccessCache!.forEachAccessorForGuid(guid, ({token,clientId,metadataIds,metadataIdsMap}) => {
						setTimeout(() => {
							// get notification senders for client
							const notifSenders = this.getClientNotificationSenders(token);
							if(!notifSenders || notifSenders.length == 0) {
								return;
							}
							// send refresh notifications
							for(const metadataId of metadataIds) {
								const metadataKeys = metadataIdsMap[metadataId];
								for(const metadataKey of metadataKeys) {
									const uuid = crypto.randomUUID();
									console.log(`Sending metadata refresh activity notifications for ${metadataKey} on ${notifSenders.length} socket(s)`);
									try {
										sendPlexNotifications(notifSenders, {
											type: plexTypes.PlexNotificationType.Activity,
											size: 1,
											ActivityNotification: [
												{
													...notification,
													uuid,
													Activity: {
														...notification.Activity,
														uuid,
														Context: {
															...notification.Activity.Context,
															key: metadataKey,
															librarySectionID: undefined,
														}
													}
												}
											]
										}, sendNotifOptions);
									} catch(error) {
										console.error(`Error sending notification to socket:`);
										console.error(error);
									}
								}
							}
						}, 0);
					});
				}
			} catch(error) {
				console.error(`Error forwarding metadata refresh activity to plugin metadata:`);
				console.error(error);
			}
		})();
	}

	sendMetadataUnavailableNotificationsIfNeeded(resData: PseuplexMetadataPage, params: plexTypes.PlexMetadataPageParams, context: PseuplexRequestContext) {
		if(!this.sendsMetadataUnavailability) {
			return;
		}
		if(resData?.MediaContainer?.Metadata) {
			let metadataItems = resData.MediaContainer.Metadata;
			if(!(metadataItems instanceof Array)) {
				metadataItems = [metadataItems];
			}
			// check if we're refreshing file existance
			if(params.checkFiles == 1 || params.asyncCheckFiles == 1
				|| params.refreshLocalMediaAgent == 1 || params.asyncRefreshLocalMediaAgent == 1
				|| params.refreshAnalysis == 1 || params.asyncRefreshAnalysis) {
				// get any items marked unavailable
				const unavailableItems = metadataItems.filter((item) => item.Pseuplex?.unavailable);
				if(unavailableItems.length > 0) {
					// send message after short delay, so that the page is already displayed when the message is received
					setTimeout(() => {
						// send unavailable message for all unavailable items, to all notification senders for the token
						const plexToken = context.plexAuthContext['X-Plex-Token'];
						const notifSenders = plexToken ? this.getClientNotificationSenders(plexToken) : null;
						if(!notifSenders || notifSenders.length == 0) {
							return;
						}
						const childrenSuffix = '/children';
						const sendNotifOptions = this.plexSendNotificationOptions();
						for(const metadataItem of unavailableItems) {
							if(metadataItem.Pseuplex.unavailable) {
								let metadataItemKey = metadataItem.key;
								if(metadataItemKey.endsWith(childrenSuffix)) {
									metadataItemKey = metadataItemKey.slice(0, metadataItemKey.length-childrenSuffix.length);
									if(!metadataItemKey || metadataItemKey == '/library/metadata') {
										if(metadataItem.ratingKey) {
											metadataItemKey = `/library/metadata/${metadataItem.ratingKey}`;
										} else {
											metadataItemKey = metadataItem.key;
										}
									}
								}
								console.log(`Sending unavailable notifications for ${metadataItemKey} on ${notifSenders.length} socket(s)`);
								try {
									sendMediaUnavailableNotifications(notifSenders, {
										userID: context.plexUserInfo.serverUserID,
										metadataKey: metadataItemKey,
									}, sendNotifOptions);
								} catch(error) {
									console.error(`Error sending notification to socket:`);
									console.error(error);
								}
							}
						}
					}, 100);
				}
			}
		}
	}
}
