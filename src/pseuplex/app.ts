
import http from 'http';
import https from 'https';
import stream from 'stream';
import EventEmitter from 'events';
import express from 'express';
import httpolyglot from 'httpolyglot';
import * as plexTypes from '../plex/types';
import * as plexServerAPI from '../plex/api';
import { PlexServerPropertiesStore } from '../plex/serverproperties';
import {
	PlexServerAccountInfo,
	PlexServerAccountsStore
} from '../plex/accounts';
import {
	PlexGuidToInfoCache,
	createPlexServerIdToGuidCache,
} from '../plex/metadata';
import {
	parseMetadataIDFromKey,
	parsePlexMetadataGuid,
	PlexMetadataGuidParts,
	PlexMetadataKeyParts
} from '../plex/metadataidentifier';
import {
	PseuplexMetadataAccessCache,
	PseuplexMetadataAccessCacheOptions
} from './metadataAccessCache';
import {
	plexApiProxy,
	plexHttpProxy,
	PlexProxyLoggingOptions,
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
import * as extPlexTransform from './externalplex/transform';
import {
	PseuplexMetadataPage,
	PseuplexMetadataItem,
	PseuplexMetadataSource,
	PseuplexServerProtocol,
	PseuplexRequestContext,
} from './types';
import { PseuplexConfigBase } from './configbase';
import {
	stringifyPartialMetadataID,
	stringifyMetadataID,
	PseuplexMetadataIDParts,
	parseMetadataID,
} from './metadataidentifier';
import {
	PseuplexMetadataChildrenProviderParams,
	PseuplexMetadataProvider,
	PseuplexMetadataProviderParams,
	PseuplexMetadataTransformOptions,
	PseuplexRelatedHubsParams,
	PseuplexRelatedHubsSource,
} from './metadata';
import {
	PseuplexClientWebSocketInfo,
	PseuplexPossiblyConfirmedClientWebSocketInfo,
} from './types/sockets';
import {
	PseuplexPlugin,
	PseuplexResponseFilterName,
	PseuplexResponseFilters,
} from './plugin';
import {
	parseMetadataIdFromPathParam,
	pseuplexMetadataIdRequestMiddleware,
	pseuplexMetadataIdsRequestMiddleware
} from './requesthandling';
import { IDMappings } from './idmappings';
import { PseuplexSection } from './section';
import {
	EventSourceNotificationsSocketEndpoint,
	NotificationsWebSocketEndpoint,
	PseuplexClientNotificationWebSocketInfo,
	PseuplexNotificationSocketType,
	PseuplexNotificationsOptions,
	sendMediaUnavailableNotifications,
	sendMetadataRefreshTimelineNotifications,
	sendNotificationToSockets,
} from './notifications';
import { CachedFetcher } from '../fetching/CachedFetcher';
import { urlLogString } from '../utils/logging';
import { httpError, HttpResponseError } from '../utils/error';
import { asyncRequestHandler, expressErrorHandler } from '../utils/requesthandling';
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

type PseuplexAppConfig = PseuplexConfigBase<{[key: string]: any}> & {[key: string]: any};

type PseuplexLoggingOptions = {
	logPlexFuckery?: boolean;
	logOutgoingRequests?: boolean;
	logUserRequests?: boolean;
	logUserRequestHeaders?: boolean;
	logWebsocketMessagesFromUser?: boolean;
	logWebsocketMessagesToUser?: boolean;
	logWebsocketMessagesFromServer?: boolean;
	logWebsocketMessagesToServer?: boolean;
	logWebsocketErrors?: boolean;
} & PlexProxyLoggingOptions;

type PseuplexPlexServerNotificationsOptions = {
	socketRetryInterval?: number;
}

type PseuplexPlayQueueURIResolverOptions = {
	plexMachineIdentifier: string;
	context: PseuplexRequestContext;
};

export type PseuplexAppOptions = {
	slug?: string;
	protocol?: PseuplexServerProtocol;
	port: number;
	ipv4ForwardingMode?: IPv4NormalizeMode;
	forwardMetadataRefreshToPluginMetadata?: boolean;
	alwaysUseLibraryMetadataPath?: boolean;
	serverOptions: https.ServerOptions;
	plexServerURL: string;
	plexAdminAuthContext: plexTypes.PlexAuthContext;
	plexMetadataClient: PlexClient;
	pluginMetadataAccessCacheOptions?: PseuplexMetadataAccessCacheOptions;
	plexServerNotifications?: PseuplexPlexServerNotificationsOptions;
	loggingOptions: PseuplexLoggingOptions,
	responseFilterOrders?: PseuplexResponseFilterOrders;
	plugins: PseuplexPluginClass[];
	config: PseuplexAppConfig;
	mapPseuplexMetadataIds?: boolean;
};

export class PseuplexApp {
	readonly slug: string;
	readonly config: PseuplexAppConfig;
	readonly port: number;
	forwardMetadataRefreshToPluginMetadata: boolean;
	readonly plexServerNotificationsOptions: PseuplexPlexServerNotificationsOptions;
	readonly loggingOptions: PseuplexLoggingOptions;
	readonly plugins: { [slug: string]: PseuplexPlugin } = {};
	readonly metadataProviders: { [sourceSlug: string]: PseuplexMetadataProvider } = {};
	readonly responseFilters: PseuplexResponseFilterLists = {};
	readonly alwaysUseLibraryMetadataPath: boolean;
	readonly metadataIdMappings?: IDMappings;

	readonly plexServerURL: string;
	readonly plexAdminAuthContext: plexTypes.PlexAuthContext;
	readonly plexServerProperties: PlexServerPropertiesStore;
	readonly plexServerAccounts: PlexServerAccountsStore;
	readonly clientWebSockets: {
		[plexToken: string]: PseuplexPossiblyConfirmedClientWebSocketInfo[]
	} = {};
	readonly plexServerIdToGuidCache: CachedFetcher<string | null>;
	readonly plexGuidToInfoCache?: PlexGuidToInfoCache;
	readonly pluginMetadataAccessCache?: PseuplexMetadataAccessCache;
	readonly plexMetadataClient: PlexClient;
	
	private _plexServerNotificationsSocket?: WebSocket | undefined;
	private _listeningToPlexServerNotifications: boolean;
	private _plexServerNotificationsSocketRetryTimeout?: NodeJS.Timeout | undefined;

	readonly middlewares: {
		plexAuthentication: express.RequestHandler;
		plexServerOwnerOnly: PlexAuthedRequestHandler;
		plexRequestHandler: <TResult>(handler: PlexAPIRequestHandler<TResult>) => ((req: express.Request, res: express.Response) => Promise<void>)
	};
	readonly server: http.Server | https.Server;

	constructor(options: PseuplexAppOptions) {
		this.slug = options.slug ?? 'pseuplex';
		this.config = options.config;
		this.port = options.port;
		this.forwardMetadataRefreshToPluginMetadata = options.forwardMetadataRefreshToPluginMetadata ?? true;
		this.alwaysUseLibraryMetadataPath = (options.mapPseuplexMetadataIds || this.forwardMetadataRefreshToPluginMetadata || options.alwaysUseLibraryMetadataPath);
		this.plexServerNotificationsOptions = options.plexServerNotifications ?? {};
		this.loggingOptions = options.loggingOptions;
		if(options.mapPseuplexMetadataIds) {
			this.metadataIdMappings = IDMappings.create();
		}
		
		// define properties
		this.plexServerURL = options.plexServerURL;
		this.plexAdminAuthContext = options.plexAdminAuthContext;
		this.plexServerProperties = new PlexServerPropertiesStore({
			serverURL: this.plexServerURL,
			authContext: this.plexAdminAuthContext,
			verbose: this.loggingOptions.logOutgoingRequests,
		});
		this.plexServerAccounts = new PlexServerAccountsStore({
			plexServerProperties: this.plexServerProperties,
			logPlexFuckery: this.loggingOptions.logPlexFuckery,
		});
		this.plexMetadataClient = options.plexMetadataClient;
		this.plexServerIdToGuidCache = createPlexServerIdToGuidCache({
			serverURL: this.plexServerURL,
			authContext: this.plexAdminAuthContext,
			verbose: this.loggingOptions.logOutgoingRequests,
		});
		this.plexGuidToInfoCache = new PlexGuidToInfoCache({
			plexMetadataClient: this.plexMetadataClient
		});
		this.pluginMetadataAccessCache = this
			? new PseuplexMetadataAccessCache(options.pluginMetadataAccessCacheOptions)
			: undefined;

		// define middlewares
		const plexReqHandlerOpts: PlexAPIRequestHandlerOptions = {
			logResponses: this.loggingOptions.logUserResponses,
			logResponseBody: this.loggingOptions.logUserResponseBody,
			logFullURLs: this.loggingOptions.logFullURLs
		};
		this.middlewares = {
			plexAuthentication: createPlexAuthenticationMiddleware(this.plexServerAccounts),
			plexServerOwnerOnly: (req: IncomingPlexAPIRequest, res, next) => {
				if(!req.plex) {
					next(httpError(500, "Cannot access endpoint without plex authentication"));
					return;
				}
				if (!req.plex.userInfo.isServerOwner) {
					next(httpError(401, "Get out of here you sussy baka"));
					return;
				}
				next();
			},
			plexRequestHandler: <TResult>(handler: PlexAPIRequestHandler<TResult>) => plexAPIRequestHandler(handler, plexReqHandlerOpts)
		};
		
		// loop through and instantiate plugins
		const responseFilterOrders = options.responseFilterOrders ?? {};
		const tmpPluginSlugsSet = new Set<string>();
		for(const pluginClass of options.plugins) {
			// instantiate plugin
			if(pluginClass.slug in this.plugins) {
				console.error(`Ignoring duplicate plugin slug '${pluginClass.slug}'`);
				continue;
			}
			const plugin = new pluginClass(this);

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
					const filter: ResponseFilterDefinition<any> = {
						slug: pluginClass.slug,
						filter: pluginResponseFilters[filterName as PseuplexResponseFilterName]
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

		// create router and define routes
		const protocol = options.protocol ?? PseuplexServerProtocol.httpolyglot;
		const plexProxyArgs: PlexProxyOptions = {
			...this.loggingOptions,
			ipv4Mode: options.ipv4ForwardingMode
		};
		const router = express();

		router.use((req, res, next) => {
			// log request if needed
			if(this.loggingOptions.logUserRequests) {
				console.log(`\n\x1b[42mUser ${req.method} ${urlLogString(this.loggingOptions, req.originalUrl)}\x1b[0m`);
				if(this.loggingOptions.logUserRequestHeaders) {
					const reqHeaderList = req.rawHeaders;
					for(let i=0; i<reqHeaderList.length; i++) {
						const headerKey = reqHeaderList[i];
						i++;
						const headerVal = reqHeaderList[i];
						console.log(`\t${headerKey}: ${headerVal}`);
					}
				}
			}
			next();
		});

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
					// remap IDs if needed (since filters may add hubs)
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
						if(contentDirIds.findIndex((id) => (id == section.id)) == -1) {
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
					// remap IDs if needed (since filters may add hubs)
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
			pseuplexMetadataIdsRequestMiddleware({
				...plexReqHandlerOpts,
				metadataIdMappings: this.metadataIdMappings,
			}, async (req: IncomingPlexAPIRequest, res, metadataIds, keysToIdsMap): Promise<PseuplexMetadataPage> => {
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
				await this.filterResponse('metadata', resData, { userReq:req, userRes:res });
				// remap IDs if needed
				if(this.metadataIdMappings) {
					forArrayOrSingle(resData.MediaContainer.Metadata, (metadataItem) => {
						this.remapMetadataIdIfNeeded(metadataItem, keysToIdsMap);
					});
				}
				// send unavailable notifications if needed
				this.sendMetadataUnavailableNotificationsIfNeeded(resData, params, context);
				return resData;
			}),
			plexApiProxy(this.plexServerURL, plexProxyArgs, {
				responseModifier: async (proxyRes, resData: plexTypes.PlexMetadataPage, userReq: IncomingPlexAPIRequest, userRes) => {
					const params: plexTypes.PlexMetadataPageParams = userReq.plex.requestParams;
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
						if(metadataId && params.includeRelated == 1) {
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
					await this.filterResponse('metadata', resData as PseuplexMetadataPage, { proxyRes, userReq, userRes });
					// no need to remap IDs here, since the request was proxied
					return resData;
				}
			})
		]);

		router.get(`/library/metadata/:metadataId/children`, [
			this.middlewares.plexAuthentication,
			pseuplexMetadataIdRequestMiddleware({
				...plexReqHandlerOpts,
				metadataIdMappings: this.metadataIdMappings,
			}, async (req: IncomingPlexAPIRequest, res, metadataId, keysToIdsMap): Promise<plexTypes.PlexMetadataPage | PseuplexMetadataPage> => {
				const context = this.contextForRequest(req);
				// get metadatas
				const plexParams = {
					...req.plex.requestParams,
					'X-Plex-Container-Start': intParam(req.query['X-Plex-Container-Start'] ?? req.header('x-plex-container-start')),
					'X-Plex-Container-Size': intParam(req.query['X-Plex-Container-Size'] ?? req.header('x-plex-container-size'))
				}
				const resData = await this.getMetadataChildren(metadataId, {
					plexParams: plexParams,
					context,
					cachePluginMetadataAccess: true,
				});
				// remap IDs if needed
				if(this.metadataIdMappings) {
					forArrayOrSingle(resData.MediaContainer.Metadata, (metadataItem) => {
						this.remapMetadataIdIfNeeded(metadataItem, keysToIdsMap);
					});
				}
				// send unavailable notifications if needed
				this.sendMetadataUnavailableNotificationsIfNeeded(resData, plexParams as plexTypes.PlexMetadataPageParams, context);
				return resData;
			}),
			// no need to modify proxied response here (for now)
			plexApiProxy(this.plexServerURL, plexProxyArgs, {
				//
			})
		]);

		for(const hubsSource of Object.values(PseuplexRelatedHubsSource)) {
			router.get(`/${hubsSource}/metadata/:metadataId/related`, [
				this.middlewares.plexAuthentication,
				pseuplexMetadataIdRequestMiddleware({
					...plexReqHandlerOpts,
					metadataIdMappings: this.metadataIdMappings,
				}, async (req: IncomingPlexAPIRequest, res, metadataId, keysToIdsMap): Promise<plexTypes.PlexHubsPage> => {
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
					// remap IDs if needed
					if(this.metadataIdMappings && resData.MediaContainer.Hub) {
						for(const hub of resData.MediaContainer.Hub) {
							this.remapHubMetadataIdsIfNeeded(hub, keysToIdsMap);
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
						// remap IDs if needed (since filters may add hubs)
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
					// remap IDs if needed
					if(this.metadataIdMappings) {
						forArrayOrSingle(resData.MediaContainer.Metadata, (metadataItem) => {
							this.remapMetadataIdIfNeeded(metadataItem);
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
					resData.MyPlex.privatePort = this.port;
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
						return await this.resolvePlayQueueURI(uri, resolveOptions);
					});
					queryItems['uri'] = uriProp;
					return stringifyURLPath(urlPathParts);
				}
			})
		]);

		router.use('/photo', ((req, res, next) => {
			try {
				// TODO implement a way to disallow local IPs that don't refer to the plex server
				const urlPathParts = parseURLPath(req.url);
				const queryItems = urlPathParts.queryItems;
				if(queryItems) {
					let urlQueryArg = queryItems['url'];
					const urlsToRewrite = [
						`http://127.0.0.1:${this.config.port}`,
						`https://127.0.0.1:${this.config.port}`
					];
					if(urlQueryArg) {
						if(urlQueryArg instanceof Array) {
							for(let i=0; i<urlQueryArg.length; i++) {
								const cmpUrl = urlQueryArg[i];
								for(const urlToRewrite of urlsToRewrite) {
									if(cmpUrl.startsWith(urlToRewrite) && cmpUrl[urlToRewrite.length] == '/') {
										urlQueryArg[i] = cmpUrl.substring(urlToRewrite.length);
										break;
									}
								}
							}
						} else {
							for(const urlToRewrite of urlsToRewrite) {
								if(urlQueryArg.startsWith(urlToRewrite) && urlQueryArg[urlToRewrite.length] == '/') {
									urlQueryArg = urlQueryArg.substring(urlToRewrite.length);
									break;
								}
							}
						}
						queryItems['url'] = urlQueryArg;
					}
				}
				req.url = stringifyURLPath(urlPathParts);
			} catch(error) {
				console.error(`Failed to transform photo url for request to url ${req.url} :`);
				console.error(error);
			}
			next();
		}));

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
		
		// create http/https/http+https server
		let server: (http.Server | https.Server);
		switch(protocol) {
			case PseuplexServerProtocol.http:
				server = http.createServer(options.serverOptions, router);
				break;
			case PseuplexServerProtocol.https:
				server = https.createServer(options.serverOptions, router);
				break;
			case PseuplexServerProtocol.httpolyglot:
				server = httpolyglot.createServer(options.serverOptions, router);
				break;
			default:
				console.warn(`Unknown protocol '${protocol}'`);
				server = httpolyglot.createServer(options.serverOptions, router);
				break;
		}

		// handle upgrade to socket
		server.on('upgrade', (req, socket, head) => {
			if(this.loggingOptions.logUserRequests || this.loggingOptions.logWebsocketMessagesFromUser) {
				console.log(`\n\x1b[104mupgrade ws ${req.url}\x1b[0m`);
				if(this.loggingOptions.logUserRequestHeaders) {
					const reqHeaderList = req.rawHeaders;
					for(let i=0; i<reqHeaderList.length; i++) {
						const headerKey = reqHeaderList[i];
						i++;
						const headerVal = reqHeaderList[i];
						console.log(`\t${headerKey}: ${headerVal}`);
					}
				}
			}
			// socket endpoints seem to only get passed the token
			const plexToken = plexTypes.parsePlexTokenFromRequest(req);
			if(plexToken) {
				// save socket info per plex token
				let sockets = this.clientWebSockets[plexToken];
				let endpoint = (req as express.Request).path || parseURLPathParts(req.url).path;
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
				socket.on('close', () => {
					const socketIndex = sockets.indexOf(socketInfo);
					if(socketIndex != -1) {
						sockets.splice(socketIndex, 1);
						if(sockets.length == 0) {
							delete this.clientWebSockets[plexToken];
						}
					} else {
						console.error(`Couldn't find socket to remove for ${req.url}`);
					}
					if(this.loggingOptions.logUserRequests) {
						console.log(`closed socket ${req.url}`);
					}
				});
			}
			plexGeneralProxy.ws(req, socket, head);
		});

		this.server = server;
	}



	listen(callback?: () => void) {
		this.server.listen(this.port, () => {
			if(this.shouldListenToPlexServerNotifications()) {
				this.startListeningToPlexServerNotifications();
			}
			callback?.();
		});
	}

	close(callback: (error?: Error) => void) {
		this.stopListeningToPlexServerNotifications();
		this.server.close(callback);
	}



	shouldListenToPlexServerNotifications(): boolean {
		if(this.forwardMetadataRefreshToPluginMetadata) {
			return true;
		}
		for(const pluginSlug of Object.keys(this.plugins)) {
			const plugin = this.plugins[pluginSlug];
			try {
				if(plugin.shouldListenToPlexServerNotifications()) {
					return true;
				}
			} catch(error) {
				console.error(`Error in plugin ${pluginSlug} when checking whether to listen to plex server notifications:`);
				console.error(error);
			}
		}
		return false;
	}

	startListeningToPlexServerNotifications(): boolean {
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

	stopListeningToPlexServerNotifications(): boolean {
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
				if(this.loggingOptions?.logWebsocketErrors || firstAttempt) {
					console.error(`Plex server websocket failed to open:`);
					console.error(error);
				}
			} else {
				if(this.loggingOptions?.logWebsocketErrors) {
					console.error(`Plex server websocket closed with an error:`);
					console.error(error);
				}
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
		if(this.loggingOptions.logWebsocketMessagesFromServer) {
			console.log(`\nGot websocket message from server:\n${event.data}`);
		}
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
		if(this.forwardMetadataRefreshToPluginMetadata && this.pluginMetadataAccessCache) {
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

	private _notificationsOptions(): PseuplexNotificationsOptions {
		return {
			loggingOptions: this.loggingOptions,
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
			qualifiedMetadataId: true
		};
		const providerParams: PseuplexMetadataProviderParams = {
			...options,
			includePlexDiscoverMatches: true,
			includeUnmatched: true,
			transformMatchKeys: true,
			metadataBasePath: transformOpts.metadataBasePath,
			qualifiedMetadataIds: transformOpts.qualifiedMetadataId
		};
		// get metadata for each id
		const metadataItems = (await Promise.all(metadataIds.map(async (metadataId) => {
			try {
				let source = metadataId.source;
				// if the metadataId doesn't have a source, assume plex
				if (source == null || source == PseuplexMetadataSource.Plex) {
					// fetch from plex
					const fullMetadataId = stringifyMetadataID(metadataId);
					const metadatas = (await plexServerAPI.getLibraryMetadata(fullMetadataId, {
						params: options.plexParams,
						serverURL: context.plexServerURL,
						authContext: context.plexAuthContext,
						verbose: this.loggingOptions.logOutgoingRequests,
					})).MediaContainer?.Metadata;
					// transform metadata
					return transformArrayOrSingle(metadatas, (metadataItem: PseuplexMetadataItem) => {
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
				} else if(source == PseuplexMetadataSource.PlexServer) {
					// fetch from from external plex server
					const itemPlexServerURL = metadataId.directory;
					if(!itemPlexServerURL) {
						throw httpError(400, `Invalid metadata id`);
					}
					const metadatas = (await plexServerAPI.getLibraryMetadata(metadataId.id, {
						serverURL: itemPlexServerURL,
						authContext: context.plexAuthContext,
						params: options.plexParams,
						verbose: this.loggingOptions.logOutgoingRequests,
					})).MediaContainer?.Metadata;
					// transform metadata
					return transformArrayOrSingle(metadatas, (metadataItem: PseuplexMetadataItem) => {
						return extPlexTransform.transformExternalPlexMetadata(metadataItem, itemPlexServerURL, context, transformOpts);
					});
				} else {
					// find matching provider from source
					const metadataProvider = this.getMetadataProvider(source);
					if(!metadataProvider) {
						throw httpError(400, `Unknown metadata source ${source}`);
					}
					// fetch from provider
					const partialId = stringifyPartialMetadataID(metadataId);
					const metadatas = (await metadataProvider.get([partialId], providerParams)).MediaContainer.Metadata;
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
					return metadatas;
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
		}))).reduce<PseuplexMetadataItem[]>((accumulator, element) => {
			if(element) {
				accumulator = accumulator.concat(element);
			}
			return accumulator;
		}, []);
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

	async getMetadataChildren(metadataId: PseuplexMetadataIDParts, options: PseuplexAppMetadataChildrenParams): Promise<PseuplexMetadataPage> {
		const { context } = options;
		// create provider params
		const transformOpts: PseuplexMetadataTransformOptions = {
			metadataBasePath: '/library/metadata',
			qualifiedMetadataId: true
		};
		const providerParams: PseuplexMetadataChildrenProviderParams = {
			...options,
			includePlexDiscoverMatches: true,
			metadataBasePath: transformOpts.metadataBasePath,
			qualifiedMetadataIds: transformOpts.qualifiedMetadataId,
		};
		// get metadata for each id
		let source = metadataId.source;
		// if the metadataId doesn't have a source, assume plex
		if (source == null || source == PseuplexMetadataSource.Plex) {
			// fetch from plex
			const fullMetadataId = stringifyMetadataID(metadataId);
			const metadataPage = await plexServerAPI.getLibraryMetadataChildren(fullMetadataId, {
				params: options.plexParams,
				serverURL: context.plexServerURL,
				authContext: context.plexAuthContext,
				verbose: this.loggingOptions.logOutgoingRequests,
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
				serverURL: itemPlexServerURL,
				authContext: context.plexAuthContext,
				params: options.plexParams,
				verbose: this.loggingOptions.logOutgoingRequests,
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
			const page = await metadataProvider.getChildren(partialId, providerParams);
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
				verbose: this.loggingOptions.logOutgoingRequests,
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
				verbose: this.loggingOptions.logOutgoingRequests,
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


	async resolvePlayQueueURI(uri: string, options: PseuplexPlayQueueURIResolverOptions): Promise<string> {
		const originalURI = uri;
		const uriParts = plexTypes.parsePlayQueueURI(uri);
		if(!uriParts.path) {
			return uri;
		}
		const libraryMetadataPath = '/library/metadata';
		const metadataKeyParts = parseMetadataIDFromKey(uriParts.path, libraryMetadataPath);
		let uriChanged = false;
		if(metadataKeyParts) {
			// path is using /library/metadata
			let metadataIds = metadataKeyParts.id.split(',');
			let parsedMetadataIds = metadataIds.map((id) => parseMetadataID(id));
			// remap if the path is using a mapped id
			if(this.metadataIdMappings) {
				for(let i=0; i<parsedMetadataIds.length; i++) {
					const metadataIdParts = parsedMetadataIds[i];
					if(!metadataIdParts.source) {
						const privateId = this.metadataIdMappings.getPrivateIDFromPublicID(metadataKeyParts.id);
						if(privateId != null) {
							metadataIds[i] = privateId;
							parsedMetadataIds[i] = parseMetadataID(privateId);
							uriChanged = true;
							console.log(`Remapped public metadata id ${metadataIds[i]} to private id ${privateId}`);
						}
					}
				}
			}
			// remap metadata ids for custom providers to plex server items
			const mappingTasks: {[index: number]: Promise<PseuplexMetadataPage>} = {};
			for(let i=0; i<parsedMetadataIds.length; i++) {
				const metadataIdParts = parsedMetadataIds[i];
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
							metadataBasePath: libraryMetadataPath,
						});
					} else {
						console.error(`Cannot resolve metadata id ${metadataIds[i]} for play queue`);
					}
				}
			}
			const remappedIds = Object.keys(mappingTasks);
			if(remappedIds.length > 0) {
				// wait for all metadata tasks and return the resolved IDs
				let caughtError;
				metadataIds = (await Promise.all(metadataIds.map(async (id, index): Promise<string[]> => {
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
							return null;
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
				if(metadataIds.length == 0) {
					if(caughtError) {
						throw caughtError;
					}
					throw httpError(500, "Failed to resolve custom metadata ids for play queue");
				}
				uriChanged = true;
			}
			// rebuild path and uri from metadata ids
			if(uriChanged) {
				uriParts.path = `${libraryMetadataPath}/${metadataIds.join(',')}${metadataKeyParts.relativePath ?? ''}`;
				uri = plexTypes.stringifyPlayQueueURIParts(uriParts);
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
				uri = plexTypes.stringifyPlayQueueURIParts(uriParts);
				uriChanged = true;
				break;
			}
		}
		if(uriChanged) {
			console.log(`Remapped play queue uri ${originalURI} to ${uri}`);
		}
		return uri;
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
						console.error(`Filter for ${urlLogString(this.loggingOptions, context.userReq.url)} response failed:`);
						console.error(error);
					}));
				}
			}
			await Promise.all(promises);
		}
		return resData;
	}

	// remaps private IDs (such as "letterboxd:film:mission-impossible") to plex-acceptable IDs (such as "-2")
	remapHubMetadataIdsIfNeeded(hub: plexTypes.PlexHubWithItems, keysToIdsMap?: {[key: string]: (number | string)}) {
		if(!this.metadataIdMappings) {
			return;
		}
		// check if hub key needs to be mapped
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
				const publicId = keysToIdsMap?.[metadataIdString] ?? this.metadataIdMappings.getPublicIDFromPrivateID(metadataIdString);
				metadataIds[i] = publicId;
			}
			hub.hubKey = `/library/metadata/${metadataIds.join(',')}` + (metadataKeyParts?.relativePath ?? '');
		}
		// remap metadata items if needed
		if(hub.Metadata) {
			for(const metadataItem of hub.Metadata) {
				this.remapMetadataIdIfNeeded(metadataItem, keysToIdsMap);
			}
		}
	}

	// remaps private IDs (such as "letterboxd:film:mission-impossible") to plex-acceptable IDs (such as "-2")
	remapMetadataIdIfNeeded(metadataItem: plexTypes.PlexMetadataItem, keysToIdsMap?: {[key: string]: (number | string)}) {
		if(!this.metadataIdMappings) {
			return;
		}
		// check if ID needs to be mapped
		let metadataKeyParts = parseMetadataIDFromKey(metadataItem.key, '/library/metadata/');
		let metadataIdString = metadataKeyParts?.id;
		if(!metadataIdString) {
			metadataIdString = metadataItem.ratingKey;
			if(!metadataIdString) {
				// failed to find the ID of the item
				return;
			}
		}
		const metadataId = parseMetadataID(metadataIdString);
		if(!metadataId.source || metadataId.source == PseuplexMetadataSource.Plex) {
			// don't map plex IDs
			return;
		}
		// map the ID
		const publicId = keysToIdsMap?.[metadataIdString] ?? this.metadataIdMappings.getPublicIDFromPrivateID(metadataIdString);
		const publicPath = `/library/metadata/${publicId}` + (metadataKeyParts?.relativePath ?? '');
		metadataItem.ratingKey = `${publicId}`;
		metadataItem.key = publicPath;
		// map related items if needed
		if(metadataItem.Related?.Hub) {
			for(const hub of metadataItem.Related.Hub) {
				this.remapHubMetadataIdsIfNeeded(hub, keysToIdsMap);
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
			.filter((si) => si.proxySocket);
	}

	getClientNotificationWebSockets(plexToken: string): PseuplexClientNotificationWebSocketInfo[] | undefined {
		const sockets = this.clientWebSockets[plexToken];
		if(!sockets) {
			return undefined;
		}
		const notifSockets: PseuplexClientNotificationWebSocketInfo[] = [];
		for(const socketInfo of sockets) {
			if(!socketInfo.proxySocket) {
				continue;
			}
			let type: PseuplexNotificationSocketType | undefined;
			switch(socketInfo.endpoint) {
				case NotificationsWebSocketEndpoint:
					type = PseuplexNotificationSocketType.Notification;
					break;

				case EventSourceNotificationsSocketEndpoint:
					type = PseuplexNotificationSocketType.EventSource;
					break;
			}
			if(type == null) {
				continue;
			}
			notifSockets.push({
				plexToken,
				type,
				socket: socketInfo.socket,
				proxySocket: socketInfo.proxySocket,
			});
		}
		return notifSockets;
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
						verbose: this.loggingOptions.logOutgoingRequests,
					});
					for(const itemID of itemIDs) {
						// cache ID to guid mapping
						this.plexServerIdToGuidCache.setSync(itemID, metadataTask.then((metadataPage) => {
							const matchingItem = findInArrayOrSingle(metadataPage.MediaContainer.Metadata, (item) => {
								return item.ratingKey == itemID;
							});
							return matchingItem.guid ?? null;
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
					let guidParts: PlexMetadataGuidParts;
					let mediaTypeNumeric: plexTypes.PlexMediaItemTypeNumeric;
					let now: number;
					this.pluginMetadataAccessCache.forEachAccessorForGuid(guid, ({token,clientId,metadataIds,metadataIdsMap}) => {
						setTimeout(() => {
							// get sockets for client
							const notifSockets = this.getClientNotificationWebSockets(token);
							if(!notifSockets || notifSockets.length == 0) {
								return;
							}
							// parse guid if not done already
							if(!guidParts) {
								guidParts = parsePlexMetadataGuid(guid);
								mediaTypeNumeric = plexTypes.PlexMediaItemTypeToNumeric[guidParts.type] ?? guidParts.type;
								now = (new Date()).getTime() / 1000;
							}
							// send refresh notifications
							for(const metadataId of metadataIds) {
								console.log(`Sending metadata refresh timeline notifications for ${metadataId} on ${notifSockets.length} socket(s)`);
								try {
									sendMetadataRefreshTimelineNotifications(notifSockets, [{
										itemID: metadataId,
										sectionID: "-1",
										type: mediaTypeNumeric,
										updatedAt: now,
									}], this._notificationsOptions());
								} catch(error) {
									console.error(`Error sending notification to socket:`);
									console.error(error);
								}
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
				const idsToGuids: {[id: string]: string | Promise<string>} = {};
				// find item ids with existing guid map
				const remainingIdsToMatch = new Set<string>();
				for(const notification of notifications) {
					const metadataKey = notification.Activity?.Context?.key;
					if(!metadataKey) {
						continue;
					}
					// parse metadata id
					const keyParts = parseMetadataIDFromKey(metadataKey, '/library/metadata/');
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
					let metadataPage: plexTypes.PlexMetadataPage | undefined;
					const itemIdsToFetch = Array.from(remainingIdsToMatch);
					try {
						const metadataTask = plexServerAPI.getLibraryMetadata(itemIdsToFetch, {
							serverURL: this.plexServerURL,
							authContext: this.plexAdminAuthContext,
							verbose: this.loggingOptions.logOutgoingRequests,
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
						let lastTask = guidsMapTask;
						for(const itemID of itemIdsToFetch) {
							// cache ID to guid mapping
							const guidTask = guidsMapTask.then((guidsMap) => {
								return guidsMap[itemID];
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
					this.pluginMetadataAccessCache.forEachAccessorForGuid(guid, ({token,clientId,metadataIds,metadataIdsMap}) => {
						setTimeout(() => {
							// get sockets for client
							const notifSockets = this.getClientNotificationWebSockets(token);
							if(!notifSockets || notifSockets.length == 0) {
								return;
							}
							// send refresh notifications
							for(const metadataId of metadataIds) {
								const metadataKeys = metadataIdsMap[metadataId];
								for(const metadataKey of metadataKeys) {
									const uuid = crypto.randomUUID();
									console.log(`Sending metadata refresh activity notifications for ${metadataKey} on ${notifSockets.length} socket(s)`);
									try {
										sendNotificationToSockets(notifSockets, {
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
										}, this._notificationsOptions());
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
				const unavailableItems = metadataItems.filter((item) => item.Pseuplex.unavailable);
				if(unavailableItems.length > 0) {
					// send message after short delay, so that the page is already displayed when the message is received
					setTimeout(() => {
						// send unavailable message for all unavailable items, to all sockets for the token
						const plexToken = context.plexAuthContext['X-Plex-Token'];
						const notifSockets = plexToken ? this.getClientNotificationWebSockets(plexToken) : null;
						if(notifSockets) {
							for(const metadataItem of unavailableItems) {
								if(metadataItem.Pseuplex.unavailable) {
									console.log(`Sending unavailable notifications for ${metadataItem.key} on ${notifSockets.length} socket(s)`);
									try {
										sendMediaUnavailableNotifications(notifSockets, {
											userID: context.plexUserInfo.serverUserID,
											metadataKey: metadataItem.key,
										}, this._notificationsOptions());
									} catch(error) {
										console.error(`Error sending notification to socket:`);
										console.error(error);
									}
								}
							}
						}
					}, 100);
				}
			}
		}
	}
}
