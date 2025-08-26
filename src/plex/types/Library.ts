import express from 'express';
import {
	PlexLanguage,
	PlexLibraryAgent,
	PlexLibraryScanner,
	PlexMediaItemType,
	PlexMediaItemTypeNumeric,
	PlexPluginIdentifier,
} from './common';
import { PlexMediaContainer } from './MediaContainer';
import { PlexSetting } from './Prefs';
import {
	BooleanQueryParam,
	parseBooleanQueryParam,
	parseIntQueryParam,
	parseStringQueryParam
} from '../../utils/queryparams';




export type PlexGetLibraryMatchesParams = {
	guid?: string,
	type?: PlexMediaItemTypeNumeric | PlexMediaItemTypeNumeric[],
	title?: string,
	year?: number,
	agent?: PlexLibraryAgent,
	language?: PlexLanguage,
	includeFields?: string | string[],
	includeElements?: string | string[],
	excludeElements?: string | string[],
};

export type PlexLibrarySectionsPageParams = {
	includePreferences?: BooleanQueryParam;
};

export type PlexLibrarySection = {
	allowSync: boolean;
	art?: string;
	composite?: string; // "/library/sections/2/composite/1738767496"
	filters: boolean;
	refreshing?: boolean;
	thumb?: string; // "/:/resources/show.png", "/:/resources/movie.png"
	key: string; // "1"
	type: PlexMediaItemType;
	title: string;
	agent?: PlexLibraryAgent;
	scanner?: PlexLibraryScanner;
	language?: string; // "en-US"
	uuid: string;
	updatedAt?: number;
	createdAt?: number;
	scannedAt?: number;
	content: boolean;
	directory: boolean;
	contentChangedAt?: number;
	hidden?: number;
	Location?: PlexSectionLocation[];
	Preferences?: PlexSectionPreferences;
};

export type PlexSectionLocation = {
	id: number;
	path: string;
};

export type PlexSectionPreferences = {
	Setting: PlexSetting[];
};

export type PlexLibrarySectionsPage = {
	MediaContainer: PlexMediaContainer & {
		size: number;
		title1: string;
		Directory: PlexLibrarySection[];
	}
};



export type PlexLibrarySectionDirectory = {
	key: string;
	title: string;
} & ({
	secondary?: boolean;
} | {
	search: boolean;
	prompt: string;
});

export enum PlexLibrarySectionContentType {
	Secondary = 'secondary',
}

export enum PlexLibrarySectionViewGroup {
	Secondary = 'secondary',
}

export type PlexLibrarySectionPage = {
	MediaContainer: {
		size: number;
		allowSync: boolean;
		art?: string;
		content: PlexLibrarySectionContentType;
		identifier: PlexPluginIdentifier;
		librarySectionID: (number | string);
		mediaTagPrefix?: string;
		mediaTagVersion?: number;
		thumb?: string;
		title1: string;
		viewGroup: PlexLibrarySectionViewGroup;
		Directory?: PlexLibrarySectionDirectory[];
	}
};

export type PlexSectionAllItemsParams = {
	'X-Plex-Container-Start'?: number;
	'X-Plex-Container-Size'?: number;
};

export const parsePlexSectionAllItemsPageParams = (req: express.Request): PlexSectionAllItemsParams => {
	const query = req.query ?? {};
	// TODO some of these may be arrays sometimes
	return {
		'X-Plex-Container-Start': parseIntQueryParam(query['X-Plex-Container-Start'] ?? req.header('x-plex-container-start')),
		'X-Plex-Container-Size': parseIntQueryParam(query['X-Plex-Container-Size'] ?? req.header('x-plex-container-size')),
	};
};



export enum PlexLibrarySortField {
	Random = 'random',
	// TODO add other fields
};

export enum PlexLibrarySortOrder {
	Ascending = 'asc',
	Descending = 'desc',
};

export type PlexLibrarySortParam = `${PlexLibrarySortField}:${PlexLibrarySortOrder}` | PlexLibrarySortField | PlexLibrarySortOrder;

export type PlexLibraryAllItemsParams = {
	'X-Plex-Container-Start'?: number;
	'X-Plex-Container-Size'?: number;
	type?: PlexMediaItemTypeNumeric;
	guid?: string;
	'show.guid'?: string;
	season?: number;
	sort?: PlexLibrarySortParam | string;
	includeCollections?: boolean;
	includeExternalMedia?: boolean;
	includeAdvanced?: boolean;
	includeMeta?: boolean;
};

export const parsePlexLibraryAllItemsPageParams = (req: express.Request): PlexLibraryAllItemsParams => {
	const query = req.query ?? {};
	// TODO some of these may be arrays sometimes
	return {
		'X-Plex-Container-Start': parseIntQueryParam(query['X-Plex-Container-Start'] ?? req.header('x-plex-container-start')),
		'X-Plex-Container-Size': parseIntQueryParam(query['X-Plex-Container-Size'] ?? req.header('x-plex-container-size')),
		type: parseIntQueryParam(query['type']),
		guid: parseStringQueryParam(query['guid']),
		'show.guid': parseStringQueryParam(query['guid']),
		season: parseIntQueryParam(query['season']),
		sort: parseStringQueryParam(query['sort']),
		includeCollections: parseBooleanQueryParam(query),
		includeExternalMedia: parseBooleanQueryParam(query),
		includeAdvanced: parseBooleanQueryParam(query),
		includeMeta: parseBooleanQueryParam(query),
	};
};
