
import { CachedFetcher } from '../fetching/CachedFetcher';
import * as plexTypes from './types';
import * as plexServerAPI from './api';
import { PlexClient } from './client';
import { httpError } from '../utils/error';
import { forArrayOrSingle } from '../utils/misc';

export const createPlexServerIdToGuidCache = (options: plexServerAPI.PlexAPIRequestOptions) => {
	return new CachedFetcher<string | null | undefined>(async (id: string) => {
		let metadatas = (await plexServerAPI.getLibraryMetadata(id, options))?.MediaContainer?.Metadata;
		let metadata: plexTypes.PlexMetadataItem;
		if(metadatas instanceof Array) {
			metadata = metadatas[0];
		} else {
			metadata = metadatas;
		}
		if(!metadata) {
			throw httpError(404, "Not Found");
		}
		return metadata.guid;
	});
};


export type PlexIdCachedInfo = {
	index?: number;
	slug?: string;
	parentIndex?: number;
	parentSlug?: string;
	parentRatingKey?: string;
	grandparentSlug?: string;
	grandparentRatingKey?: string;
	thumb?: string;
	year?: number;
	Guid?: plexTypes.PlexGuid[];
};


export class PlexIdToInfoCache extends CachedFetcher<PlexIdCachedInfo | null> {
	static fields: (keyof PlexIdCachedInfo)[] = [
		'index',
		'slug',
		'thumb',
		'year',
		'parentIndex','parentSlug','parentRatingKey',
		'grandparentSlug','grandparentRatingKey',
	];
	static elements: (keyof PlexIdCachedInfo)[] = ['Guid'];
	plexMetadataClient: PlexClient;

	constructor(options: {
		plexMetadataClient: PlexClient;
	}) {
		super(async (plexId: string) => {
			let metadatas = (await this.plexMetadataClient.getMetadata(plexId))?.MediaContainer?.Metadata;
			let metadataItem: plexTypes.PlexMetadataItem;
			if(metadatas instanceof Array) {
				metadataItem = metadatas[0];
			} else {
				metadataItem = metadatas;
			}
			if(!metadataItem) {
				return null;
			}
			return this.metadataToInfo(metadataItem);
		});
		this.plexMetadataClient = options.plexMetadataClient;
	}

	private metadataToInfo(metadataItem: plexTypes.PlexMetadataItem): PlexIdCachedInfo {
		return {
			index: metadataItem.index,
			slug: metadataItem.slug,
			parentIndex: metadataItem.parentIndex,
			parentSlug: metadataItem.parentSlug,
			parentRatingKey: metadataItem.parentRatingKey,
			grandparentSlug: metadataItem.grandparentSlug,
			grandparentRatingKey: metadataItem.grandparentRatingKey,
			Guid: metadataItem.Guid,
		};
	}

	cacheMetadataItem(metadataItem: plexTypes.PlexMetadataItem) {
		if(metadataItem && metadataItem.slug && metadataItem.guid) {
			this.setSync(metadataItem.guid, this.metadataToInfo(metadataItem));
		}
	}
	
	cacheMetadataItems(metadataItems: plexTypes.PlexMetadataItem[] | plexTypes.PlexMetadataItem) {
		forArrayOrSingle(metadataItems, (metadataItem) => {
			this.cacheMetadataItem(metadataItem);
		});
	}

	cacheMetadataItemForPlexId(plexId: string, metadataItemTask: Promise<plexTypes.PlexMetadataItem | undefined | null>) {
		this.setSync(plexId, metadataItemTask.then((item) => {
			if(!item) {
				return null;
			}
			return this.metadataToInfo(item);
		}));
	}
}
