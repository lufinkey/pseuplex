
import qs from 'querystring';
import * as plexTypes from '../plex/types';
import { parseMetadataIDFromKey } from '../plex/utils';

export type PseuplexHubPage = {
	hub: plexTypes.PlexHub;
	items: plexTypes.PlexMetadataItem[];
	offset?: number;
	totalCount?: number;
	more: boolean;
}

export type PseuplexHubPageParams = plexTypes.PlexHubPageParams & {
	listStartToken?: string | number | null | undefined;
};

export abstract class PseuplexHub {
	get metadataBasePath() {
		return '/library/metadata/';
	}

	abstract get(params: PseuplexHubPageParams): Promise<PseuplexHubPage>;
	
	async getHub(params: PseuplexHubPageParams): Promise<plexTypes.PlexHubPage> {
		const page = await this.get(params);
		return {
			MediaContainer: {
				size: (page.items?.length ?? 0),
				totalSize: page.totalCount,
				offset: page.offset,
				allowSync: false, // TODO figure out what this does
				//identifier: 'com.plexapp.plugins.library', // TODO figure out what this does
				Meta: {
					Type: [
						{
							key: page.hub.key,
							type: page.hub.type,
							title: page.hub.title,
							active: (page.totalCount != 0)
						}
					]
				},
				Metadata: page.items
			}
		};
	}
	
	async getHubListEntry(params: PseuplexHubPageParams): Promise<plexTypes.PlexHubWithItems> {
		const page = await this.get(params);
		let metadataBasePath = this.metadataBasePath;
		if(metadataBasePath && !metadataBasePath.endsWith('/')) {
			metadataBasePath += '/';
		}
		const metadataIds = page.items
			.map((item) => parseMetadataIDFromKey(metadataBasePath, item.key)?.id)
			.filter((metadataId) => (metadataId != null));
		return {
			...page.hub,
			hubKey: metadataIds.length > 0 ? `${metadataBasePath}${metadataIds.join(',')}` : undefined,
			size: (page.items?.length ?? 0),
			more: page.more,
			Metadata: page.items
		};
	}
}
