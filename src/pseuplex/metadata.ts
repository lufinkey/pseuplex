
import { CachedFetcher } from '../fetching/CachedFetcher';
import * as plexTypes from '../plex/types';
import * as plexServerAPI from '../plex/api';
import * as plexDiscoverAPI from '../plexdiscover';
import * as extPlexTransform from './externalplex';
import {
	findMatchingPlexMediaItem,
	PlexMediaItemMatchParams
} from './matching';
import {
	PseuplexMetadataItem,
	PseuplexMetadataPage
} from './types';
import {
	HttpError
} from '../utils';

export type PseuplexMetadataProviderParams = {
	plexServerURL: string;
	plexAuthContext: plexTypes.PlexAuthContext;
	includeDiscoverMatches?: boolean;
	includeUnmatched?: boolean;
	transformMatchKeys?: boolean;
	plexParams?: {[key: string]: any}
};

export type PseuplexMetadataProviderOptions = {
	basePath: string;
};

export abstract class PseuplexMetadataProvider<TRawMetadataItem> {
	readonly basePath: string;
	readonly idToPlexGuidCache: CachedFetcher<string>;

	constructor(options: PseuplexMetadataProviderOptions) {
		this.basePath = options.basePath;
		this.idToPlexGuidCache = new CachedFetcher(async (id: string) => {
			throw new Error("Cannot fetch guid from cache");
		});
	}

	abstract fetchRawMetadata(id: string): Promise<TRawMetadataItem>;
	abstract transformRawMetadata(metadataItem: TRawMetadataItem): PseuplexMetadataItem;
	abstract getRawMetadataMatchParams(metadataItem: TRawMetadataItem): PlexMediaItemMatchParams;

	async get(ids: string[], options: PseuplexMetadataProviderParams): Promise<PseuplexMetadataPage> {
		let plexGuids: {[id: string]: Promise<string> | string | null} = {};
		let plexMatches: {[id: string]: (Promise<plexTypes.PlexMetadataItem> | plexTypes.PlexMetadataItem | null)} = {};
		let providerItems: {[id: string]: TRawMetadataItem | Promise<TRawMetadataItem>} = {};
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
			const itemTask = providerItems[id] ?? this.fetchRawMetadata(id);
			providerItems[id] = itemTask;
			if(plexGuid !== null) {
				const metadataTask = (async () => {
					const item = await itemTask;
					const matchParams = this.getRawMetadataMatchParams(item);
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
				plexGuids[id] = this.idToPlexGuidCache.set(id, guidTask);
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
							plexMetadataMap[matchMetadata.guid] = extPlexTransform.transformExternalPlexMetadata(matchMetadata, plexDiscoverAPI.BASE_URL);
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
							plexMetadataMap[metadata.guid] = extPlexTransform.transformExternalPlexMetadata(metadata, plexDiscoverAPI.BASE_URL);
						}
					}
				}
			}
		}
		// get all results
		const metadatas = (await Promise.all(ids.map(async (id) => {
			const guid = await plexGuids[id];
			let metadataItem = guid ? plexMetadataMap[guid] : null;
			if(!metadataItem) {
				if(options.includeUnmatched ?? true) {
					let providerMetadataItemTask = providerItems[id];
					if(!providerMetadataItemTask) {
						providerMetadataItemTask = this.fetchRawMetadata(id);
						providerItems[id] = providerMetadataItemTask;
					}
					const providerMetadataItem = await providerMetadataItemTask;
					metadataItem = this.transformRawMetadata(providerMetadataItem);
				} else {
					return null;
				}
			}
			if(options.transformMatchKeys || !metadataItem.Pseuplex.isOnServer) {
				metadataItem.key = `${this.basePath}/${id}`;
			}
			return metadataItem;
		}))).filter((metadata) => metadata);
		// done
		return {
			MediaContainer: {
				size: metadatas.length,
				allowSync: false,
				// TODO include library section info
				Metadata: metadatas
			}
		};
	}
}
