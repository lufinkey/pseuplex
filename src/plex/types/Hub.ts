
import express from 'express';
import {
	PlexMediaItemType
} from './common';
import {
	PlexHubContext,
	PlexHubIdentifier
} from './HubContext';
import {
	PlexMetadataItem
} from './Metadata';
import {
	PlexMeta
} from './Meta';
import { PlexMediaContainer } from './MediaContainer';
import {
	parseIntQueryParam,
	parseStringArrayQueryParam,
	parseBooleanQueryParam,
} from '../../utils/queryparams';


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
	hubIdentifier: PlexHubIdentifier | string; // "movie.inprogress.1", "hub.movie.recentlyadded.1"
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
	includeMeta?: boolean;
	excludeFields?: string[]; // "summary"
	'X-Plex-Container-Start'?: number;
	'X-Plex-Container-Size'?: number;
};

export const parsePlexHubPageParams = (req: express.Request, options: {fromListPage: boolean}): PlexHubPageParams => {
	if(options.fromListPage) {
		const hubListParams = parsePlexHubListPageParams(req);
		return plexHubPageParamsFromHubListParams(hubListParams);
	}
	const query = req.query ?? {};
	return {
		'X-Plex-Container-Start': parseIntQueryParam(query['X-Plex-Container-Start'] ?? req.header('x-plex-container-start')),
		'X-Plex-Container-Size': parseIntQueryParam(query['X-Plex-Container-Size'] ?? req.header('x-plex-container-size')),
		excludeFields: parseStringArrayQueryParam(query['excludeFields']),
		includeMeta: parseBooleanQueryParam(query['includeMeta']),
	} satisfies (PlexHubPageParams & Partial<PlexHubPageParams>);
};

export const plexHubPageParamsFromHubListParams = (hubListParams: PlexHubListPageParams): PlexHubPageParams => {
	const params: Partial<PlexHubListPageParams & PlexHubPageParams> = {...hubListParams};
	params['X-Plex-Container-Size'] = params.count;
	delete params.count;
	delete params['X-Plex-Container-Start'];
	return params;
};

export type PlexHubPage = {
	MediaContainer: PlexMediaContainer & {
		Meta?: PlexMeta;
		Metadata: PlexMetadataItem[]
	}
};



export type PlexHubListPageParams = {
	contentDirectoryID?: string[];
	pinnedContentDirectoryID?: string[];
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
		contentDirectoryID: parseStringArrayQueryParam(query['contentDirectoryID']),
		pinnedContentDirectoryID: parseStringArrayQueryParam(query['pinnedContentDirectoryID']),
		count: parseIntQueryParam(query['count']),
		includeLibraryPlaylists: parseBooleanQueryParam(query['includeLibraryPlaylists']),
		includeStations: parseBooleanQueryParam(query['includeStations']),
		includeRecentChannels: parseBooleanQueryParam(query['includeRecentChannels']),
		includeMeta: parseBooleanQueryParam(query['includeMeta']),
		includeExternalMetadata: parseBooleanQueryParam(query['includeExternalMetadata']),
		excludeFields: parseStringArrayQueryParam(query['excludeFields'])
	};
};

export type PlexHubsPage = {
	MediaContainer: PlexMediaContainer & {
		librarySectionID?: string | number;
		librarySectionTitle?: string;
		librarySectionUUID?: string;
		Hub?: PlexHubWithItems[]
	}
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
