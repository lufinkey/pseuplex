
import qs from 'querystring';
import * as plexTypes from '../plex/types';
import { parseMetadataIDFromKey } from '../plex/metadataidentifier';
import { CachedFetcher } from '../fetching/CachedFetcher';


export type PseuplexPlaylistPage = {
	playlist: plexTypes.PlexPlaylist;
	items: plexTypes.PlexMetadataItem[];
	offset?: number;
	totalCount?: number;
	more: boolean;
}

export type PseuplexPlaylistPageParams = plexTypes.PlexPlaylistItemsPageParams & {
	// listVersion?: string | number | null | undefined;
};

export type PseuplexPlaylistParams = {
	//
};

export type PseuplexPlaylistContext = {
	plexServerURL: string;
	plexAuthContext: plexTypes.PlexAuthContext;
};

export abstract class PseuplexPlaylist {
	abstract get(params: PseuplexPlaylistPageParams, context: PseuplexPlaylistContext): Promise<PseuplexPlaylistPage>;
	
	async getPlaylist(params: PseuplexPlaylistParams, context: PseuplexPlaylistContext): Promise<plexTypes.PlexPlaylistPage> {
		const page = await this.get({
			...params,
			count: 0
		}, context);
		return {
			MediaContainer: {
				size: 1,
				Metadata: [page.playlist]
			}
		};
	}
	
	async getPlaylistItems(params: PseuplexPlaylistPageParams, context: PseuplexPlaylistContext): Promise<plexTypes.PlexPlaylistItemsPage> {
		const page = await this.get(params, context);
		return {
			MediaContainer: {
				size: (page.items?.length ?? 0),
				totalSize: page.totalCount!,
				offset: page.offset!,
				composite: page.playlist.composite,
				duration: Math.floor(page.playlist.duration / 1000),
				leafCount: page.playlist.leafCount,
				playlistType: page.playlist.playlistType,
				ratingKey: page.playlist.ratingKey,
				smart: page.playlist.smart,
				title: page.playlist.title,
				Metadata: page.items
			}
		};
	}
}



export abstract class PseuplexPlaylistProvider<TPlaylist extends PseuplexPlaylist = PseuplexPlaylist> {
	readonly cache: CachedFetcher<TPlaylist>;

	constructor() {
		this.cache = new CachedFetcher<TPlaylist>(async (id: string) => {
			return await this.fetch(id);
		});
	}

	abstract fetch(id: string): (TPlaylist | Promise<TPlaylist>);

	async get(id: string): Promise<TPlaylist> {
		return await this.cache.getOrFetch(id);
	}
}
