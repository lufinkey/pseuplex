
import express from 'express';
import * as plexTypes from '../../plex/types';
import { parsePlexMetadataGuid } from '../../plex/metadataidentifier';
import {
	PseuplexApp,
	PseuplexMetadataProvider,
	PseuplexMetadataSource,
	PseuplexPlugin,
	PseuplexPluginClass,
	PseuplexReadOnlyResponseFilters,
	PseuplexRequestContext,
	PseuplexRouterApp,
	stringifyPseuplexMetadataKeyFromIDString
} from '../../pseuplex';
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
			if(resData.MediaContainer.totalSize != null) {
				resData.MediaContainer.totalSize += 1;
			}
		},

		metadataChildren: async (resData, filterContext) => {
			const reqContext = this.app.contextForRequest(filterContext.userReq);
			const plexParams = plexTypes.parsePlexMetadataChildrenPageParams(filterContext.userReq);
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
					// add requestable seasons if needed
					if(showRequestableSeasons) {
						const fullIdString = reqsTransform.createRequestMetadataId({
							mediaType: plexGuidParts.type as plexTypes.PlexMediaItemType,
							plexId: plexGuidParts.id,
							requestProviderSlug: requestsProvider.slug,
						});
						const parentMetadataKey = stringifyPseuplexMetadataKeyFromIDString(fullIdString);
						await this.requestsHandler.addRequestableSeasons(resData, {
							plexId: plexGuidParts.id,
							plexType: plexGuidParts.type,
							plexParams,
							transformMatchKeys: false,
							requestsProvider,
							parentKey: parentMetadataKey,
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

	defineRoutes(router: PseuplexRouterApp) {
		//
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
