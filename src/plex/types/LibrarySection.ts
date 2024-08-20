import {
	PlexSymbol,
	PlexLibraryAgent,
	PlexLibraryScanner
} from './common';

export enum PlexLibrarySectionType {
	Movie = 'movie',
	TVShow = 'show',
}

export type PlexLibraryMinimalSection = {
	hubKey: string; // "/hubs"
	title: string; // "Home"
}

export type PlexLibrarySection = {
	agent: PlexLibraryAgent;
	language: string; // en-US
	refreshing: boolean;
	scanner: PlexLibraryScanner;
	uuid: string;
	id: string; // "1"
	key: string; // "/library/sections/1"
	hubKey: string; // "/hubs/sections/1"
	type: PlexLibrarySectionType;
	title: string; // "My Movies"
	updatedAt: number; // timestamp in seconds from 1970
	scannedAt: number; // timestamp in seconds from 1970
	Pivot?: PlexLibrarySectionPivot[]
}

export enum PlexLibrarySectionPivotType {
	Hub = 'hub',
	List = 'list'
}

export enum PlexPivotContext {
	Discover = 'content.discover',
	Library = 'content.library',
	Collections = 'content.collections',
	Playlists = 'content.playlists',
	Categories = 'content.categories'
}

export type PlexLibrarySectionPivot = {
	id: string; // "recommended", "library", "collections", "playlists", "categories"
	key: string; // "/hubs/section/1", "/library/sections/1/all?type=1", "/library/sections/1/collections", "/playlists?type=15&sectionID=1&playlistType=video"
	type: PlexLibrarySectionPivotType;
	title: string; // "Recommended", "Library", "Collections"
	context: PlexPivotContext;
	symbol: PlexSymbol;
}
