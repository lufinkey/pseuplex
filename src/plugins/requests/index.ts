
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
	stringParam,
	intParam,
	pushToArray,
	isNullOrEmpty,
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
		findGuidInLibrary: async (resData, context) => {
			const plexAuthContext = context.userReq.plex.authContext;
			const plexUserToken = plexAuthContext?.['X-Plex-Token'];
			if(!plexUserToken) {
				return;
			}
			const plexUserInfo = context.userReq.plex.userInfo;
			// check if requests are enabled
			const requestsEnabled = this.config.perUser[plexUserInfo.email]?.requests?.enabled ?? this.config.requests?.enabled;
			if(!requestsEnabled) {
				return;
			}
			// wait for all previous filters
			await Promise.all(context.previousFilterPromises ?? []);
			// only show request option if no items were found
			if(!isNullOrEmpty(resData.MediaContainer.Metadata)) {
				return;
			}
			// get request provider
			const requestProvider = await this.requestsHandler.getRequestsProviderForPlexUser(plexUserToken, plexUserInfo);
			if(!requestProvider) {
				return;
			}
			// parse params
			const mediaType = intParam(context.userReq.query['type']) as plexTypes.PlexMediaItemTypeNumeric;
			let guid = stringParam(context.userReq.query['guid']);
			let season: number | undefined = undefined;
			if(!guid) {
				guid = stringParam(context.userReq.query['show.guid']);
				if(!guid) {
					return;
				}
				season = intParam(context.userReq.query['season.index']);
			}
			// create hook metadata
			const metadataItem = await this.requestsHandler.createRequestButtonMetadata({
				mediaType,
				guid,
				season,
				requestProvider,
				plexMetadataClient: this.app.plexMetadataClient,
				authContext: plexAuthContext,
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

		metadataChildren: async (resData, context) => {
			const plexAuthContext = context.userReq.plex.authContext;
			const plexUserToken = plexAuthContext?.['X-Plex-Token'];
			if(!plexUserToken) {
				return;
			}
			const plexUserInfo = context.userReq.plex.userInfo;
			// get prefs
			const config = this.config;
			const userPrefs = config.perUser[plexUserInfo.email];
			const requestsEnabled = userPrefs?.requests?.enabled ?? config.requests?.enabled;
			if(!requestsEnabled) {
				return;
			}
			const showRequestableSeasons = userPrefs?.requests?.requestableSeasons ?? config.requests?.requestableSeasons;
			const requestProvider = await this.requestsHandler.getRequestsProviderForPlexUser(plexUserToken, plexUserInfo);
			// add requestable seasons if able
			if(showRequestableSeasons && !context.metadataId.source && requestProvider) {
				await Promise.all(context.previousFilterPromises ?? []);
				const requestProviderSlug = requestProvider.slug;
				// get guid for id
				const plexGuid = await this.app.plexServerIdToGuidCache.getOrFetch(context.metadataId.id);
				const plexGuidParts = plexGuid ? parsePlexMetadataGuid(plexGuid) : null;
				if(plexGuidParts
					&& plexGuidParts.type == plexTypes.PlexMediaItemType.TVShow
					&& plexGuidParts.protocol == plexTypes.PlexMetadataGuidProtocol.Plex
				) {
					const fullIdString = reqsTransform.createRequestFullMetadataId({
						mediaType: plexGuidParts.type as plexTypes.PlexMediaItemType,
						plexId: plexGuidParts.id,
						requestProviderSlug,
					});
					await this.requestsHandler.addRequestableSeasons(resData, plexGuidParts.id, {
						plexParams: context.userReq.plex.requestParams,
						transformExistingKeys: false,
						transformOptions: {
							basePath: '/library/metadata',
							qualifiedMetadataIds: true,
							requestProviderSlug,
							parentKey: `/library/metadata/${fullIdString}`,
							parentRatingKey: fullIdString,
						},
					})
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
				this.app.middlewares.plexRequestHandler(async (req: IncomingPlexAPIRequest, res) => {
					// get request properties
					const { providerSlug, mediaType, plexId } = req.params;
					const season = intParam(req.params.season);
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

} as PseuplexPluginClass);
