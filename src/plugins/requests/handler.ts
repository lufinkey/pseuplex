import { PlexClient } from '../../plex/client';
import * as plexTypes from '../../plex/types';
import * as plexServerAPI from '../../plex/api';
import { PlexServerAccountInfo } from '../../plex/accounts';
import {
	parsePlexMetadataGuid,
	parsePlexMetadataGuidOrThrow,
} from '../../plex/metadataidentifier';
import { PlexGuidToInfoCache } from '../../plex/metadata';
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
} from '../../pseuplex';
import * as extPlexTransform from '../../pseuplex/externalplex/transform';
import {
	RequestsProviders,
	RequestsProvider,
} from './provider';
import { requestedMediaStatusDisplayText, RequestInfo, RequestStatus, requestStatusDisplayText } from './types';
import * as reqsTransform from './transform';
import {
	RequestPartialMetadataIDParts,
	TransformRequestMetadataOptions,
} from './transform';
import { httpError } from '../../utils/error';
import {
	findInArrayOrSingle,
	firstOrSingle,
	forArrayOrSingle,
	transformArrayOrSingle,
	WithOptionalPropsRecursive
} from '../../utils/misc';

export type PlexRequestsHandlerOptions = {
	basePath: string;
	requestProviders: RequestsProviders;
	plexMetadataClient: PlexClient;
	plexGuidToInfoCache?: PlexGuidToInfoCache;
	loggingOptions: PlexRequestsHandlerLoggingOptions;
};

export type PlexRequestsHandlerLoggingOptions = {
	logOutgoingRequests?: boolean;
}

export class PlexRequestsHandler implements PseuplexMetadataProvider {
	readonly sourceDisplayName = "Plex Requests";
	readonly sourceSlug = PseuplexMetadataSource.Request;

	readonly basePath: string;
	readonly requestProviders: RequestsProviders;
	readonly plexMetadataClient: PlexClient;
	readonly plexGuidToInfoCache?: PlexGuidToInfoCache;
	readonly loggingOptions: PlexRequestsHandlerLoggingOptions;

	constructor(options: PlexRequestsHandlerOptions) {
		this.basePath = options.basePath;
		this.requestProviders = options.requestProviders;
		this.plexMetadataClient = options.plexMetadataClient;
		this.loggingOptions = options.loggingOptions;
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
			case plexTypes.PlexMediaItemTypeNumeric.Movie:
				requestActionTitle = "Request Movie";
				librarySectionID = options.moviesLibraryId;
				break;
			case plexTypes.PlexMediaItemTypeNumeric.Show:
				requestActionTitle = "Request Show";
				librarySectionID = options.tvShowsLibraryId;
				break;
			case plexTypes.PlexMediaItemTypeNumeric.Season:
				requestActionTitle = "Request Season";
				librarySectionID = options.tvShowsLibraryId;
				break;
			case plexTypes.PlexMediaItemTypeNumeric.Episode:
				if(options.requestProvider.canRequestEpisodes) {
					requestActionTitle = "Request Episode";
				} else {
					requestActionTitle = "Request Season";
				}
				librarySectionID = options.tvShowsLibraryId;
				break;
			default:
				// can't request type
				return null;
		}
		if(librarySectionID == null) {
			// no section specified for the request
			return null;
		}
		// fetch metadata from guid
		let metadataItem: plexTypes.PlexMetadataItem | undefined = undefined;
		const guidParts = parsePlexMetadataGuidOrThrow(options.guid);
		if(guidParts.protocol == plexTypes.PlexMetadataGuidProtocol.Local) {
			// cannot fetch from plex metadata provider with a local guid
			return null;
		}
		else if(guidParts.protocol == plexTypes.PlexMetadataGuidProtocol.Plex) {
			if(options.season != null) {
				const metadataItems = (await options.plexMetadataClient.getMetadataChildren(guidParts.id)).MediaContainer.Metadata;
				this.plexGuidToInfoCache?.cacheMetadataItems(metadataItems);
				metadataItem = findInArrayOrSingle(metadataItems, (item) => (item.index == options.season));
			} else {
				const metadataItems = (await options.plexMetadataClient.getMetadata(guidParts.id)).MediaContainer.Metadata;
				this.plexGuidToInfoCache?.cacheMetadataItems(metadataItems);
				metadataItem = firstOrSingle(metadataItems);
			}
		}
		else {
			console.error(`Cannot fetch metadata for unrecognized guid ${options.guid}`);
			return null;
		}
		if(!metadataItem) {
			console.error(`No matching metadata found for guid ${options.guid}`);
			return null;
		}
		// create hook metadata
		const requestMetadataItem: WithOptionalPropsRecursive<plexTypes.PlexMetadataItem> = {
			guid: options.guid,
			key: reqsTransform.createRequestItemMetadataKey({
				basePath: options.useLibraryMetadataPath ? '/library/metadata' : this.basePath,
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
			type: plexTypes.PlexMediaItemNumericToType[options.mediaType],
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
			throw httpError(401, `User is not allowed to make ${reqProvider.slug} requests`);
		}
		// get numeric media type
		let numericMediaType = plexTypes.PlexMediaItemTypeToNumeric[id.mediaType];
		if(numericMediaType == null) {
			throw httpError(400, `Unknown media type ${id.mediaType}`);
		}
		// create options for transforming metadata
		const fullIdString = reqsTransform.createRequestFullMetadataId(id);
		const transformOpts: TransformRequestMetadataOptions = {
			basePath: options.metadataBasePath || this.basePath,
			requestProviderSlug: reqProvider.slug,
			qualifiedMetadataIds: options.qualifiedMetadataIds ?? false,
		};
		if(options.children) {
			transformOpts.parentRatingKey = fullIdString;
			if(transformOpts.qualifiedMetadataIds) {
				transformOpts.parentKey = `${transformOpts.basePath}/${fullIdString}`;
			} else {
				const partialIdString = reqsTransform.createRequestPartialMetadataId(id);
				transformOpts.parentKey = `${transformOpts.basePath}/${partialIdString}`;
			}
		}
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
			verbose: this.loggingOptions.logOutgoingRequests,
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
			const plexDisplayedPage: plexTypes.PlexMetadataPage = await plexServerAPI.fetch({
				serverURL: context.plexServerURL,
				authContext: context.plexAuthContext,
				method: 'GET',
				endpoint: itemKey,
				params: options.plexParams,
				verbose: this.loggingOptions.logOutgoingRequests,
			});
			plexDisplayedPage.MediaContainer.allowSync = false;
			if(options.children) {
				(plexDisplayedPage as plexTypes.PlexMetadataChildrenPage).MediaContainer.key = fullIdString;
			}
			try {
				// transform response
				if(options.children) {
					// transform to display requestable seasons if missing any
					if(!libraryMetadataItem.guid) {
						// this should cause an error, since we literally just fetched this item via its guid
						throw httpError(500, `No guid on metadata item that was fetched using guid ${guid}`);
					}
					const plexGuidParts = parsePlexMetadataGuid(libraryMetadataItem.guid);
					if(plexGuidParts) {
						if(plexGuidParts.protocol == plexTypes.PlexMetadataGuidProtocol.Plex) {
							// fetch other children (seasons) from plex metadata provider
							const discoverMetadataPage = await this.plexMetadataClient.getMetadataChildren(plexGuidParts.id, options.plexParams as plexTypes.PlexMetadataChildrenPageParams);
							this.plexGuidToInfoCache?.cacheMetadataItems(discoverMetadataPage.MediaContainer.Metadata);
							console.log(`got ${discoverMetadataPage.MediaContainer.size}`);
							// transform requestable children
							plexDisplayedPage.MediaContainer.Metadata = transformArrayOrSingle(discoverMetadataPage.MediaContainer.Metadata, (metadataItem: PseuplexMetadataItem) => {
								// find matching child from plex server
								const matchingItem = metadataItem.guid ?
									findInArrayOrSingle(plexDisplayedPage.MediaContainer.Metadata, (cmpMetadataItem) => {
										return (cmpMetadataItem.guid == metadataItem.guid);
									})
									: undefined;
								if(matchingItem) {
									// child exists on the server, so return that item
									const pseuMatchingItem = matchingItem as PseuplexMetadataItem;
									pseuMatchingItem.Pseuplex = {
										isOnServer: true,
										unavailable: false,
										metadataIds: {},
									};
									if(options.transformMatchKeys) {
										reqsTransform.setMetadataItemKeyToRequestKey(pseuMatchingItem, {
											...transformOpts,
											// don't show children of children
											children: false,
											// since the item is on the server, we want to leave the original ratingKey,
											//  so that the plex server items will be fetched directly if any additional request is made
											transformRatingKey: false,
										});
									}
									return pseuMatchingItem;
								} else {
									// child doesn't exist on the server
									metadataItem.Pseuplex = {
										isOnServer: false,
										unavailable: true,
										metadataIds: {},
									};
									reqsTransform.transformRequestableChildMetadata(metadataItem, transformOpts);
									return metadataItem;
								}
							});
							plexDisplayedPage.MediaContainer.size = discoverMetadataPage.MediaContainer.size;
							plexDisplayedPage.MediaContainer.totalSize = discoverMetadataPage.MediaContainer.totalSize;
							plexDisplayedPage.MediaContainer.offset = discoverMetadataPage.MediaContainer.offset;
						} else {
							console.error(`Unexpected non-plex guid ${libraryMetadataItem.guid} when fetching metadata for guid ${guid}`);
						}
					}
				} else {
					// transform metadata item key since not getting children
					forArrayOrSingle(plexDisplayedPage.MediaContainer.Metadata, (metadataItem: PseuplexMetadataItem) => {
						metadataItem.Pseuplex = {
							isOnServer: true,
							unavailable: false,
							metadataIds: {
								[this.sourceSlug]: reqsTransform.createRequestPartialMetadataId(id)
							},
						}
						if(options.transformMatchKeys) {
							reqsTransform.setMetadataItemKeyToRequestKey(metadataItem, {
								...transformOpts,
								// since the item is on the server, we want to leave the original ratingKey,
								//  so that the plex server items will be fetched directly if any additional request is made
								transformRatingKey: false,
							});
						}
					});
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
			this.plexGuidToInfoCache?.cacheMetadataItems(showChildrenPage.MediaContainer.Metadata);
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
		const requestedPlexItemPage = (options.children || plexId != id.plexId) ?
			await this.plexMetadataClient.getMetadata(id.plexId)
			: await resDataPromise;
		const resData = await resDataPromise;
		// cache if needed
		this.plexGuidToInfoCache?.cacheMetadataItems(requestedPlexItemPage.MediaContainer.Metadata);
		if(resData !== requestedPlexItemPage) {
			this.plexGuidToInfoCache?.cacheMetadataItems(resData.MediaContainer.Metadata);
		}
		// send request if needed
		let reqInfo: RequestInfo | undefined = undefined;
		if(itemType != plexTypes.PlexMediaItemType.TVShow && !options.children) {
			// send media request
			const requestedPlexItem = firstOrSingle(requestedPlexItemPage.MediaContainer.Metadata);
			if(requestedPlexItem) {
				reqInfo = await reqProvider.requestPlexItem(requestedPlexItem, {
					seasons: id.season != null ? [id.season] : undefined,
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
				qualifiedMetadataId: true,
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
				forArrayOrSingle(childrenContainer.Metadata, (metadataItem) => {
					reqsTransform.transformRequestableChildMetadata(metadataItem, transformOpts);
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
					...transformOpts,
					children: (itemType == plexTypes.PlexMediaItemType.TVShow)
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
