
import { CachedFetcher } from '../fetching/CachedFetcher';
import * as plexTypes from '../plex/types';
import * as plexServerAPI from '../plex/api';
import * as plexDiscoverAPI from '../plexdiscover';
import * as extPlexTransform from './externalplex';
import {
	PseuplexMetadataSource,
	PseuplexMetadataItem,
	PseuplexMetadataPage
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
	HttpError
} from '../utils';


export type PseuplexMetadataParams = {
	plexServerURL: string;
	plexAuthContext: plexTypes.PlexAuthContext;
	includeDiscoverMatches?: boolean;
	includeUnmatched?: boolean;
	transformMatchKeys?: boolean;
	metadataBasePath?: string;
	qualifiedMetadataIds?: boolean;
	plexParams?: plexTypes.PlexMetadataPageParams;
};

export type PseuplexMetadataProviderParams = PseuplexMetadataParams & {
	transformMetadataItem?: (metadataItem: PseuplexMetadataItem, id: PseuplexPartialMetadataIDString, provider: PseuplexMetadataProvider) => PseuplexMetadataItem | Promise<PseuplexMetadataItem>;
};

export interface PseuplexMetadataProvider {
	get source(): PseuplexMetadataSource;
	readonly basePath: string;
	readonly idToPlexGuidCache: CachedFetcher<string>;
	readonly plexGuidToIDCache: CachedFetcher<string>;
	get(ids: string[], options: PseuplexMetadataParams): Promise<PseuplexMetadataPage>;
}

export type PseuplexMetadataProviderOptions = {
	basePath: string;
};

export type PseuplexMetadataTransformOptions = {
	qualifiedMetadataId: boolean;
	metadataBasePath: string;
};

export abstract class PseuplexMetadataProviderBase<TMetadataItem> implements PseuplexMetadataProvider {
	readonly basePath: string;
	readonly idToPlexGuidCache: CachedFetcher<string>;
	readonly plexGuidToIDCache: CachedFetcher<string>;

	constructor(options: PseuplexMetadataProviderOptions) {
		this.basePath = options.basePath;
		this.idToPlexGuidCache = new CachedFetcher(async (id: string) => {
			throw new Error("Cannot fetch guid from cache");
		});
		this.plexGuidToIDCache = new CachedFetcher(async (id: string) => {
			throw new Error("Cannot fetch id from cache");
		});
	}

	abstract get source(): PseuplexMetadataSource;
	abstract fetchMetadataItem(id: PseuplexPartialMetadataIDString): Promise<TMetadataItem>;
	abstract transformMetadataItem(metadataItem: TMetadataItem, options: PseuplexMetadataTransformOptions): PseuplexMetadataItem;
	abstract idFromMetadataItem(metadataItem: TMetadataItem): PseuplexPartialMetadataIDString;
	
	abstract getPlexMatchParams(metadataItem: TMetadataItem): PlexMediaItemMatchParams;
	async getPlexGUIDForID(id: PseuplexPartialMetadataIDString, options: {
		plexAuthContext: plexTypes.PlexAuthContext
	}): Promise<string> {
		let plexGuid = this.idToPlexGuidCache.get(id);
		if(plexGuid || plexGuid === null) {
			return await plexGuid;
		}
		// get provider metadata item
		return await this.idToPlexGuidCache.set(id, (async () => {
			const item = await this.fetchMetadataItem(id);
			const matchParams = this.getPlexMatchParams(item);
			if(!matchParams) {
				return null;
			}
			const matchingMetadata = await findMatchingPlexMediaItem({
				...matchParams,
				authContext: options.plexAuthContext
			});
			const plexGuid = matchingMetadata?.guid;
			if(!plexGuid) {
				return null;
			}
			this.plexGuidToIDCache.setSync(plexGuid, id);
			return plexGuid;
		})());
	}
	async attachPlexDataIfAble(metadataId: PseuplexPartialMetadataIDString, metadataItem: plexTypes.PlexMetadataItem, options: {
		plexServerURL: string;
		plexAuthContext: plexTypes.PlexAuthContext
	}): Promise<plexTypes.PlexMetadataItem> {
		try {
			const plexGuid = (options.plexAuthContext?.['X-Plex-Token']) ?
				await this.getPlexGUIDForID(metadataId, {
					plexAuthContext: options.plexAuthContext
				})
				: await this.idToPlexGuidCache.get(metadataId);
			if(plexGuid) {
				metadataItem.guid = plexGuid;
			}
		} catch(error) {
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
		plexServerURL: string,
		plexAuthContext: plexTypes.PlexAuthContext
	}): Promise<PseuplexPartialMetadataIDString> {
		// try to get id from cache
		const id = await this.plexGuidToIDCache.get(plexGuid);
		if(id) {
			return id;
		} else if(id === null) {
			return null;
		}
		// get metadata item
		const metadatas = (await plexServerAPI.getLibraryMetadata(plexGuid, {
			serverURL: options.plexServerURL,
			authContext: options.plexAuthContext
		}))?.MediaContainer?.Metadata;
		const metadataItem = (metadatas instanceof Array) ? metadatas[0] : metadatas;
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
		let plexGuids: {[id: PseuplexPartialMetadataIDString]: Promise<string> | string | null} = {};
		let plexMatches: {[id: PseuplexPartialMetadataIDString]: (Promise<plexTypes.PlexMetadataItem> | plexTypes.PlexMetadataItem | null)} = {};
		let providerItems: {[id: PseuplexPartialMetadataIDString]: TMetadataItem | Promise<TMetadataItem>} = {};
		const transformOpts: PseuplexMetadataTransformOptions = {
			qualifiedMetadataId: options.qualifiedMetadataIds ?? false,
			metadataBasePath: options.metadataBasePath ?? this.basePath
		};
		const externalPlexTransformOpts: PseuplexMetadataTransformOptions = {
			qualifiedMetadataId: true,
			metadataBasePath: '/library/metadata'
		};
		// setup tasks for each id
		for(const id of ids) {
			if(id in plexGuids) {
				// skip
				continue;
			}
			let plexGuid = this.idToPlexGuidCache.get(id);
			if(plexGuid || plexGuid === null) {
				plexGuids[id] = plexGuid;
			}
			if(plexGuid) {
				continue;
			}
			// get provider metadata item
			const itemTask = providerItems[id] ?? this.fetchMetadataItem(id);
			providerItems[id] = itemTask;
			if(plexGuid !== null) {
				const metadataTask = (async () => {
					const item = await itemTask;
					const matchParams = this.getPlexMatchParams(item);
					if(!matchParams) {
						return null;
					}
					return await findMatchingPlexMediaItem({
						...matchParams,
						authContext: options.plexAuthContext,
						params: options.plexParams
					});
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
		// get guids and map them to items on the server
		const guidsToFetch = (await Promise.all(Object.values(plexGuids))).filter((guid) => guid);
		const plexMetadataMap: {[guid: string]: PseuplexMetadataItem} = {};
		let serverResult: plexTypes.PlexMetadataPage | undefined = undefined;
		if(guidsToFetch.length > 0) {
			try {
				serverResult = await plexServerAPI.getLibraryMetadata(guidsToFetch, {
					serverURL: options.plexServerURL,
					authContext: options.plexAuthContext,
					params: options.plexParams
				});
			} catch(error) {
				if((error as HttpError).statusCode != 404) {
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
							metadataId: metadata.guid,
							isOnServer: true
						};
						plexMetadataMap[metadata.guid] = pseuMetadata;
					}
				}
			}
		}
		// include plex disover results if allowed
		if(options.includeDiscoverMatches ?? true) {
			// fill any missing items in plexMetadataMap with values from plexMatches
			for(const id of ids) {
				const guid = await plexGuids[id];
				if(guid) {
					if(!plexMetadataMap[guid]) {
						const matchMetadata = await plexMatches[id];
						if(matchMetadata?.guid && !plexMetadataMap[matchMetadata.guid]) {
							plexMetadataMap[matchMetadata.guid] = extPlexTransform.transformExternalPlexMetadata(matchMetadata, plexDiscoverAPI.BASE_URL, externalPlexTransformOpts);
						}
					}
				}
			}
			// get any remaining guids from plex discover
			const remainingGuids = guidsToFetch.filter((guid) => !plexMetadataMap[guid]);
			if(remainingGuids.length > 0) {
				const discoverResult = await plexServerAPI.getLibraryMetadata(remainingGuids.map((guid) => plexDiscoverAPI.guidToMetadataID(guid)), {
					serverURL: plexDiscoverAPI.BASE_URL,
					authContext: options.plexAuthContext,
					params: options.plexParams
				});
				let metadatas = discoverResult?.MediaContainer.Metadata;
				if(metadatas) {
					if(!(metadatas instanceof Array)) {
						metadatas = [metadatas];
					}
					for(const metadata of metadatas) {
						if(metadata.guid) {
							plexMetadataMap[metadata.guid] = extPlexTransform.transformExternalPlexMetadata(metadata, plexDiscoverAPI.BASE_URL, externalPlexTransformOpts);
						}
					}
				}
			}
		}
		// get all results
		const metadatas = (await Promise.all(ids.map(async (id) => {
			const guid = await plexGuids[id];
			let metadataItem = guid ? plexMetadataMap[guid] : null;
			if(metadataItem) {
				// get item from plex
				const idParts = parsePartialMetadataID(id);
				metadataItem.Pseuplex.metadataId = stringifyMetadataID({
					...idParts,
					source: this.source,
					isURL: false
				});
				if(options.transformMatchKeys || !metadataItem.Pseuplex.isOnServer) {
					let metadataId: string;
					if(transformOpts.qualifiedMetadataId) {
						const idParts = parsePartialMetadataID(id);
						metadataId = stringifyMetadataID({
							...idParts,
							source: this.source,
							isURL: false
						});
					} else {
						metadataId = id;
					}
					metadataItem.key = `${transformOpts.metadataBasePath}/${metadataId}`;
				}
			} else if(options.includeUnmatched ?? true) {
				// get item from provider
				let providerMetadataItemTask = providerItems[id];
				if(!providerMetadataItemTask) {
					providerMetadataItemTask = this.fetchMetadataItem(id);
					providerItems[id] = providerMetadataItemTask;
				}
				const providerMetadataItem = await providerMetadataItemTask;
				metadataItem = this.transformMetadataItem(providerMetadataItem, transformOpts);
			} else {
				return null;
			}
			if(options.transformMetadataItem) {
				metadataItem = await options.transformMetadataItem(metadataItem, id, this);
			}
			return metadataItem;
		}))).filter((metadata) => metadata);
		// done
		return {
			MediaContainer: {
				size: metadatas.length,
				allowSync: false,
				identifier: plexTypes.PlexPluginIdentifier.PlexAppLibrary,
				// TODO include library section info
				Metadata: metadatas
			}
		};
	}
}
