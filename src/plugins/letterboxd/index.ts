import qs from 'querystring';
import * as letterboxd from 'letterboxd-retriever';
import * as plexTypes from '../../plex/types';
import {
	doesRequestIncludeFirstPinnedContentDirectory,
	IncomingPlexAPIRequest,
} from '../../plex/requesthandling';
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
	stringifyPseuplexMetadataID,
	PseuplexMetadataProvider,
	PseuplexSection,
	PseuplexMetadataRelatedHubsResponseFilterContext,
	PseuplexMetadataItem,
	PseuplexRouterApp,
	stringifyPartialPseuplexMetadataID,
} from '../../pseuplex';
import { LetterboxdPluginConfig } from './config';
import {
	LetterboxdMetadataProvider
} from './metadata';
import * as lbHubs from './hubs'
import * as lbTransform from './transform';
import { LetterboxdPluginDef } from './plugindef';
import { RequestExecutor } from '../../fetching/RequestExecutor';
import {
	forArrayOrSingleAsyncParallel,
	pushToArray,
} from '../../utils/misc';

export default (class LetterboxdPlugin implements LetterboxdPluginDef, PseuplexPlugin {
	static slug = 'letterboxd';
	readonly slug: string = LetterboxdPlugin.slug;
	readonly app: PseuplexApp;
	readonly metadata: LetterboxdMetadataProvider;
	readonly hubs: {
		readonly userFollowingActivity: PseuplexHubProvider & {readonly basePath: string};
		readonly similar: PseuplexHubProvider & {readonly basePath: string};
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
		const hubsBasePath = `${this.basePath}/hubs`;
		this.hubs = {
			userFollowingActivity: new class extends PseuplexHubProvider {
				readonly basePath = `${hubsBasePath}/following`;
				override path(id: string) {
					return `${this.basePath}/${id}`;
				}
				override fetch(letterboxdUsername: string): PseuplexHub | Promise<PseuplexHub> {
					// TODO validate that the profile exists
					return lbHubs.createUserFollowingFeedHub(letterboxdUsername, {
						hubPath: this.path(letterboxdUsername),
						style: plexTypes.PlexHubStyle.Shelf,
						promoted: true,
						uniqueItemsOnly: true,
						letterboxdMetadataProvider: self.metadata,
						metadataTransformOptions: app.metadataTransformOptions(),
						//section: section,
						//matchToPlexServerMetadata: true
						logger: app.logger,
						requestExecutor,
					});
				}
			}(),
			
			similar: new class extends PseuplexHubProvider {
				readonly basePath = `${hubsBasePath}/similar`;
				override path(id: string) {
					return `${this.basePath}/${qs.escape(id)}`;
				}
				override transformHubID(id: string): (string | Promise<string>) {
					if(id.indexOf(':') != -1) {
						return id;
					}
					return `film:${id}`;
				}
				override fetch(metadataId: PseuplexPartialMetadataIDString): PseuplexHub | Promise<PseuplexHub> {
					return lbHubs.createSimilarItemsHub(metadataId, {
						hubPath: this.path(metadataId),
						title: "Similar Films on Letterboxd",
						style: plexTypes.PlexHubStyle.Shelf,
						//promoted: true,
						letterboxdMetadataProvider: self.metadata,
						metadataTransformOptions: app.metadataTransformOptions(),
						defaultCount: 12,
						logger: app.logger,
						requestExecutor,
					});
				}
			}(),

			list: new class extends PseuplexHubProvider {
				readonly basePath = `${self.basePath}/list`;
				override path(id: string) {
					return `${this.basePath}/${id}`;
				}
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
					return lbHubs.createListHub(listId, {
						hubPath: this.path(listId),
						metadataTransformOptions: app.metadataTransformOptions(),
						style: plexTypes.PlexHubStyle.Shelf,
						promoted: true,
						letterboxdMetadataProvider: self.metadata,
						defaultCount: 12,
						logger: app.logger,
						requestExecutor,
					});
				}
			}()
		};
		
		// create metadata provider
		this.metadata = new LetterboxdMetadataProvider({
			//section: this.section,
			plexMetadataClient: this.app.plexMetadataClient,
			relatedHubsProviders: [
				this.hubs.similar,
			],
			plexIdToInfoCache: this.app.plexIdToInfoCache,
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
			// similar items hub will already be included with the metadata provider
			if(context.metadataId.source != this.metadata.sourceSlug) {
				await this._addSimilarItemsHubIfNeeded(resData, context);
			}
		},
	}

	defineRoutes(router: PseuplexRouterApp) {
		// get similar films on letterboxd as a hub
		router.provideHub(`${this.hubs.similar.basePath}/:filmId`, this.hubs.similar, {
			auth: true,
			hubArgParam: 'filmId',
		});
		
		// get letterboxd friend activity as a hub
		router.provideHub(`${this.hubs.userFollowingActivity.basePath}/:letterboxdUsername`, this.hubs.userFollowingActivity, {
			auth: true,
			hubArgParam: 'letterboxdUsername',
		});
		
		// get letterboxd list as a hub
		router.provideHub(`${this.hubs.list.basePath}/:listId`, this.hubs.list, {
			auth: true,
			hubArgParam: 'listId', 
		});
	}


	async _addFriendsActivityHubIfNeeded(resData: plexTypes.PlexLibraryHubsPage, context: PseuplexResponseFilterContext): Promise<void> {
		const userInfo = context.userReq.plex.userInfo;
		// get prefs
		const config = this.config;
		const userPrefs = config.perUser[userInfo.email];
		const friendsActvityHubEnabled = userPrefs?.letterboxd?.friendsActivityHubEnabled ?? config.letterboxd?.friendsActivityHubEnabled ?? false;
		// add friends activity feed hub if enabled
		if(friendsActvityHubEnabled && userPrefs?.letterboxd?.username) {
			const plexParams = plexTypes.parsePlexHubPageParams(context.userReq, {fromListPage:true});
			const hub = await this.hubs.userFollowingActivity.get(userPrefs.letterboxd.username);
			const page = await hub.getHubListEntry(plexParams, this.app.contextForRequest(context.userReq));
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
				letterboxdId = stringifyPartialPseuplexMetadataID(metadataId);
			} else {
				// get plex guid
				let plexGuid: string | null | undefined = null;
				if(metadataId.source == PseuplexMetadataSource.Plex) {
					plexGuid = stringifyPseuplexMetadataID({
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
		const reqParams: plexTypes.PlexMetadataPageParams = context.userReq.plex.requestParams;
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
					console.log(`Fetching letterboxd friend reviews for film ${JSON.stringify(getFilmOpts)} and user ${letterboxdUsername}`);
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
} satisfies PseuplexPluginClass);
