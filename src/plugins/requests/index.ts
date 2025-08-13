
import express from 'express';
import * as plexTypes from '../../plex/types';
import * as plexServerAPI from '../../plex/api';
import { parsePlexMetadataGuid } from '../../plex/metadataidentifier';
import {
	IncomingPlexAPIRequest,
} from '../../plex/requesthandling';
import { PlexServerAccountInfo } from '../../plex/accounts';
import {
	PseuplexApp,
	PseuplexConfigBase,
	PseuplexMetadataChildrenPage,
	PseuplexMetadataProvider,
	PseuplexMetadataSource,
	PseuplexPlugin,
	PseuplexPluginClass,
	PseuplexReadOnlyResponseFilters,
	PseuplexRequestContext,
	PseuplexResponseFilterContext
} from '../../pseuplex';
import * as extPlexTransform from '../../pseuplex/externalplex/transform';
import {
	parseStringQueryParam,
	parseIntQueryParam,
} from '../../utils/queryparams';
import {
	pushToArray,
	isArrayNullOrEmpty,
	findInArrayOrSingle,
	forArrayOrSingle,
	firstOrSingle,
	transformArrayOrSingle
} from '../../utils/misc';
import {
	RequestsProvider,
	RequestsProviders,
} from './provider';
import OverseerrRequestsProvider from './providers/overseerr';
import { PlexRequestsHandler } from './handler';
import * as reqsTransform from './transform';
import { RequestsPluginConfig } from './config';
import { RequestsPluginDef } from './plugindef';

const RequestProviderClasses = [
	OverseerrRequestsProvider,
];

export default (class RequestsPlugin implements RequestsPluginDef, PseuplexPlugin {
	static slug = 'requests';
	readonly slug = RequestsPlugin.slug;
	readonly app: PseuplexApp;
	readonly requestsHandler: PlexRequestsHandler;

	constructor(app: PseuplexApp) {
		this.app = app;
		this.requestsHandler = new PlexRequestsHandler({
			plugin: this,
			basePath: `/${this.app.slug}/${PseuplexMetadataSource.Request}`,
			requestProviders: RequestProviderClasses.map((providerClass) => {
				return new providerClass(app);
			})
		});
	}

	get basePath(): string {
		return `/${this.app.slug}/${this.slug}`;
	}

	get metadataProviders(): PseuplexMetadataProvider[] {
		return [this.requestsHandler];
	}

	get config(): RequestsPluginConfig {
		return this.app.config as RequestsPluginConfig;
	}

	responseFilters?: PseuplexReadOnlyResponseFilters = {
		findGuidInLibrary: async (resData, filterContext) => {
			const reqContext = this.app.contextForRequest(filterContext.userReq);
			const plexUserToken = reqContext.plexAuthContext?.['X-Plex-Token'];
			if(!plexUserToken) {
				return;
			}
			const plexUserInfo = filterContext.userReq.plex.userInfo;
			// check if requests are enabled
			const requestsEnabled = this.requestsEnabledForContext(reqContext);
			if(!requestsEnabled) {
				return;
			}
			// wait for all previous filters
			await Promise.all(filterContext.previousFilterPromises ?? []);
			// only show request option if no items were found
			if(!isArrayNullOrEmpty(resData.MediaContainer.Metadata)) {
				return;
			}
			// get request provider
			const requestProvider = await this.requestsHandler.getRequestsProviderForPlexUser(plexUserToken, plexUserInfo);
			if(!requestProvider) {
				return;
			}
			// parse params
			let mediaType = parseIntQueryParam(filterContext.userReq.query['type']) as plexTypes.PlexMediaItemTypeNumeric;
			let guid = parseStringQueryParam(filterContext.userReq.query['guid']);
			let season: number | undefined = undefined;
			if(!guid) {
				guid = parseStringQueryParam(filterContext.userReq.query['show.guid']);
				if(!guid) {
					return;
				}
				season = parseIntQueryParam(filterContext.userReq.query['season.index']);
			}
			if(mediaType == null) {
				const guidParts = parsePlexMetadataGuid(guid);
				if(guidParts?.protocol == plexTypes.PlexMetadataGuidProtocol.Plex && guidParts.type) {
					mediaType = plexTypes.PlexMediaItemTypeToNumeric[guidParts.type];
				} else {
					console.error(`No media type specified in request`);
					return;
				}
			}
			// create hook metadata
			const metadataItem = await this.requestsHandler.createRequestButtonMetadata({
				mediaType,
				guid,
				season,
				requestProvider,
				plexMetadataClient: this.app.plexMetadataClient,
				context: reqContext,
				moviesLibraryId: this.config.plex.requestedMoviesLibraryId,
				tvShowsLibraryId: this.config.plex.requestedTVShowsLibraryId,
				useLibraryMetadataPath: this.app.alwaysUseLibraryMetadataPath,
			});
			if(!metadataItem) {
				return;
			}
			resData.MediaContainer.Metadata = pushToArray(resData.MediaContainer.Metadata, metadataItem);
			resData.MediaContainer.size += 1;
		},

		metadataChildren: async (resData, filterContext) => {
			const reqContext = this.app.contextForRequest(filterContext.userReq);
			const plexUserToken = filterContext.userReq.plex.authContext?.['X-Plex-Token'];
			if(!plexUserToken) {
				return;
			}
			const plexUserInfo = filterContext.userReq.plex.userInfo;
			// get prefs
			const requestsEnabled = this.requestsEnabledForContext(reqContext);
			if(!requestsEnabled) {
				return;
			}
			const showRequestableSeasons = this.requestableSeasonsEnabledForContext(reqContext);
			const partiallyAvailableOverlay = this.partiallyAvailableOverlayEnabledForContext(reqContext);
			const requestsProvider = await this.requestsHandler.getRequestsProviderForPlexUser(plexUserToken, plexUserInfo);
			// add requestable seasons if able
			if((showRequestableSeasons || partiallyAvailableOverlay) && !filterContext.metadataId.source && requestsProvider) {
				await Promise.all(filterContext.previousFilterPromises ?? []);
				// get guid for id
				const plexGuid = await this.app.plexServerIdToGuidCache.getOrFetch(filterContext.metadataId.id);
				const plexGuidParts = plexGuid ? parsePlexMetadataGuid(plexGuid) : null;
				if(plexGuidParts?.id
					&& plexGuidParts.type == plexTypes.PlexMediaItemType.TVShow
					&& plexGuidParts.protocol == plexTypes.PlexMetadataGuidProtocol.Plex
				) {
					const plexParams = filterContext.userReq.plex.requestParams;
					// add requestable seasons if needed
					if(showRequestableSeasons) {
						const fullIdString = reqsTransform.createRequestFullMetadataId({
							mediaType: plexGuidParts.type as plexTypes.PlexMediaItemType,
							plexId: plexGuidParts.id,
							requestProviderSlug: requestsProvider.slug,
						});
						await this.requestsHandler.addRequestableSeasons(resData, {
							plexId: plexGuidParts.id,
							plexType: plexGuidParts.type,
							plexParams: plexParams,
							transformMatchKeys: false,
							metadataBasePath: '/library/metadata',
							qualifiedMetadataIds: true,
							requestsProvider,
							parentKey: `/library/metadata/${fullIdString}`,
							parentRatingKey: fullIdString,
							partiallyAvailableOverlay: partiallyAvailableOverlay,
							overlayedImageEndpoint: this.app.overlayedImageEndpoint,
						}, reqContext);
					}
					else if(partiallyAvailableOverlay && this.app.overlayedImageEndpoint) {
						// fetch other children (seasons) from plex metadata provider
						// TODO cache this data
						const discoverMetadataPage= await this.app.plexMetadataClient.getMetadataChildren(plexGuidParts.id, plexParams);
						// add partially available overlays if needed
						console.log(`adding overlays for ${(resData.MediaContainer.Metadata as any).length} seasons`);
						forArrayOrSingle(resData.MediaContainer.Metadata, (metadataItem) => {
							// find matching child from plex server
							const discoverItem = metadataItem.index != null ?
								findInArrayOrSingle(discoverMetadataPage.MediaContainer.Metadata, (cmpMetadataItem) => {
									return (cmpMetadataItem.index == metadataItem.index);
								})
								: undefined;
							if(!discoverItem) {
								console.log(`skipped`);
								return;
							}
							console.log("adding overlay");
							// add partially available overlay if needed
							reqsTransform.addPartiallyAvailableBannerIfNeeded(metadataItem, discoverItem, {
								overlayedImageEndpoint: this.app.overlayedImageEndpoint!
							});
						});
					}
				}
			}
		},
	}

	defineRoutes(router: express.Express) {
		// handle different paths for a plex request
		for(const endpoint of [
			`${this.requestsHandler.basePath}/:providerSlug/:mediaType/:plexId`,
			`${this.requestsHandler.basePath}/:providerSlug/:mediaType/:plexId/children`,
			`${this.requestsHandler.basePath}/:providerSlug/:mediaType/:plexId/season/:season`,
			`${this.requestsHandler.basePath}/:providerSlug/:mediaType/:plexId/season/:season/children`
		]) {
			const children = endpoint.endsWith(reqsTransform.ChildrenRelativePath);

			// get metadata for requested item
			router.get(endpoint, [
				this.app.middlewares.plexAuthentication,
				this.app.middlewares.plexAPIRequestHandler(async (req: IncomingPlexAPIRequest, res) => {
					// get request properties
					const { providerSlug, mediaType, plexId } = req.params;
					const season = parseIntQueryParam(req.params.season);
					const plexParams = req.plex.requestParams;
					const context = this.app.contextForRequest(req);
					// handle request
					const resData = await this.requestsHandler.handlePlexRequest({
						requestProviderSlug: providerSlug,
						mediaType: mediaType as plexTypes.PlexMediaItemType,
						plexId,
						season
					}, {
						children,
						plexParams,
						context,
						throw404OnNoMatches: true,
						transformMatchKeys: !children,
					});
					// cache metadata access if needed
					if(this.app.pluginMetadataAccessCache) {
						const metadataId = reqsTransform.createRequestPartialMetadataId({
							requestProviderSlug: providerSlug,
							mediaType: mediaType as plexTypes.PlexMediaItemType,
							plexId,
							season,
						});
						let metadataKey = req.path;
						if(children) {
							if(metadataKey.endsWith('/')) {
								metadataKey = metadataKey.slice(0, metadataKey.length-1);
							}
							if(metadataKey.endsWith(reqsTransform.ChildrenRelativePath)) {
								metadataKey = metadataKey.slice(0, metadataKey.length - reqsTransform.ChildrenRelativePath.length);
							}
						}
						this.app.pluginMetadataAccessCache.cachePluginMetadataAccessIfNeeded(this.requestsHandler, metadataId, metadataKey, resData.MediaContainer.Metadata, context);
					}
					// send unavailable notification(s) if needed
					this.app.sendMetadataUnavailableNotificationsIfNeeded(resData, plexParams, context);
					return resData;
				})
			]);

			if(!children) {
				// TODO handle /related routes
			}
		}
	}



	requestsEnabledForContext(context: PseuplexRequestContext) {
		const cfg = this.config;
		const userPrefs = cfg.perUser[context.plexUserInfo.email];
		return userPrefs?.requests?.enabled ?? cfg.requests?.enabled;
	}

	requestableSeasonsEnabledForContext(context: PseuplexRequestContext) {
		const cfg = this.config;
		const userPrefs = cfg.perUser[context.plexUserInfo.email];
		return userPrefs?.requests?.requestableSeasons ?? cfg.requests?.requestableSeasons;
	}

	partiallyAvailableOverlayEnabledForContext(context: PseuplexRequestContext) {
		const cfg = this.config;
		const userPrefs = cfg.perUser[context.plexUserInfo.email];
		return userPrefs?.requests?.partiallyAvailableOverlay ?? cfg.requests?.partiallyAvailableOverlay;
	}

} satisfies PseuplexPluginClass);
