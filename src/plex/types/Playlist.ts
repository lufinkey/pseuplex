import { PlexMediaItemType } from './common';
import { PlexMetadataItem } from './Metadata';

export type PlexPlaylist = {
	guid: string; // "com.plexapp.agents.none://d8895e9a-06d9-4549-a4d5-6e4d74a19bb9"
	ratingKey: string; // "42548"
	key: string; // "/playlists/42548/items"
	type: PlexMediaItemType.Playlist;
	title: string;
	summary: string;
	smart: boolean;
	playlistType: PlexMediaItemType;
	composite: string; // "/playlists/42548/composite/1726155341"
	viewCount: number;
	lastViewedAt: number; // 1720153977
	thumb: string; // "/library/metadata/42548/thumb/1726155341"
	duration: number; // 350663000
	leafCount: number; // number of items in the playlist
	addedAt: number; // 1720153977
	updatedAt: number; // 1726155341
};

export type PlexPlaylistPage = {
	MediaContainer: {
		size: number;
		Metadata: PlexPlaylist[];
	}
};

export type PlexPlaylistItemsPageParams = {
	includeExternalMetadata?: boolean;
	start?: number;
	count?: number;
};

export type PlexPlaylistItemsPage = {
	MediaContainer: {
		size: number;
		totalSize: number;
		offset: number;
		composite: string; // "/playlists/42548/composite/1726155341"
		duration: number; // 350663 (seems to be playlist.duration / 1000)
		leafCount: number; // number of items in the playlist
		playlistType: PlexMediaItemType;
		ratingKey: string; // "42548"
		smart: boolean;
		title: string;
		Metadata: PlexMetadataItem[];
	}
};
