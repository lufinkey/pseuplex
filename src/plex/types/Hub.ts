
import * as qs from 'qs';
import {
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
import {
	intParam,
	stringParam,
	stringArrayParam,
	booleanParam
} from '../../utils';
import { PlexMediaContainer } from './MediaContainer';


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
	includeMeta?: number | boolean;
	excludeFields?: string[]; // "summary"
	start?: number;
	count?: number
};

export const parsePlexHubQueryParams = (query: qs.ParsedQs, options: {includePagination: boolean}): PlexHubPageParams => {
	return {
		start: options.includePagination ? intParam(query['X-Plex-Container-Start']) : undefined,
		count: options.includePagination ? intParam(query['X-Plex-Container-Size']) : undefined,
		contentDirectoryID: stringArrayParam(query['contentDirectoryID']),
		pinnedContentDirectoryID: stringArrayParam(query['pinnedContentDirectoryID']),
		excludeFields: stringArrayParam(query['excludeFields']),
		includeMeta: booleanParam(query['includeMeta'])
	};
};

export type PlexHubsPage = {
	MediaContainer: PlexMediaContainer & {
		Hub: PlexHub | PlexHub[]
	}
};

export type PlexHubPage = {
	MediaContainer: PlexMediaContainer & {
		Meta: PlexMeta;
		Metadata: PlexMetadataItem[]
	}
};
