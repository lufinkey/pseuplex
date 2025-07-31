
import { CachedFetcher } from '../fetching/CachedFetcher';
import { RequestExecutor } from '../fetching/RequestExecutor';
import * as plexTypes from '../plex/types';
import * as plexServerAPI from '../plex/api';
import { removeFileParamsFromMetadataParams } from '../plex/api/serialization';
import {
	parseMetadataIDFromKey,
	parsePlexMetadataGuid
} from '../plex/metadataidentifier';
import {
	PlexClient
} from '../plex/client';
import { PlexGuidToInfoCache } from '../plex/metadata';
import { PlexServerAccountInfo } from '../plex/accounts';
import * as extPlexTransform from './externalplex/transform';
import {
	PseuplexMetadataItem,
	PseuplexMetadataPage,
	PseuplexRequestContext
} from './types';
import {
	findMatchingPlexMediaItem,
	PlexMediaItemMatchParams
} from './matching';
import {
	parsePartialMetadataID,
	PseuplexPartialMetadataIDString,
	stringifyMetadataID
} from './metadataidentifier';
import {
	PseuplexHubProvider
} from './hub';
import type { PseuplexSection } from './section';
import {
	HttpResponseError,
} from '../utils/error';
import {
	firstOrSingle,
	forArrayOrSingle,
	transformArrayOrSingleAsyncParallel,
} from '../utils/misc';


export type PseuplexMetadataParams = {
	context: PseuplexRequestContext;
	// Indicates whether to return metadata from plex discover if a match to a plex guid could be made.
	// If metadata from the plex server could be fetched, that will always be used instead
	includePlexDiscoverMatches?: boolean;
	// Indicates whether to return items that couldn't be matched to items on the plex server
	//  (or on plex discover, if includePlexDiscoverMatches was set)
	includeUnmatched?: boolean;
	// Indicates whether to transform the keys of items matched to plex server items
	transformMatchKeys?: boolean;
	// The base path to use when transforming metadata keys
	metadataBasePath?: string;
	// Whether to use full metadata IDs in the transformed metadata keys
	qualifiedMetadataIds?: boolean;
	// Parameters to use when sending plex metadata requests
	plexParams?: plexTypes.PlexMetadataPageParams;
};

export type PseuplexMetadataChildrenParams = {
	context: PseuplexRequestContext;
	// Indicates whether to return metadata from plex discover if a match to a plex guid could be made.
	// If metadata from the plex server could be fetched, that will always be used instead
	includePlexDiscoverMatches?: boolean;
	// Parameters to use when sending plex metadata requests
	plexParams?: plexTypes.PlexMetadataChildrenPageParams;
	// The base path to use when transforming metadata keys
	metadataBasePath?: string;
	// Whether to use full metadata IDs in the transformed metadata keys
	qualifiedMetadataIds?: boolean;
};

export enum PseuplexRelatedHubsSource {
	Library = 'library',
	Hubs = 'hubs',
};

export type PseuplexRelatedHubsParams = {
	plexParams?: plexTypes.PlexHubListPageParams;
	context: PseuplexRequestContext;
	from: PseuplexRelatedHubsSource;
};

export type PseuplexMetadataProviderParams = PseuplexMetadataParams;
export type PseuplexMetadataChildrenProviderParams = PseuplexMetadataChildrenParams;

export type PseuplexPartialMetadataIDsFromKey = {
	ids: string[];
	relativePath?: string;
};

export interface PseuplexMetadataProvider {
	readonly sourceSlug: string;

	get(ids: string[], options: PseuplexMetadataProviderParams): Promise<PseuplexMetadataPage>;
	getChildren(id: string, options: PseuplexMetadataChildrenProviderParams): Promise<PseuplexMetadataPage>;
	getRelatedHubs(id: string, options: PseuplexRelatedHubsParams): Promise<plexTypes.PlexHubsPage>;

	metadataIdsFromKey(metadataKey: string): PseuplexPartialMetadataIDsFromKey | null;
}

export type PseuplexSimilarItemsHubProvider = PseuplexHubProvider & {
	relativePath: string
};

export type PseuplexMetadataProviderOptions = {
	basePath: string;
	section?: PseuplexSection;
	plexMetadataClient: PlexClient;
	relatedHubsProviders?: PseuplexSimilarItemsHubProvider[];
	plexGuidToInfoCache?: PlexGuidToInfoCache;
	loggingOptions?: PseuplexMetadataProviderLoggingOptions;
	requestExecutor?: RequestExecutor;
};

export type PseuplexMetadataProviderLoggingOptions = {
	logOutgoingRequests?: boolean;
};

export type PseuplexMetadataTransformOptions = {
	metadataBasePath: string;
	qualifiedMetadataId: boolean;
};

export type PseuplexMetadataListPage<TMetadataItem> = {
	offset: number;
	totalItemCount: number;
	items: TMetadataItem[];
};

export abstract class PseuplexMetadataProviderBase<TMetadataItem> implements PseuplexMetadataProvider {
	abstract readonly sourceDisplayName: string;
	abstract readonly sourceSlug: string;

	readonly basePath: string;
	readonly section?: PseuplexSection;
	readonly plexMetadataClient: PlexClient;
	readonly loggingOptions: PseuplexMetadataProviderLoggingOptions;
	readonly requestExecutor?: RequestExecutor;
	readonly relatedHubsProviders?: PseuplexSimilarItemsHubProvider[];

	readonly idToPlexGuidCache: CachedFetcher<string | null>;
	readonly plexGuidToIDCache: CachedFetcher<string | null>;
	readonly plexGuidToInfoCache?: PlexGuidToInfoCache;

	constructor(options: PseuplexMetadataProviderOptions) {
		this.basePath = options.basePath;
		this.section = options.section;
		this.plexMetadataClient = options.plexMetadataClient;
		this.loggingOptions = options.loggingOptions || {};
		this.requestExecutor = options.requestExecutor;
		this.relatedHubsProviders = options.relatedHubsProviders;
		this.idToPlexGuidCache = new CachedFetcher(async (id: string) => {
			throw new Error("Cannot fetch guid from cache");
		});
		this.plexGuidToIDCache = new CachedFetcher(async (id: string) => {
			throw new Error("Cannot fetch id from cache");
		});
		this.plexGuidToInfoCache = options.plexGuidToInfoCache;
	}
	
	abstract fetchMetadataItem(id: PseuplexPartialMetadataIDString, options: {
		plexParams?: plexTypes.PlexMetadataPageParams,
		context: PseuplexRequestContext,
	}): Promise<TMetadataItem>;
	fetchMetadataItemChildren?: (id: PseuplexPartialMetadataIDString, options: {
		plexParams?: plexTypes.PlexMetadataChildrenPageParams,
		context: PseuplexRequestContext,
	}) => Promise<PseuplexMetadataListPage<TMetadataItem>>;
	abstract transformMetadataItem(metadataItem: TMetadataItem, context: PseuplexRequestContext, options: PseuplexMetadataTransformOptions): PseuplexMetadataItem;
	abstract idFromMetadataItem(metadataItem: TMetadataItem): PseuplexPartialMetadataIDString;
	
	abstract getPlexMatchParams(metadataItem: TMetadataItem): (PlexMediaItemMatchParams | null);
	async getPlexGUIDForID(id: PseuplexPartialMetadataIDString, context: PseuplexRequestContext): Promise<string | null> {
		let plexGuid = this.idToPlexGuidCache.get(id);
		if(plexGuid || plexGuid === null) {
			return await plexGuid;
		}
		// get provider metadata item
		return await this.idToPlexGuidCache.set(id, (async () => {
			const item = await this.fetchMetadataItem(id, {
				context,
			});
			const matchParams = this.getPlexMatchParams(item);
			if(!matchParams) {
				return null;
			}
			if(!matchParams.includeFields) {
				matchParams.includeFields = [];
			}
			matchParams.includeFields.push('guid',...PlexGuidToInfoCache.fields);
			if(!matchParams.includeElements) {
				matchParams.includeElements = [];
			}
			matchParams.includeElements.push(...PlexGuidToInfoCache.elements);
			const matchingMetadata = await findMatchingPlexMediaItem(this.plexMetadataClient, matchParams);
			const plexGuid = matchingMetadata?.guid;
			if(!plexGuid) {
				return null;
			}
			this.plexGuidToIDCache.setSync(plexGuid, id);
			if(this.plexGuidToInfoCache) {
				this.plexGuidToInfoCache.cacheMetadataItem(matchingMetadata);
			}
			return plexGuid;
		})());
	}
	async attachPlexDataIfAble(metadataId: PseuplexPartialMetadataIDString, metadataItem: plexTypes.PlexMetadataItem, context: PseuplexRequestContext): Promise<plexTypes.PlexMetadataItem> {
		try {
			// get plex guid
			const plexGuid = (context.plexAuthContext?.['X-Plex-Token']) ?
				await this.getPlexGUIDForID(metadataId, context)
				: await this.idToPlexGuidCache.get(metadataId);
			// attach plex guid if able
			if(plexGuid) {
				metadataItem.guid = plexGuid;
				const guidParts = parsePlexMetadataGuid(plexGuid);
				if(guidParts.type) {
					metadataItem.type = guidParts.type as plexTypes.PlexMediaItemType;
				}
				// attach additional metadata if able
				const plexInfo = await this.plexGuidToInfoCache?.getOrFetch(plexGuid);
				if(plexInfo) {
					metadataItem.slug = plexInfo.slug;
					metadataItem.parentSlug = plexInfo.parentSlug;
					metadataItem.grandparentSlug = plexInfo.grandparentSlug;
					if(plexInfo.Guid && plexInfo.Guid.length > 0) {
						metadataItem.Guid = plexInfo.Guid;
					}
				}
			}
		} catch(error) {
			console.error(`Failed to attach plex data to metadata ${metadataId} :`);
			console.error(error);
		}
		return metadataItem;
	}

	abstract findMatchForPlexItem(metadataItem: plexTypes.PlexMetadataItem): Promise<TMetadataItem | null>;
	async getIDForPlexItem(metadataItem: plexTypes.PlexMetadataItem): Promise<PseuplexPartialMetadataIDString | null> {
		// try to get ID from cache
		const plexGuid = metadataItem.guid;
		if(plexGuid) {
			const id = await this.plexGuidToIDCache.get(plexGuid);
			if(id) {
				return id;
			} else if(id === null) {
				return null;
			}
		}
		// find match
		const result = await this.findMatchForPlexItem(metadataItem);
		if(!result) {
			return null;
		}
		return this.idFromMetadataItem(result);
	}
	async getIDForPlexGUID(plexGuid: string, options: {
		metadataItem?: plexTypes.PlexMetadataItem;
		plexAuthContext: plexTypes.PlexAuthContext
	}): Promise<PseuplexPartialMetadataIDString | null> {
		// try to get id from cache
		const id = await this.plexGuidToIDCache.get(plexGuid);
		if(id) {
			return id;
		} else if(id === null) {
			return null;
		}
		// get metadata item
		let metadataItem = options.metadataItem;
		if(!metadataItem) {
			const guidParts = parsePlexMetadataGuid(plexGuid);
			const metadataTask = this.plexMetadataClient.getMetadata(guidParts.id).then((result) => {
				const metadatas = result?.MediaContainer?.Metadata;
				return (metadatas instanceof Array) ? metadatas[0] : metadatas;
			});
			this.plexGuidToInfoCache?.cacheMetadataItemForGuid(plexGuid, metadataTask);
			metadataItem = await metadataTask;
		}
		if(!metadataItem) {
			throw new Error("Metadata not found");
		}
		// find match
		const result = await this.findMatchForPlexItem(metadataItem);
		if(!result) {
			return null;
		}
		return this.idFromMetadataItem(result);
	}

	async get(ids: PseuplexPartialMetadataIDString[], options: PseuplexMetadataProviderParams): Promise<PseuplexMetadataPage> {
		const { context, plexParams } = options;
		const plexGuids: {[id: PseuplexPartialMetadataIDString]: Promise<string | null> | string | null} = {};
		const plexMatches: {[id: PseuplexPartialMetadataIDString]: (Promise<plexTypes.PlexMetadataItem | null> | plexTypes.PlexMetadataItem | null)} = {};
		const providerItems: {[id: PseuplexPartialMetadataIDString]: TMetadataItem | Promise<TMetadataItem>} = {};
		const transformOpts: PseuplexMetadataTransformOptions = {
			qualifiedMetadataId: options.qualifiedMetadataIds ?? false,
			metadataBasePath: options.metadataBasePath ?? this.basePath,
		};
		const externalPlexTransformOpts: PseuplexMetadataTransformOptions = {
			qualifiedMetadataId: true,
			metadataBasePath: '/library/metadata'
		};
		const plextvMetadataParams = removeFileParamsFromMetadataParams(plexParams ?? {});
		// process each id
		for(const id of ids) {
			if(id in plexGuids) {
				// already got the mapping for this ID (ie there was a repeat ID in this query)
				continue;
			}
			// check if matching GUID exists for provider metadata id
			let plexGuid = this.idToPlexGuidCache.get(id);
			if(plexGuid || plexGuid === null) {
				plexGuids[id] = plexGuid;
			}
			if(plexGuid) {
				// already have the mapping between ID and plex guid, so no need to fetch from provider (can get metadata from server or plex discover)
				continue;
			}
			// get raw metadata item from provider
			const itemTask = providerItems[id] ?? this.fetchMetadataItem(id, {
				plexParams,
				context,
			});
			providerItems[id] = itemTask;
			if(plexGuid !== null) {
				// find matching plex metadata for metadata item
				const metadataTask = (async () => {
					const item = await itemTask;
					const matchParams = this.getPlexMatchParams(item);
					if(!matchParams) {
						return null;
					}
					const metadataItem = await findMatchingPlexMediaItem(this.plexMetadataClient, matchParams);
					if(!metadataItem?.ratingKey) {
						return metadataItem;
					}
					// TODO check if we even need to fetch this again?
					const detailedMetadataItem = firstOrSingle((await this.plexMetadataClient.getMetadata(metadataItem.ratingKey, plextvMetadataParams)).MediaContainer?.Metadata) ?? metadataItem;
					// cache metadata info
					if(this.plexGuidToInfoCache && detailedMetadataItem) {
						this.plexGuidToInfoCache.cacheMetadataItem(detailedMetadataItem);
					}
					return detailedMetadataItem;
				})();
				const guidTask = metadataTask.then((m) => (m?.guid ?? null));
				plexMatches[id] = metadataTask;
				plexGuids[id] = this.idToPlexGuidCache.set(id, guidTask.then((guid) => {
					if(guid) {
						this.plexGuidToIDCache.setSync(id, guid);
					}
					return guid;
				}));
			}
		}
		// wait for all GUIDs to be fetched
		const guidsToFetch: string[] = (await Promise.all(Object.values(plexGuids))).filter((guid) => guid) as string[];
		// map guids to items on the plex server
		const plexMetadataMap: {[guid: string]: PseuplexMetadataItem} = {};
		let serverResult: plexTypes.PlexMetadataPage | undefined = undefined;
		if(guidsToFetch.length > 0) {
			try {
				// get metadata items from plex server
				serverResult = await plexServerAPI.getLibraryMetadata(guidsToFetch, {
					serverURL: context?.plexServerURL,
					authContext: context?.plexAuthContext,
					params: plexParams,
					verbose: this.loggingOptions.logOutgoingRequests
				});
			} catch(error) {
				if((error as HttpResponseError).httpResponse?.status != 404) {
					console.warn(error);
				}
			}
			let metadatas = serverResult?.MediaContainer.Metadata;
			if(metadatas) {
				if(!(metadatas instanceof Array)) {
					metadatas = [metadatas];
				}
				for(const metadata of metadatas) {
					if(metadata.guid) {
						const pseuMetadata = metadata as PseuplexMetadataItem;
						pseuMetadata.Pseuplex = {
							isOnServer: true,
							unavailable: false,
							metadataIds: {},
							plexMetadataIds: {}
						};
						plexMetadataMap[metadata.guid] = pseuMetadata;
					}
				}
			}
		}
		// map items to plex discover metadata if allowed
		if(options.includePlexDiscoverMatches ?? true) {
			// fill any missing items in plexMetadataMap with values from plexMatches
			for(const id of ids) {
				const guid = await plexGuids[id];
				if(guid) {
					if(!plexMetadataMap[guid]) {
						// no mapping has been made for this guid, so pull from the discover match query if any
						//  (otherwise, we will try to make a plex discover query later in this function)
						const matchMetadata = await plexMatches[id];
						if(matchMetadata?.guid && !plexMetadataMap[matchMetadata.guid]) {
							plexMetadataMap[matchMetadata.guid] = extPlexTransform.transformExternalPlexMetadata(matchMetadata, this.plexMetadataClient.serverURL, context, externalPlexTransformOpts);
						}
					}
				}
			}
			// get any remaining guids from plex discover
			const remainingGuids = guidsToFetch.filter((guid) => !plexMetadataMap[guid]);
			if(remainingGuids.length > 0) {
				const discoverTask = this.plexMetadataClient.getMetadata(remainingGuids.map((guid) => parsePlexMetadataGuid(guid).id), plextvMetadataParams);
				// cache result if needed
				if(this.plexGuidToInfoCache) {
					const guidMapTask = discoverTask.then((result) => {
						const guidMap: {[key: string]: plexTypes.PlexMetadataItem} = {};
						forArrayOrSingle(result.MediaContainer.Metadata, (metadataItem) => {
							if(metadataItem.guid) {
								guidMap[metadataItem.guid] = metadataItem;
							}
						});
						return guidMap;
					});
					for(const guid of remainingGuids) {
						this.plexGuidToInfoCache.cacheMetadataItemForGuid(guid, guidMapTask.then((guidMap) => guidMap[guid]));
					}
				}
				// get discover result and store in metadata map
				const discoverResult = await discoverTask;
				let metadatas = discoverResult?.MediaContainer.Metadata;
				if(metadatas) {
					if(!(metadatas instanceof Array)) {
						metadatas = [metadatas];
					}
					for(const metadata of metadatas) {
						if(metadata.guid) {
							plexMetadataMap[metadata.guid] = extPlexTransform.transformExternalPlexMetadata(metadata, this.plexMetadataClient.serverURL, context, externalPlexTransformOpts);
						}
					}
				}
			}
		}
		// get all results
		const metadatas: PseuplexMetadataItem[] = (await Promise.all(ids.map(async (id) => {
			const guid = await plexGuids[id];
			let metadataItem = guid ? plexMetadataMap[guid] : null;
			if(metadataItem) {
				// attach provider ID to metadata item
				metadataItem.Pseuplex.metadataIds[this.sourceSlug] = id;
				// transform metadata item key if needed
				// if transformMatchKeys is set, we obviously want to transform keys back into their originals
				// if the item isn't on the server, the key or ratingKey will be invalid, so in this case we also want to transform the keys
				if(options.transformMatchKeys || !metadataItem.Pseuplex.isOnServer) {
					// get full metadata id
					const idParts = parsePartialMetadataID(id);
					const fullMetadataId = stringifyMetadataID({
						...idParts,
						source: this.sourceSlug,
						isURL: false
					});
					// transform keys back to the original key used to fetch this item
					let metadataId: string;
					if(transformOpts.qualifiedMetadataId) {
						metadataId = fullMetadataId;
					} else {
						metadataId = id;
					}
					metadataItem.key = `${transformOpts.metadataBasePath}/${metadataId}`;
					//metadataItem.slug = fullMetadataId;
					// if the item is on the server, we want to leave the original ratingKey,
					//  so that the plex server items will be fetched directly if any additional request is made
					if(!metadataItem.Pseuplex.isOnServer) {
						metadataItem.ratingKey = fullMetadataId;
					}
				}
			} else if(options.includeUnmatched ?? true) {
				// get or fetch the metadata item
				let providerMetadataItemTask = providerItems[id];
				if(!providerMetadataItemTask) {
					// fetch the raw metadata item, since we skipped this step earlier in anticipation of a guid match
					providerMetadataItemTask = this.fetchMetadataItem(id, {
						plexParams,
						context,
					});
					providerItems[id] = providerMetadataItemTask;
				}
				const providerMetadataItem = await providerMetadataItemTask;
				metadataItem = this.transformMetadataItem(providerMetadataItem, context, transformOpts);
			} else {
				return null;
			}
			return metadataItem;
		}))).filter((metadata) => metadata) as PseuplexMetadataItem[];
		// done
		return {
			MediaContainer: {
				size: metadatas.length,
				allowSync: false,
				identifier: plexTypes.PlexPluginIdentifier.PlexAppLibrary,
				...(this.section ? {
					librarySectionID: this.section.id,
					librarySectionTitle: this.section.title,
					librarySectionUUID: this.section.uuid
				} : undefined),
				Metadata: metadatas
			}
		};
	}

	async getChildren(id: PseuplexPartialMetadataIDString, options: PseuplexMetadataChildrenProviderParams): Promise<PseuplexMetadataPage> {
		const { context, plexParams } = options;
		if(!this.fetchMetadataItemChildren) {
			// we don't have a way to fetch children in this provider
			if(options.includePlexDiscoverMatches && this.plexMetadataClient) {
				// fetch the children from plex discover
				const extPlexTransformOpts: PseuplexMetadataTransformOptions = {
					metadataBasePath: options.metadataBasePath || '/library/metadata',
					qualifiedMetadataId: options.qualifiedMetadataIds ?? true,
				};
				// get the guid for the given id
				let guid = this.idToPlexGuidCache.get(id);
				if(guid) {
					guid = await guid;
				} else {
					// only show seasons/episodes matched to items on your plex server when fetching children
					const metadataItemsPage = await this.get([id], {
						context,
						includePlexDiscoverMatches: true,
						includeUnmatched: false
					});
					const metadataItem = firstOrSingle(metadataItemsPage.MediaContainer?.Metadata);
					guid = metadataItem?.guid;
				}
				if(guid) {
					// fetch the children from plex discover
					const plexGuidParts = parsePlexMetadataGuid(guid);
					const mappedMetadataPage: PseuplexMetadataPage = await this.plexMetadataClient.getMetadataChildren(plexGuidParts.id, plexParams) as PseuplexMetadataPage;
					mappedMetadataPage.MediaContainer.Metadata = (await transformArrayOrSingleAsyncParallel(mappedMetadataPage.MediaContainer.Metadata, async (metadataItem) => {
						return extPlexTransform.transformExternalPlexMetadata(metadataItem, this.plexMetadataClient.serverURL, context, extPlexTransformOpts);
					}));
					return mappedMetadataPage;
				}
			}
			return {
				MediaContainer: {
					size: 0,
					Metadata: []
				}
			};
		}
		// we have the fetchMetadataItemChildren method, so we can call it
		const transformOpts: PseuplexMetadataTransformOptions = {
			qualifiedMetadataId: false,
			metadataBasePath: this.basePath,
		};
		const childItemsPage = await this.fetchMetadataItemChildren(id, {
			plexParams,
			context,
		});
		return {
			MediaContainer: {
				offset: childItemsPage.offset,
				size: childItemsPage.items?.length ?? 0,
				totalSize: childItemsPage.totalItemCount,
				Metadata: childItemsPage.items.map((metadataItem) => {
					let pseuMetadataItem = this.transformMetadataItem(metadataItem, context, transformOpts);
					return pseuMetadataItem;
				})
			}
		};
	}

	async getRelatedHubs(id: string, options: PseuplexRelatedHubsParams): Promise<plexTypes.PlexHubsPage> {
		let hubEntries: plexTypes.PlexHubWithItems[] = [];
		if(this.relatedHubsProviders && this.relatedHubsProviders.length > 0) {
			const relatedHubs = (await Promise.all(this.relatedHubsProviders.map(async (hubProvider) => {
				try {
					const hub = await hubProvider.get(id);
					const hubListEntry = await hub.getHubListEntry(options.plexParams ?? {}, options.context);
					return [hubListEntry]
				} catch(error) {
					console.error(`Error fetching related hub ${hubProvider.relativePath} for metadata id ${id} :`);
					console.error(error);
					return [];
				}
			}))).flat();
			hubEntries = hubEntries.concat(relatedHubs);
		}
		return {
			MediaContainer: {
				size: hubEntries.length,
				totalSize: hubEntries.length,
				identifier: plexTypes.PlexPluginIdentifier.PlexAppLibrary,
				Hub: hubEntries
			}
		};
	}



	metadataIdsFromKey(metadataKey: string): PseuplexPartialMetadataIDsFromKey | null {
		const metadataKeyParts = parseMetadataIDFromKey(metadataKey, this.basePath, false);
		if(!metadataKeyParts) {
			return null;
		}
		const ids = metadataKeyParts.id.split(',');
		return {
			ids,
			relativePath: metadataKeyParts.relativePath
		};
	}
}
