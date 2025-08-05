
import { CachedFetcher } from '../fetching/CachedFetcher';
import * as plexTypes from './types';
import * as plexServerAPI from './api';
import { PlexClient } from './client';
import { parsePlexMetadataGuid } from './metadataidentifier';
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


export type PlexGuidCachedInfo = {
	index?: number;
	slug?: string;
	parentIndex?: number;
	parentSlug?: string;
	parentGuid?: string;
	parentRatingKey?: string;
	grandparentSlug?: string;
	grandparentGuid?: string;
	grandparentRatingKey?: string;
	Guid?: plexTypes.PlexGuid[];
};


export class PlexGuidToInfoCache extends CachedFetcher<PlexGuidCachedInfo | null> {
	static fields: (keyof PlexGuidCachedInfo)[] = [
		'index',
		'slug',
		'parentIndex','parentSlug','parentGuid','parentRatingKey',
		'grandparentSlug','grandparentGuid','grandparentRatingKey'
	];
	static elements: (keyof PlexGuidCachedInfo)[] = ['Guid'];
	plexMetadataClient: PlexClient;

	constructor(options: {
		plexMetadataClient: PlexClient;
	}) {
		super(async (guid: string) => {
			const guidParts = parsePlexMetadataGuid(guid);
			if(!guidParts) {
				return undefined!;
			}
			let metadatas = (await this.plexMetadataClient.getMetadata(guidParts.id))?.MediaContainer?.Metadata;
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

	private metadataToInfo(metadataItem: plexTypes.PlexMetadataItem): PlexGuidCachedInfo {
		return {
			index: metadataItem.index,
			slug: metadataItem.slug,
			parentIndex: metadataItem.parentIndex,
			parentSlug: metadataItem.parentSlug,
			parentGuid: metadataItem.parentGuid,
			parentRatingKey: metadataItem.parentRatingKey,
			grandparentSlug: metadataItem.grandparentSlug,
			grandparentGuid: metadataItem.grandparentGuid,
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

	cacheMetadataItemForGuid(guid: string, metadataItemTask: Promise<plexTypes.PlexMetadataItem | undefined | null>) {
		this.setSync(guid, metadataItemTask.then((item) => {
			if(!item) {
				return null;
			}
			return this.metadataToInfo(item);
		}));
	}
}
