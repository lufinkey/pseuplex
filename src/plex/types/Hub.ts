
import * as qs from 'qs';
import express from 'express';
import {
	PlexXMLBoolean,
	PlexMediaItemType
} from './common';
import {
	PlexHubContext
} from './HubContext';
import {
	PlexMetadataItem
} from './Metadata';
import {
	PlexMeta
} from './Meta';
import { PlexMediaContainer } from './MediaContainer';
import {
	intParam,
	stringParam,
	stringArrayParam,
	booleanParam
} from '../../utils';


export enum PlexHubNumericType {
	Movie = 1
}

export enum PlexHubStyle {
	Shelf = 'shelf',
	Hero = 'hero'
}

export type PlexHub = {
	key: string; // "/hubs/sections/1/continueWatching/items"
	title: string; // "Continue Watching"
	type: PlexMediaItemType;
	hubIdentifier: string; // "movie.inprogress.1", "hub.movie.recentlyadded.1"
	context: PlexHubContext | string;
	style: PlexHubStyle;
	random?: boolean;
	promoted?: boolean;
}

export type PlexHubWithItems = PlexHub & {
	hubKey: string; // "/library/metadata/21406,1859,18071"
	size?: number;
	more?: boolean;
	Metadata?: PlexMetadataItem[]
}


export type PlexHubPageParams = {
	contentDirectoryID?: string[];
	pinnedContentDirectoryID?: string[];
	includeMeta?: boolean;
	excludeFields?: string[]; // "summary"
	start?: number;
	count?: number
};

export const parsePlexHubPageParams = (req: express.Request, options: {fromListPage: boolean}): PlexHubPageParams => {
	const query = req.query;
	if(!query) {
		return {};
	}
	return {
		start: options.fromListPage ? undefined : intParam(query['X-Plex-Container-Start'] ?? req.header('x-plex-container-start')),
		count: options.fromListPage ? intParam(query['count']) : intParam(query['X-Plex-Container-Size'] ?? req.header('x-plex-container-size')),
		contentDirectoryID: stringArrayParam(query['contentDirectoryID']),
		pinnedContentDirectoryID: stringArrayParam(query['pinnedContentDirectoryID']),
		excludeFields: stringArrayParam(query['excludeFields']),
		includeMeta: booleanParam(query['includeMeta'])
	};
};

export type PlexHubPage = {
	MediaContainer: PlexMediaContainer & {
		Meta: PlexMeta;
		Metadata: PlexMetadataItem[]
	}
};


export type PlexHubListPageParams = {
	count?: number;
	includeLibraryPlaylists?: boolean;
	includeStations?: boolean;
	includeRecentChannels?: boolean;
	includeMeta?: boolean;
	includeExternalMetadata?: boolean;
	excludeFields?: string[]; // "summary"
};

export const parsePlexHubListPageParams = (req: express.Request): PlexHubListPageParams => {
	const query = req.query;
	if(!query) {
		return {};
	}
	return {
		count: intParam(query['count']),
		includeLibraryPlaylists: booleanParam(query['includeLibraryPlaylists']),
		includeStations: booleanParam(query['includeStations']),
		includeRecentChannels: booleanParam(query['includeRecentChannels']),
		includeMeta: booleanParam(query['includeMeta']),
		includeExternalMetadata: booleanParam(query['includeExternalMetadata']),
		excludeFields: stringArrayParam(query['excludeFields'])
	};
};

export type PlexLibraryHubsPage = {
	MediaContainer: PlexMediaContainer & {
		Hub: PlexHubWithItems[]
	}
};

export type PlexSectionHubsPage = {
	MediaContainer: PlexMediaContainer & {
		librarySectionID: string | number;
		librarySectionTitle: string;
		librarySectionUUID: string;
		Hub?: PlexHubWithItems[]
	}
};
