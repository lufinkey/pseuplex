import qs from 'querystring';
import express from 'express';
import * as letterboxd from 'letterboxd-retriever';
import * as plexTypes from '../../plex/types';
import {
	doesRequestIncludeFirstPinnedContentDirectory,
	IncomingPlexAPIRequest,
} from '../../plex/requesthandling';
import { parseMetadataIDFromKey } from '../../plex/metadataidentifier';
import {
	PseuplexApp,
	PseuplexPlugin,
	PseuplexPluginClass,
	PseuplexResponseFilterContext,
	PseuplexHub,
	PseuplexHubProvider,
	PseuplexMetadataPage,
	PseuplexPartialMetadataIDString,
	PseuplexReadOnlyResponseFilters,
	PseuplexMetadataIDParts,
	PseuplexMetadataSource,
	PseuplexSimilarItemsHubProvider,
	stringifyMetadataID,
	parsePartialMetadataID,
	stringifyPartialMetadataID,
	PseuplexMetadataProvider,
	PseuplexSection,
	PseuplexRelatedHubsSource,
	getPlexRelatedHubsEndpoints,
	PseuplexMetadataRelatedHubsResponseFilterContext,
	PseuplexMetadataItem
} from '../../pseuplex';
import { LetterboxdPluginConfig } from './config';
import {
	LetterboxdMetadataProvider
} from './metadata';
import {
	createUserFollowingFeedHub,
	createSimilarItemsHub,
	createListHub,
} from './hubs'
import * as lbTransform from './transform';
import { RequestExecutor } from '../../fetching/RequestExecutor';
import { httpError } from '../../utils/error';
import {
	forArrayOrSingleAsyncParallel,
	pushToArray,
	stringParam
} from '../../utils/misc';

export default (class LetterboxdPlugin implements PseuplexPlugin {
	static slug = 'letterboxd';
	readonly slug: string = LetterboxdPlugin.slug;
	readonly app: PseuplexApp;
	readonly metadata: LetterboxdMetadataProvider;
	readonly hubs: {
		readonly userFollowingActivity: PseuplexHubProvider & {readonly basePath: string};
		readonly similar: PseuplexSimilarItemsHubProvider;
		readonly list: PseuplexHubProvider & {readonly basePath: string};
	};
	//readonly section?: PseuplexSection;
	readonly requestExecutor: RequestExecutor;


	constructor(app: PseuplexApp) {
		this.app = app;
		const self = this;
		const requestExecutor = new RequestExecutor({
			maxParallelRequests: 10
		});
		this.requestExecutor = requestExecutor;

		// create section
		/*const section = new PseuplexSection({
			id: -1,//this.slug,
			uuid: "583933fd-07c7-40b6-a18a-bc74304a3102",
			path: this.basePath,
			hubsPath: `${this.basePath}/hubs`,
			title: `Letterboxd Films`,
			hidden: true,
		});
		this.section = section;*/

		// create hub providers
		this.hubs = {
			userFollowingActivity: new class extends PseuplexHubProvider {
				readonly basePath = `${self.basePath}/hubs/following`;
				override fetch(letterboxdUsername: string): PseuplexHub | Promise<PseuplexHub> {
					// TODO validate that the profile exists
					return createUserFollowingFeedHub(letterboxdUsername, {
						hubPath: `${this.basePath}/${letterboxdUsername}`,
						style: plexTypes.PlexHubStyle.Shelf,
						promoted: true,
						uniqueItemsOnly: true,
						letterboxdMetadataProvider: self.metadata,
						...(app.alwaysUseLibraryMetadataPath ? {
							metadataTransformOptions: {
								metadataBasePath: '/library/metadata',
								qualifiedMetadataId: true,
							},
						} : undefined),
						//section: section,
						//matchToPlexServerMetadata: true
						loggingOptions: app.loggingOptions,
						requestExecutor,
					});
				}
			}(),
			
			similar: new class extends PseuplexHubProvider {
				readonly relativePath = 'similar';

				override transformHubID(id: string): (string | Promise<string>) {
					if(id.indexOf(':') != -1) {
						return id;
					}
					return `film:${id}`;
				}

				override fetch(metadataId: PseuplexPartialMetadataIDString): PseuplexHub | Promise<PseuplexHub> {
					return createSimilarItemsHub(metadataId, {
						relativePath: this.relativePath,
						title: "Similar Films on Letterboxd",
						style: plexTypes.PlexHubStyle.Shelf,
						//promoted: true,
						letterboxdMetadataProvider: self.metadata,
						...(app.alwaysUseLibraryMetadataPath ? {
							metadataTransformOptions: {
								metadataBasePath: '/library/metadata',
								qualifiedMetadataId: true,
							},
						} : undefined),
						defaultCount: 12,
						loggingOptions: app.loggingOptions,
						requestExecutor,
					});
				}
			}(),

			list: new class extends PseuplexHubProvider {
				readonly basePath = `${self.basePath}/list`;

				override transformHubID(id: string): string {
					if(!id.startsWith('/') && id.indexOf('://') == -1) {
						return id;
					}
					let hrefParts: letterboxd.ListHrefParts;
					try {
						hrefParts = letterboxd.parseHref(id) as letterboxd.ListHrefParts;
					} catch(error) {
						console.error(`Failed to parse letterboxd href ${id} :`);
						console.error(error);
						return id;
					}
					const { userSlug, listSlug } = hrefParts;
					if(!listSlug) {
						return id;
					}
					// get list params from href (by, with, etc)
					const hrefParams: {[key: string]: any} = {...hrefParts};
					delete hrefParams.base;
					delete hrefParams.userSlug;
					delete hrefParams.listSlug;
					const queryKeys = Object.keys(hrefParams).sort();
					if(queryKeys.length > 0) {
						// href has params
						const query = {};
						for(const key of queryKeys) {
							const val = hrefParts[key];
							if(val instanceof Array) {
								query[key] = val.join(',');
							} else if (typeof val === 'boolean') {
								query[key] = val ? 1 : 0;
							} else {
								query[key] = val;
							}
						}
						return `${userSlug}:${listSlug}?${qs.stringify(query)}`
					} else {
						// href doesn't have params
						return `${userSlug}:${listSlug}`;
					}
				}

				override fetch(listId: lbTransform.PseuplexLetterboxdListID): PseuplexHub | Promise<PseuplexHub> {
					return createListHub(listId, {
						path: `${this.basePath}/${listId}`,
						style: plexTypes.PlexHubStyle.Shelf,
						promoted: true,
						letterboxdMetadataProvider: self.metadata,
						...(app.alwaysUseLibraryMetadataPath ? {
							metadataTransformOptions: {
								metadataBasePath: '/library/metadata',
								qualifiedMetadataId: true,
							},
						} : undefined),
						defaultCount: 12,
						loggingOptions: app.loggingOptions,
						requestExecutor,
					});
				}
			}()
		};
		
		// create metadata provider
		this.metadata = new LetterboxdMetadataProvider({
			basePath: `${this.basePath}/metadata`,
			//section: this.section,
			plexMetadataClient: this.app.plexMetadataClient,
			relatedHubsProviders: [
				this.hubs.similar,
			],
			plexGuidToInfoCache: this.app.plexGuidToInfoCache,
			requestExecutor,
		});
	}

	get basePath(): string {
		return `/${this.app.slug}/${this.slug}`;
	}

	get metadataProviders(): PseuplexMetadataProvider[] {
		return [this.metadata];
	}

	get config(): LetterboxdPluginConfig {
		return this.app.config as LetterboxdPluginConfig;
	}
	
	responseFilters?: PseuplexReadOnlyResponseFilters = {
		hubs: async (resData, context) => {
			await this._addFriendsActivityHubIfNeeded(resData, context);
		},

		promotedHubs: async (resData, context) => {
			if (doesRequestIncludeFirstPinnedContentDirectory(context.userReq.query, {
				plexAuthContext: context.userReq.plex.authContext,
				assumedTopSectionID: this.config.plex?.assumedTopSectionId,
			})) {
				// this is the first pinned content directory
				await this._addFriendsActivityHubIfNeeded(resData, context);
			}
		},

		metadata: async (resData, context) => {
			await this._addFriendReviewsIfNeeded(resData, context);
		},

		metadataRelatedHubs: async (resData, context) => {
			if(context.metadataId.source != this.metadata.sourceSlug) {
				await this._addSimilarItemsHubIfNeeded(resData, context);
			}
		},

		metadataFromProvider: async (resData, context) => {
			await this._addFriendReviewsIfNeeded(resData, context);
		},
	}

	defineRoutes(router: express.Express) {
		// get metadata item(s)
		router.get(`${this.metadata.basePath}/:id`, [
			this.app.middlewares.plexAuthentication,
			this.app.middlewares.plexRequestHandler(async (req: IncomingPlexAPIRequest, res): Promise<plexTypes.PlexMetadataPage> => {
				console.log(`\ngot request for letterboxd item ${req.params.id}`);
				const context = this.app.contextForRequest(req);
				const params: plexTypes.PlexMetadataPageParams = req.plex.requestParams;
				const itemIdsStr = req.params.id?.trim();
				if(!itemIdsStr) {
					throw httpError(400, "No slug was provided");
				}
				const ids = itemIdsStr.split(',');
				// get metadatas from letterboxd
				const metadataProvider = this.metadata;
				const resData = await metadataProvider.get(ids, {
					context: context,
					includePlexDiscoverMatches: true,
					includeUnmatched: true,
					transformMatchKeys: true,
					metadataBasePath: metadataProvider.basePath,
					qualifiedMetadataIds: false,
					plexParams: params,
				});
				// cache metadata access if needed
				if(ids.length == 1) {
					this.app.pluginMetadataAccessCache?.cachePluginMetadataAccessIfNeeded(metadataProvider, ids[0], req.path, resData.MediaContainer.Metadata, context);
				}
				// add related hubs if included
				if(params.includeRelated == 1) {
					// filter related hubs
					await forArrayOrSingleAsyncParallel(resData.MediaContainer.Metadata, async (metadataItem) => {
						const metadataId = metadataItem.Pseuplex.metadataIds[this.metadata.sourceSlug];
						if(!metadataId) {
							return;
						}
						const metadataIdParts = parsePartialMetadataID(metadataId);
						// add letterboxd hubs
						const metadataProvider = this.metadata;
						const relHubsData = await metadataProvider.getRelatedHubs(metadataId, {
							context,
							from: PseuplexRelatedHubsSource.Library,
						});
						const existingRelatedItemCount = (metadataItem.Related?.Hub?.length ?? 0);
						if(existingRelatedItemCount > 0) {
							const relatedItemsOgCount = relHubsData.MediaContainer.size ?? relHubsData.MediaContainer.Hub?.length ?? 0;
							if(relatedItemsOgCount > 0) {
								relHubsData.MediaContainer.Hub = metadataItem.Related!.Hub!.concat(relHubsData.MediaContainer.Hub!);
								relHubsData.MediaContainer.size = relatedItemsOgCount + existingRelatedItemCount;
							}
						}
						// filter response
						await this.app.filterResponse('metadataRelatedHubsFromProvider', relHubsData, {
							userReq:req,
							userRes:res,
							metadataId:metadataIdParts,
							metadataProvider,
							from: PseuplexRelatedHubsSource.Library,
						});
						// apply items hub
						metadataItem.Related = relHubsData.MediaContainer;
					});
				}
				// filter page
				await this.app.filterResponse('metadataFromProvider', resData, {
					userReq:req,
					userRes:res,
					metadataProvider
				});
				// send unavailable notification(s) if needed
				this.app.sendMetadataUnavailableNotificationsIfNeeded(resData, params, context);
				return resData;
			})
		]);
		
		// get hubs related to metadata item
		for(const {endpoint, hubsSource} of getPlexRelatedHubsEndpoints(`${this.metadata.basePath}/:id`)) {
			router.get(endpoint, [
				this.app.middlewares.plexAuthentication,
				this.app.middlewares.plexRequestHandler(async (req: IncomingPlexAPIRequest, res): Promise<plexTypes.PlexHubsPage> => {
					const id = req.params.id;
					const context = this.app.contextForRequest(req);
					const params = plexTypes.parsePlexHubPageParams(req, {fromListPage:true});
					// add similar items hub
					const metadataProvider = this.metadata;
					const resData = await metadataProvider.getRelatedHubs(id, {
						plexParams: params,
						context,
						from: hubsSource,
					});
					// filter response
					const metadataId = parsePartialMetadataID(id);
					await this.app.filterResponse('metadataRelatedHubsFromProvider', resData, {
						userReq:req,
						userRes:res,
						metadataId,
						metadataProvider,
						from: hubsSource,
					});
					// return response
					return resData;
				})
			]);
		}
		
		// get similar films on letterboxd as a hub
		router.get(`${this.metadata.basePath}/:id/${this.hubs.similar.relativePath}`, [
			this.app.middlewares.plexAuthentication,
			this.app.middlewares.plexRequestHandler(async (req: IncomingPlexAPIRequest, res): Promise<plexTypes.PlexHubsPage> => {
				const id = req.params.id;
				const context = this.app.contextForRequest(req);
				const params = plexTypes.parsePlexHubPageParams(req, {fromListPage:false});
				const hub = await this.hubs.similar.get(id);
				return await hub.getHubPage(params, context);
			})
		]);
		
		// get letterboxd friend activity as a hub
		router.get(`${this.hubs.userFollowingActivity.basePath}/:letterboxdUsername`, [
			this.app.middlewares.plexAuthentication,
			this.app.middlewares.plexRequestHandler(async (req: IncomingPlexAPIRequest, res): Promise<plexTypes.PlexMetadataPage> => {
				const context = this.app.contextForRequest(req);
				const letterboxdUsername = req.params['letterboxdUsername'];
				if(!letterboxdUsername) {
					throw httpError(400, "No user provided");
				}
				const params = plexTypes.parsePlexHubPageParams(req, {fromListPage:false});
				const hub = await this.hubs.userFollowingActivity.get(letterboxdUsername);
				return await hub.getHubPage({
					...params,
					listStartToken: stringParam(req.query['listStartToken'])
				}, context);
			})
		]);
		
		// get letterboxd list as a hub
		router.get(`${this.hubs.list.basePath}/:listId`, [
			this.app.middlewares.plexAuthentication,
			this.app.middlewares.plexRequestHandler(async (req: IncomingPlexAPIRequest, res): Promise<plexTypes.PlexHubPage> => {
				const listId = req.params['listId'];
				if(!listId) {
					throw httpError(400, "No list ID provided");
				}
				const context = this.app.contextForRequest(req);
				const params = plexTypes.parsePlexHubPageParams(req, {fromListPage:false});
				const hub = await this.hubs.list.get(listId);
				return await hub.getHubPage(params, context);
			})
		]);
	}


	async _addFriendsActivityHubIfNeeded(resData: plexTypes.PlexLibraryHubsPage, context: PseuplexResponseFilterContext): Promise<void> {
		const userInfo = context.userReq.plex.userInfo;
		// get prefs
		const config = this.config;
		const userPrefs = config.perUser[userInfo.email];
		const friendsActvityHubEnabled = userPrefs?.letterboxd?.friendsActivityHubEnabled ?? config.letterboxd?.friendsActivityHubEnabled ?? false;
		// add friends activity feed hub if enabled
		if(friendsActvityHubEnabled && userPrefs?.letterboxd?.username) {
			const params = plexTypes.parsePlexHubPageParams(context.userReq, {fromListPage:true});
			const hub = await this.hubs.userFollowingActivity.get(userPrefs.letterboxd.username);
			const page = await hub.getHubListEntry(params, this.app.contextForRequest(context.userReq));
			if(!resData.MediaContainer.Hub) {
				resData.MediaContainer.Hub = [];
			} else if(!(resData.MediaContainer.Hub instanceof Array)) {
				resData.MediaContainer.Hub = [resData.MediaContainer.Hub];
			}
			resData.MediaContainer.Hub.splice(0, 0, page);
			resData.MediaContainer.size += 1;
		}
	}

	async _addSimilarItemsHubIfNeeded(resData: plexTypes.PlexHubsPage, context: PseuplexMetadataRelatedHubsResponseFilterContext) {
		const userInfo = context.userReq.plex.userInfo;
		const plexAuthContext = context.userReq.plex.authContext;
		// get prefs
		const config = this.config;
		const userPrefs = config.perUser[userInfo.email];
		// add similar letterboxd movies hub
		if(userPrefs?.letterboxd?.similarItemsEnabled ?? config.letterboxd?.similarItemsEnabled ?? true) {
			const metadataId = context.metadataId;
			let letterboxdId: string | null = null;
			// get plex guid from metadata id
			if(metadataId.source == this.metadata.sourceSlug) {
				// id is already a letterboxd id
				letterboxdId = stringifyPartialMetadataID(metadataId);
			} else {
				// get plex guid
				let plexGuid: string | null | undefined = null;
				if(metadataId.source == PseuplexMetadataSource.Plex) {
					plexGuid = stringifyMetadataID({
						...metadataId,
						isURL:true
					});
				} else if(metadataId.source == null) {
					plexGuid = await this.app.plexServerIdToGuidCache.getOrFetch(metadataId.id);
				}
				else {
					// doesn't have a plex metadata ID, so don't bother adding similar items hub
					// TODO try resolving the plex GUID from the metadata provider
					return;
				}
				if(!plexGuid) {
					// no plex GUID to map to a letterboxd id
					return;
				}
				// get letterboxd id for plex guid
				letterboxdId = await this.metadata.getIDForPlexGUID(plexGuid, {
					plexAuthContext
				});
			}
			if(!letterboxdId) {
				return;
			}
			// get letterboxd similar movies hub
			const hub =  await this.hubs.similar.get(letterboxdId);
			const hubPageParams = plexTypes.parsePlexHubPageParams(context.userReq, { fromListPage:true });
			const hubEntry = await hub.getHubListEntry(hubPageParams, this.app.contextForRequest(context.userReq));
			resData.MediaContainer.Hub = pushToArray(resData.MediaContainer.Hub, hubEntry);
			resData.MediaContainer.size = (resData.MediaContainer.size ?? 0) + 1;
			if(resData.MediaContainer.totalSize != null) {
				resData.MediaContainer.totalSize += 1;
			}
		}
		return resData;
	}

	async _addFriendReviewsIfNeeded(resData: PseuplexMetadataPage, context: PseuplexResponseFilterContext) {
		const userInfo = context.userReq.plex.userInfo;
		const plexAuthContext = context.userReq.plex.authContext;
		const reqParams = context.userReq.plex.requestParams;
		// get prefs
		const config = this.config;
		const userPrefs = config.perUser[userInfo.email];
		const letterboxdFriendsReviewsEnabled = (userPrefs?.letterboxd?.friendsReviewsEnabled ?? config.letterboxd?.friendsReviewsEnabled ?? true);
		// attach letterboxd friends reviews if needed
		const letterboxdUsername = userPrefs?.letterboxd?.username;
		if(letterboxdFriendsReviewsEnabled && letterboxdUsername && reqParams?.includeReviews == 1) {
			await forArrayOrSingleAsyncParallel(resData.MediaContainer.Metadata, async (metadataItem) => {
				try {
					// get letterboxd id
					let letterboxdMetadataId: (string | null | undefined) = metadataItem.Pseuplex.metadataIds[this.metadata.sourceSlug];
					if(!letterboxdMetadataId) {
						if(!metadataItem.guid) {
							return;
						}
						letterboxdMetadataId = await this.metadata.getIDForPlexGUID(metadataItem.guid, {
							metadataItem,
							plexAuthContext
						});
						if(!letterboxdMetadataId) {
							return;
						}
					}
					// attach letterboxd friends reviews
					const getFilmOpts = lbTransform.getFilmOptsFromPartialMetadataId(letterboxdMetadataId);
					const friendViewings = await letterboxd.getReviews({
						...getFilmOpts,
						userSlug: letterboxdUsername,
						friends: true
					});
					const reviews = friendViewings.items.map((viewing) => {
						return lbTransform.viewingToPlexReview(viewing);
					});
					if(metadataItem.Review) {
						metadataItem.Review = reviews.concat(metadataItem.Review);
					} else {
						metadataItem.Review = reviews;
					}
				} catch(error) {
					console.error(`Failed to attach letterboxd friends reviews to plex item with guid ${metadataItem?.guid} and slug ${metadataItem?.slug} :`);
					console.error(error);
				}
			});
		}
	}
} as PseuplexPluginClass);
