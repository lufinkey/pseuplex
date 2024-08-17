
import qs from 'querystring';
import {
	PlexHub,
	PlexHubContext,
	PlexHubStyle,
	PlexHubPage,
	PlexHubPageParams,
	PlexMediaItemType,
	PlexMediaContainerPage,
	PlexMetadataPage,
	PlexMetadataItem
} from '../plex/types';
import { parseMetadataIDFromKey } from '../plex/utils';

export interface PseuplexHubItemsPage {
	items: PlexMetadataPage[];
	offset?: number;
	totalCount?: number;
	more: boolean;
}

export type PseuplexHubPage = {
	hub: PlexHub,
	itemsPage: PseuplexHubItemsPage
}

export abstract class PseuplexHub<TParams extends PlexHubPageParams> {
	get metadataBasePath() {
		return '/library/metadata/';
	}

	abstract get(params: TParams): Promise<PseuplexHubPage>;
	
	async getHub(params: TParams): Promise<PlexMediaContainerPage> {
		const page = await this.get(params);
		return {
			size: (page.itemsPage.items?.length ?? 0),
			totalSize: page.itemsPage.totalCount,
			offset: page.itemsPage.offset,
			allowSync: false, // TODO figure out what this does
			//identifier: 'com.plexapp.plugins.library', // TODO figure out what this does
			Meta: {
				Type: [
					{
						key: page.hub.key,
						type: page.hub.type,
						title: page.hub.title,
						active: (page.itemsPage.totalCount != 0)
					}
				]
			},
			Metadata: page.itemsPage.items
		};
	}
	
	async getHubListEntry(params: TParams): Promise<PlexHubPage> {
		const page = await this.get(params);
		let metadataBasePath = this.metadataBasePath;
		if(metadataBasePath && !metadataBasePath.endsWith('/')) {
			metadataBasePath += '/';
		}
		const metadataIds = page.itemsPage.items
			.map((item) => parseMetadataIDFromKey(metadataBasePath, item.key)?.id)
			.filter((metadataId) => (metadataId != null));
		return {
			...page.hub,
			hubKey: metadataIds.length > 0 ? `${metadataBasePath}${metadataIds.join(',')}` : undefined,
			size: (page.itemsPage.items?.length ?? 0),
			more: page.itemsPage.more,
			Metadata: page.itemsPage.items
		};
	}
}
