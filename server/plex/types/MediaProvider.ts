import {
	PlexLibraryAgent,
	PlexLibraryScanner,
	PlexMediaItemType,
	PlexPluginIdentifier,
	PlexSymbol
} from './common';


export type PlexMediaProvider = {
	identifier: PlexPluginIdentifier;
	title: string;
	protocols: string;
	icon?: string;
	version?: string;
	types?: string;
	Feature: PlexMediaProviderFeature[];
};

export type PlexMediaProviderRef = {
	identifier: PlexPluginIdentifier;
	baseURL: string;
	title: string;
	icon: string;
	sourceTitle: string | null;
	token: string;
};



// feature

export enum PlexFeatureType {
	Actions = 'actions',
	Availability = 'availability',
	Content = 'content',
	Match = 'match',
	Metadata = 'metadata',
	Search = 'search',
	Settings = 'settings',
	UniversalSearch = 'universalsearch'
}

export type PlexFeature = {
	type: PlexFeatureType;
	key: string;
};

export type PlexMediaProviderFeature = PlexFeature | PlexActionsFeature | PlexContentFeature;



// actions

export type PlexActionsFeature = {
	type: PlexFeatureType.Actions,
	Action: PlexAction[];
};

export type PlexAction = {
	id: string;
	key: string;
	reverseKey?: string;
}



// content

export type PlexContentFeature = {
	type: PlexFeatureType.Content;
	Directory: PlexContentDirectoryWithPivots[];
};

export type PlexContentDirectory = {
	title: string; // "My Movies"
	hubKey: string; // "/hubs/sections/1"
	key?: string; // "/library/sections/1" on /media/providers, "1" on /library/sections
	id?: string; // "1"
	uuid?: string;
	type?: PlexMediaItemType;
	language?: string; // en-US
	agent?: PlexLibraryAgent;
	refreshing?: boolean;
	scanner?: PlexLibraryScanner;
	updatedAt?: number; // timestamp in seconds from 1970
	scannedAt?: number; // timestamp in seconds from 1970
	hidden?: number;

	// only on plex discover
	icon?: string; // "https://provider-static.plex.tv/icons/discover-560.svg"
	context?: PlexPivotContext;
};

export type PlexContentDirectoryWithPivots = PlexContentDirectory & {
	Pivot?: PlexPivot[];
};

export enum PlexPivotID {
	Recommended = 'recommended',
	Library = 'library',
	Collections = 'collections',
	Playlists = 'playlists',
	Categories = 'categories',
}

export type PlexPivot = {
	id: PlexPivotID | string; // "recommended", "library", "collections", "playlists", "categories"
	key: string; // "/hubs/section/1", "/library/sections/1/all?type=1", "/library/sections/1/collections", "/playlists?type=15&sectionID=1&playlistType=video"
	type: PlexPivotType;
	title: string; // "Recommended", "Library", "Collections"
	context: PlexPivotContext;
	symbol: PlexSymbol;
};

export enum PlexPivotType {
	Hub = 'hub',
	List = 'list',
	View = 'view'
}

export enum PlexPivotContext {
	// plex library section
	Discover = 'content.discover',
	Library = 'content.library',
	Collections = 'content.collections',
	Playlists = 'content.playlists',
	Categories = 'content.categories',

	// discover home
	Home = 'content.home',
	Activity = 'content.activity',
	Friends = 'content.friends',
	People = 'content.people',
	Profile = 'content.profile',

	// discover watchlist
	Watchlist = 'content.watchlist',
	WatchlistRecommended = 'content.watchlist.recommended',
	WatchlistAll = 'content.watchlist.all',
}



// settings

export type PlexMediaProviderSetting = {
	hidden?: boolean;
	id: string;
	type: PlexMediaProviderSettingType;
	key: string;
	label: string;
	summary: string;
};

export enum PlexMediaProviderSettingType {
	PreferredServices = 'preferredServices',
	SearchProviders = 'searchProviders'
}

export type PlexMediaProviderSettingsPage = {
	MediaContainer: {
		identifier: PlexPluginIdentifier;
		size: number;
		Setting: PlexMediaProviderSetting[]
	}
};
