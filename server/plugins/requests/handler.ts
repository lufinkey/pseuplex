import { PlexClient } from '../../plex/client';
import * as plexTypes from '../../plex/types';
import * as plexServerAPI from '../../plex/api';
import { PlexServerAccountInfo } from '../../plex/accounts';
import {
	parsePlexMetadataGuid,
	parsePlexMetadataGuidOrThrow,
} from '../../plex/metadataidentifier';
import { PlexIdToInfoCache } from '../../plex/metadata';
import {
	PseuplexMetadataPage,
	PseuplexMetadataChildrenProviderParams,
	PseuplexMetadataProvider,
	PseuplexMetadataProviderParams,
	PseuplexMetadataSource,
	PseuplexMetadataItem,
	PseuplexRelatedHubsParams,
	PseuplexRequestContext,
	PseuplexPartialMetadataIDsFromKey,
	PseuplexMetadataChildrenPage,
} from '../../pseuplex';
import * as extPlexTransform from '../../pseuplex/externalplex/transform';
import {
	RequestsProviders,
	RequestsProvider,
} from './provider';
import {
	requestedMediaStatusDisplayText,
	RequestInfo,
	RequestStatus,
	requestStatusDisplayText
} from './types';
import * as reqsTransform from './transform';
import {
	RequestPartialMetadataIDParts,
	TransformRequestMetadataOptions,
} from './transform';
import { Logger } from '../../logging';
import { RequestsPluginDef } from './plugindef';
import { httpError } from '../../utils/error';
import {
	findInArrayOrSingle,
	firstOrSingle,
	forArrayOrSingle,
	transformArrayOrSingle,
	WithOptionalPropsRecursive
} from '../../utils/misc';

export type PlexRequestsHandlerOptions = {
	plugin: RequestsPluginDef;
	basePath: string;
	requestProviders: RequestsProvider[];
	logger?: Logger;
};

export class PlexRequestsHandler implements PseuplexMetadataProvider {
	readonly sourceDisplayName = "Plex Requests";
	readonly sourceSlug = PseuplexMetadataSource.Request;

	readonly plugin: RequestsPluginDef;
	readonly basePath: string;
	readonly requestProviders: RequestsProviders;
	readonly logger?: Logger;

	constructor(options: PlexRequestsHandlerOptions) {
		this.plugin = options.plugin;
		this.basePath = options.basePath;
		const requestProviders: RequestsProviders = {};
		for(const provider of options.requestProviders) {
			requestProviders[provider.slug] = provider;
		}
		this.requestProviders = requestProviders;
		this.logger = options.logger;
	}

	get plexIdToInfoCache(): PlexIdToInfoCache | undefined {
		return this.plugin.app.plexIdToInfoCache;
	}
	
	get plexMetadataClient(): PlexClient {
		return this.plugin.app.plexMetadataClient;
	}
	
	async getRequestsProviderForPlexUser(token: string, userInfo: PlexServerAccountInfo): Promise<RequestsProvider | null> {
		for(const slug in this.requestProviders) {
			const provider = this.requestProviders[slug];
			try {
				if(provider.isConfigured && await provider.canPlexUserMakeRequests(token, userInfo)) {
					return provider;
				}
			} catch(error) {
				console.error(`Failed check for whether user ${userInfo?.email} can make requests:`);
				console.error(error);
			}
		}
		return null;
	}
	
	async createRequestButtonMetadata(options: {
		mediaType: plexTypes.PlexMediaItemTypeNumeric,
		guid: string,
		season?: number,
		requestProvider: RequestsProvider,
		plexMetadataClient: PlexClient,
		authContext?: plexTypes.PlexAuthContext,
		moviesLibraryId?: string | number,
		tvShowsLibraryId?: string | number,
		useLibraryMetadataPath?: boolean,
	}): Promise<plexTypes.PlexMetadataItem | null> {
		// determine properties and get metadata
		let requestActionTitle: string;
		let librarySectionID: string | number | undefined;
		switch(options.mediaType) {
			// since some clients append a "p" to the video resolution,
			//  ending the title with a colon will show :p on those clients lol
			case plexTypes.PlexMediaItemTypeNumeric.Movie:
				requestActionTitle = "Request Movie :";
				librarySectionID = options.moviesLibraryId;
				break;
			case plexTypes.PlexMediaItemTypeNumeric.Show:
				requestActionTitle = "Request Seasons :";
				librarySectionID = options.tvShowsLibraryId;
				break;
			case plexTypes.PlexMediaItemTypeNumeric.Season:
				requestActionTitle = "Request Season :";
				librarySectionID = options.tvShowsLibraryId;
				break;
			case plexTypes.PlexMediaItemTypeNumeric.Episode:
				if(options.requestProvider.canRequestEpisodes) {
					requestActionTitle = "Request Episode :";
				} else {
					requestActionTitle = "Request Season :";
				}
				librarySectionID = options.tvShowsLibraryId;
				break;
			default:
				// can't request type
				console.error(`Cant request type ${options.mediaType}`);
				return null;
		}
		if(librarySectionID == null) {
			// no section specified for the request
			return null;
		}
		// ensure librarySectionID is a number if it can be
		if(typeof librarySectionID === 'string') {
			const numericLibrarySectionID = Number.parseInt(librarySectionID);
			if(!Number.isNaN(numericLibrarySectionID)) {
				librarySectionID = numericLibrarySectionID;
			}
		}
		// fetch metadata from guid
		let metadataItem: plexTypes.PlexMetadataItem | undefined = undefined;
		const guidParts = parsePlexMetadataGuidOrThrow(options.guid);
		if(guidParts.protocol == plexTypes.PlexMetadataGuidProtocol.Local) {
			// cannot fetch from plex metadata provider with a local guid
			console.error(`Cannot fetch plex metadata for guid ${options.guid}`);
			return null;
		}
		else if(guidParts.protocol == plexTypes.PlexMetadataGuidProtocol.Plex) {
			if(options.season != null) {
				const metadataItems = (await options.plexMetadataClient.getMetadataChildren(guidParts.id)).MediaContainer.Metadata;
				this.plexIdToInfoCache?.cacheMetadataItems(metadataItems);
				metadataItem = findInArrayOrSingle(metadataItems, (item) => (item.index == options.season));
			} else {
				const metadataItems = (await options.plexMetadataClient.getMetadata(guidParts.id)).MediaContainer.Metadata;
				this.plexIdToInfoCache?.cacheMetadataItems(metadataItems);
				metadataItem = firstOrSingle(metadataItems);
			}
		}
		else {
			console.error(`Cannot fetch metadata for unrecognized guid ${options.guid}`);
			return null;
		}
		if(!metadataItem) {
			console.error(`No matching metadata found from plex for guid ${options.guid}`);
			return null;
		}
		// create hook metadata
		const requestMetadataItem: WithOptionalPropsRecursive<plexTypes.PlexMetadataItem> = {
			guid: options.guid,
			key: reqsTransform.createRequestItemMetadataKey({
				metadataBasePath: options.useLibraryMetadataPath ? '/library/metadata' : this.basePath,
				qualifiedMetadataId: options.useLibraryMetadataPath ?? false,
				requestProviderSlug: options.requestProvider.slug,
				mediaType: guidParts.type as plexTypes.PlexMediaItemType,
				plexId: guidParts.id,
				season: options.season,
				children: (options.mediaType == plexTypes.PlexMediaItemTypeNumeric.Show)
			}),
			ratingKey: reqsTransform.createRequestFullMetadataId({
				requestProviderSlug: options.requestProvider.slug,
				mediaType: guidParts.type as plexTypes.PlexMediaItemType,
				plexId: guidParts.id,
				season: options.season
			}),
			type: options.mediaType == plexTypes.PlexMediaItemTypeNumeric.Show ? // TV shows should display as movies so that the "request" text shows up
				plexTypes.PlexMediaItemType.Movie 
				: plexTypes.PlexMediaItemNumericToType[options.mediaType],
			title: requestActionTitle,
			slug: metadataItem.slug,
			parentSlug: metadataItem.parentSlug,
			grandparentSlug: metadataItem.grandparentSlug,
			librarySectionTitle: requestActionTitle,
			librarySectionID,
			librarySectionKey: `/library/sections/${librarySectionID}`,
			childCount: (options.mediaType == plexTypes.PlexMediaItemTypeNumeric.Show) ? 0 : undefined, //metadataItem.childCount,
			Media: [{
				id: 1,
				videoResolution: requestActionTitle,
				Part: [
					{
						id: 1
					}
				]
			}]
		};
		return requestMetadataItem as plexTypes.PlexMetadataItem;
	}


	async handlePlexRequest(id: RequestPartialMetadataIDParts, options: {
		children?: boolean,
		plexParams?: plexTypes.PlexMetadataPageParams | plexTypes.PlexMetadataChildrenPageParams,
		context: PseuplexRequestContext,
		// Indicates whether to return items that couldn't be matched to items on the plex server
		includeUnmatched?: boolean;
		// Indicates whether to transform the keys of items matched to plex server items back to their plugin custom keys
		transformMatchKeys?: boolean;
		// The base path to use when transforming metadata keys
		metadataBasePath?: string;
		// Whether to use full metadata IDs in the transformed metadata keys
		qualifiedMetadataIds?: boolean;
		// Whether to throw a 404 error if includeUnmatched is false and no matches were found
		throw404OnNoMatches?: boolean;
	}): Promise<PseuplexMetadataPage> {
		const { context } = options;
		// find requests provider
		const providerSlug = id.requestProviderSlug;
		const reqProvider = this.requestProviders[providerSlug];
		if(!reqProvider) {
			throw httpError(400, `No requests provider with ID ${providerSlug}`);
		} else if(!reqProvider.isConfigured) {
			throw httpError(418, `Requests provider with ID ${providerSlug} is not configured`);
		}
		// ensure user is allowed to make requests to this request provider
		const userToken = context.plexAuthContext['X-Plex-Token'];
		if(!userToken || !(await reqProvider.canPlexUserMakeRequests(userToken, context.plexUserInfo))) {
			throw httpError(403, `User is not allowed to make ${reqProvider.slug} requests`);
		}
		// get numeric media type
		let numericMediaType = plexTypes.PlexMediaItemTypeToNumeric[id.mediaType];
		if(numericMediaType == null) {
			throw httpError(400, `Unknown media type ${id.mediaType}`);
		}
		// create options for transforming metadata
		const fullIdString = reqsTransform.createRequestFullMetadataId(id);
		const metadataBasePath = options.metadataBasePath || this.basePath;
		const qualifiedMetadataIds = options.qualifiedMetadataIds ?? false;
		const childrenTransformOpts = options.children ? {
			parentRatingKey: fullIdString,
			parentKey: (qualifiedMetadataIds ?
				`${metadataBasePath}/${fullIdString}`
				: `${metadataBasePath}/${reqsTransform.createRequestPartialMetadataId(id)}`),
		} : undefined;
		// check if item already exists on the plex server
		const guid = `plex://${id.mediaType}/${id.plexId}`;
		const libraryMetadataPage = await plexServerAPI.findLibraryMetadata((
			(numericMediaType == plexTypes.PlexMediaItemTypeNumeric.Show && id.season != null) ? {
				type: plexTypes.PlexMediaItemTypeNumeric.Season,
				'show.guid': guid,
				'season.index': id.season
			}
			: {
				type: numericMediaType,
				guid: guid
			}
		), {
			serverURL: context.plexServerURL,
			authContext: context.plexAuthContext,
			logger: this.logger,
		});
		const libraryMetadataItem = firstOrSingle(libraryMetadataPage.MediaContainer.Metadata);
		if(libraryMetadataItem) {
			// item already exists on the plex server, so just redirect to the plex server metadata
			let itemKey = libraryMetadataItem.key;
			// add or remove /children suffix if needed
			if(itemKey.endsWith(reqsTransform.ChildrenRelativePath)) {
				if(!options.children) {
					itemKey = itemKey.substring(0, (itemKey.length - reqsTransform.ChildrenRelativePath.length));
				}
			} else {
				if(options.children) {
					itemKey += reqsTransform.ChildrenRelativePath;
				}
			}
			// fetch actual item from the plex server
			const plexDisplayedPage: PseuplexMetadataPage = await plexServerAPI.fetch({
				serverURL: context.plexServerURL,
				authContext: context.plexAuthContext,
				method: 'GET',
				endpoint: itemKey,
				params: options.plexParams,
				logger: this.logger,
			});
			plexDisplayedPage.MediaContainer.allowSync = false;
			if(options.children) {
				(plexDisplayedPage as plexTypes.PlexMetadataChildrenPage).MediaContainer.key = fullIdString;
			}
			// process into pseuplex metadata page
			forArrayOrSingle(plexDisplayedPage.MediaContainer.Metadata, (metadataItem: PseuplexMetadataItem) => {
				metadataItem.Pseuplex = {
					isOnServer: true,
					unavailable: false,
					metadataIds: {
						[this.sourceSlug]: reqsTransform.createRequestPartialMetadataId(id)
					},
				}
			});
			try {
				// transform response
				if(options.children) {
					// transform to display requestable seasons if missing any
					if(!libraryMetadataItem.guid) {
						// this should cause an error, since we literally just fetched this item via its guid
						throw httpError(500, `No guid on metadata item that was fetched using guid ${guid}`);
					}
					await this.addRequestableSeasons(plexDisplayedPage, {
						...childrenTransformOpts!,
						metadataBasePath,
						qualifiedMetadataIds,
						requestsProvider: reqProvider,
						plexId: id.plexId,
						plexType: id.mediaType,
						plexParams: options.plexParams as (plexTypes.PlexMetadataChildrenPageParams | undefined),
						transformMatchKeys: options.transformMatchKeys,
					}, context);
				} else {
					// transform metadata item key since not getting children
					if(options.transformMatchKeys) {
						forArrayOrSingle(plexDisplayedPage.MediaContainer.Metadata, (metadataItem: PseuplexMetadataItem) => {
							reqsTransform.setMetadataItemKeyToRequestKey(metadataItem, {
								metadataBasePath,
								qualifiedMetadataIds,
								requestProviderSlug: reqProvider.slug,
								// since the item is on the server, we want to leave the original ratingKey,
								//  so that the plex server items will be fetched directly if any additional request is made
								transformRatingKey: false,
							});
						});
					}
				}
			} catch(error) {
				console.error(`Error transforming plex metadata from server for request:`);
				console.error(error);
			}
			return plexDisplayedPage as PseuplexMetadataPage;
		}
		else if(!(options.includeUnmatched ?? true)) {
			// matching item not found on plex server
			if(options.throw404OnNoMatches) {
				throw httpError(404, "Failed to find matching plex server item");
			}
			return {
				MediaContainer: {
					size: 0,
					identifier: plexTypes.PlexPluginIdentifier.PlexAppLibrary,
					allowSync: false,
					Metadata: [],
				}
			};
		}
		// item doesn't exist in the plex server library,
		//  so get the plex discover ID of the item to fetch
		let plexId: string;
		let itemType: plexTypes.PlexMediaItemType | string;
		if(id.season != null && id.mediaType == plexTypes.PlexMediaItemType.TVShow) {
			// get guid for season
			const showChildrenPage = await this.plexMetadataClient.getMetadataChildren(id.plexId);
			this.plexIdToInfoCache?.cacheMetadataItems(showChildrenPage.MediaContainer.Metadata);
			const seasonItem = findInArrayOrSingle(showChildrenPage.MediaContainer.Metadata, (item) => {
				return item.index == id.season
			});
			if(!seasonItem) {
				throw httpError(404, `Invalid season ${id.season}`);
			} else if(!seasonItem.guid) {
				throw httpError(500, "Season item has no guid");
			}
			const seasonGuidParts = parsePlexMetadataGuidOrThrow(seasonItem.guid);
			if(seasonGuidParts.protocol != plexTypes.PlexMetadataGuidProtocol.Plex) {
				throw httpError(500, "Invalid plex guid for season");
			} else if(seasonGuidParts.type != plexTypes.PlexMediaItemType.Season) {
				throw httpError(500, `Unexpected plex guid type ${seasonGuidParts.type} for season`);
			}
			plexId = seasonGuidParts.id;
			itemType = seasonGuidParts.type;
		} else {
			plexId = id.plexId;
			itemType = id.mediaType;
		}
		// fetch displayed item or item's children from plex discover
		const resDataPromise = options.children ?
			this.plexMetadataClient.getMetadataChildren(plexId, options.plexParams as plexTypes.PlexMetadataChildrenPageParams)
			: this.plexMetadataClient.getMetadata(plexId, options.plexParams as plexTypes.PlexMetadataPageParams);
		// fetch requested item from plex discover
		const requestingPlexItemPage = (options.children || plexId != id.plexId) ?
			await this.plexMetadataClient.getMetadata(id.plexId)
			: await resDataPromise;
		const resData = await resDataPromise;
		// cache if needed
		this.plexIdToInfoCache?.cacheMetadataItems(requestingPlexItemPage.MediaContainer.Metadata);
		if(resData !== requestingPlexItemPage) {
			this.plexIdToInfoCache?.cacheMetadataItems(resData.MediaContainer.Metadata);
		}
		const requestingPlexItem = firstOrSingle(requestingPlexItemPage.MediaContainer.Metadata);
		// send request if needed
		let reqInfo: RequestInfo | undefined = undefined;
		if(itemType != plexTypes.PlexMediaItemType.TVShow && !options.children) {
			// send media request
			if(requestingPlexItem) {
				reqInfo = await reqProvider.requestPlexItem(requestingPlexItem, {
					season: id.season,
					context,
				});
			}
		}
		// transform response data
		resData.MediaContainer.allowSync = false;
		delete resData.MediaContainer.librarySectionID;
		delete resData.MediaContainer.librarySectionTitle;
		delete resData.MediaContainer.librarySectionUUID;
		resData.MediaContainer.identifier = plexTypes.PlexPluginIdentifier.PlexAppLibrary;
		resData.MediaContainer.Metadata = transformArrayOrSingle(resData.MediaContainer.Metadata, (metadataItem) => {
			return extPlexTransform.transformExternalPlexMetadata(metadataItem, this.plexMetadataClient.serverURL, context, {
				metadataBasePath: `/library/metadata`,
				qualifiedMetadataIds: true,
				includeMetadataUnavailability: this.plugin.app.sendsMetadataUnavailability,
			});
		});
		// update response content
		if(options.children) {
			const childrenContainer = (resData as plexTypes.PlexMetadataChildrenPage).MediaContainer;
			childrenContainer.key = fullIdString;
			if(itemType == plexTypes.PlexMediaItemType.Season) {
				// don't show individual episodes for a requested season
				childrenContainer.Metadata = [];
				childrenContainer.size = 0;
				childrenContainer.totalSize = 0;
			} else if(itemType == plexTypes.PlexMediaItemType.TVShow) {
				// make seasons requestable
				let requests: RequestInfo[] | undefined;
				try {
					requests = requestingPlexItem ? (await reqProvider.getRequestsForPlexItem(requestingPlexItem, context)) : [];
				} catch(error) {
					console.error(`Error fetching requests for ${reqsTransform.createRequestFullMetadataId(id)} :`);
					console.error(error);
				}
				forArrayOrSingle(childrenContainer.Metadata, (metadataItem) => {
					reqsTransform.transformRequestableChildMetadata(metadataItem, {
						...childrenTransformOpts!,
						metadataBasePath,
						qualifiedMetadataIds,
						requestProviderSlug: reqProvider.slug,
						transformRatingKey: true,
						overlayedImageEndpoint: this.plugin.app.overlayedImageEndpoint,
						requested: requests?.find((r) => (r.seasons?.find((s) => s == metadataItem.index) != null)) != null,
					});
				});
			}
		} else {
			// update metadata item for page
			forArrayOrSingle(resData.MediaContainer.Metadata, (metadataItem) => {
				if(reqInfo) {
					let requestState = `Request: ${requestStatusDisplayText(reqInfo.requestStatus)}`;
					if(reqInfo.requestStatus == RequestStatus.Approved) {
						requestState += `, ${requestedMediaStatusDisplayText(reqInfo.mediaStatus)}`;
					}
					requestState += '\n';
					metadataItem.title = `Requesting... • ${metadataItem.title}`
					metadataItem.summary = `${requestState}${metadataItem.summary ?? ''}`;
				}
				else if(itemType == plexTypes.PlexMediaItemType.TVShow) {
					metadataItem.title = `Request • ${metadataItem.title}`;
				}
				reqsTransform.setMetadataItemKeyToRequestKey(metadataItem, {
					metadataBasePath,
					qualifiedMetadataIds,
					requestProviderSlug: reqProvider.slug,
					children: (itemType == plexTypes.PlexMediaItemType.TVShow),
					transformRatingKey: true,
				});
			});
		}
		return resData as PseuplexMetadataPage;
	}


	
	async get(ids: string[], options: PseuplexMetadataProviderParams): Promise<PseuplexMetadataPage> {
		const metadataPages = await Promise.all(ids.map(async (id) => {
			const idParts = reqsTransform.parsePartialRequestMetadataId(id);
			const metadataPage = await this.handlePlexRequest(idParts, {
				children: false,
				context: options.context,
				plexParams: options.plexParams,
				includeUnmatched: options.includeUnmatched,
				transformMatchKeys: options.transformMatchKeys,
				metadataBasePath: options.metadataBasePath,
				qualifiedMetadataIds: options.qualifiedMetadataIds,
			});
			return metadataPage;
		}));
		if(metadataPages.length == 1) {
			return metadataPages[0];
		}
		const metadatas = metadataPages.flatMap((page) => {
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
		return {
			MediaContainer: {
				size: metadatas.length,
				identifier: plexTypes.PlexPluginIdentifier.PlexAppLibrary,
				allowSync: false,
				Metadata: metadatas,
			}
		};
	}
	
	async getChildren(id: string, options: PseuplexMetadataChildrenProviderParams): Promise<PseuplexMetadataPage> {
		const idParts = reqsTransform.parsePartialRequestMetadataId(id);
		return await this.handlePlexRequest(idParts, {
			children: true,
			plexParams: options.plexParams,
			context: options.context,
			transformMatchKeys: false,
			metadataBasePath: options.metadataBasePath,
			qualifiedMetadataIds: options.qualifiedMetadataIds,
		});
	}

	async getRelatedHubs(id: string, options: PseuplexRelatedHubsParams): Promise<plexTypes.PlexHubsPage> {
		return {
			MediaContainer: {
				offset: 0,
				size: 0,
				totalSize: 0,
				Hub: []
			}
		};
	}

	async addRequestableSeasons(resData: PseuplexMetadataChildrenPage, options: {
		plexId: string,
		plexType: plexTypes.PlexMediaItemType,
		plexParams?: plexTypes.PlexMetadataChildrenPageParams,
		transformMatchKeys?: boolean,
		parentKey: string,
		parentRatingKey: string,
		requestsProvider: RequestsProvider,
		metadataBasePath: string,
		qualifiedMetadataIds: boolean,
	}, context: PseuplexRequestContext) {
		// fetch other children (seasons) from plex metadata provider
		const discoverMetadataPageTask = this.plexMetadataClient.getMetadataChildren(options.plexId, options.plexParams as plexTypes.PlexMetadataChildrenPageParams);
		// fetch requests
		let requests: RequestInfo[] | undefined;
		try {
			const plexGuid = `plex://${options.plexType}/${options.plexId}`;
			requests = await options.requestsProvider.getRequestsForPlexGuid(plexGuid, context);
		} catch(error) {
			console.error(`Error fetching requests for plex ${options.plexType} with id ${options.plexId} :`);
			console.error(error);
		}
		// wait for plex metadata
		const discoverMetadataPage = await discoverMetadataPageTask;
		this.plexIdToInfoCache?.cacheMetadataItems(discoverMetadataPage.MediaContainer.Metadata);
		// transform requestable children
		resData.MediaContainer.Metadata = transformArrayOrSingle(discoverMetadataPage.MediaContainer.Metadata, (metadataItem: PseuplexMetadataItem): PseuplexMetadataItem => {
			// find matching child from plex server
			const matchingItem = metadataItem.index != null ?
				findInArrayOrSingle(resData.MediaContainer.Metadata, (cmpMetadataItem) => {
					return (cmpMetadataItem.index == metadataItem.index);
				})
				: undefined;
			if(matchingItem) {
				// child exists on the server, so return that item
				if(options.transformMatchKeys) {
					reqsTransform.setMetadataItemKeyToRequestKey(matchingItem, {
						metadataBasePath: options.metadataBasePath,
						qualifiedMetadataIds: options.qualifiedMetadataIds,
						requestProviderSlug: options.requestsProvider.slug,
						// don't show children of children
						children: false,
						// since the item is on the server, we want to leave the original ratingKey,
						//  so that the plex server items will be fetched directly if any additional request is made
						transformRatingKey: false,
					});
				}
				return matchingItem;
			} else {
				// child doesn't exist on the server
				metadataItem.Pseuplex = {
					isOnServer: false,
					unavailable: true,
					metadataIds: {},
				};
				reqsTransform.transformRequestableChildMetadata(metadataItem, {
					metadataBasePath: options.metadataBasePath,
					qualifiedMetadataIds: options.qualifiedMetadataIds,
					requestProviderSlug: options.requestsProvider.slug,
					// don't show children of children
					children: false,
					// item isn't on the server, so use the "request" ratingKey
					transformRatingKey: true,
					overlayedImageEndpoint: this.plugin.app.overlayedImageEndpoint,
					requested: requests?.find((r) => (r.seasons?.find((s) => s == metadataItem.index) != null)) != null,
				});
				return metadataItem;
			}
		});
		resData.MediaContainer.size = discoverMetadataPage.MediaContainer.size;
		resData.MediaContainer.totalSize = discoverMetadataPage.MediaContainer.totalSize;
		resData.MediaContainer.offset = discoverMetadataPage.MediaContainer.offset;
	}


	metadataIdsFromKey(metadataKey: string): PseuplexPartialMetadataIDsFromKey | null {
		const keyParts = reqsTransform.parseUnqualifiedRequestItemMetadataKey(metadataKey, this.basePath, false);
		if(!keyParts) {
			return null;
		}
		return {
			ids: [reqsTransform.createRequestPartialMetadataId(keyParts.id)],
			relativePath: keyParts.relativePath,
		};
	}
}
