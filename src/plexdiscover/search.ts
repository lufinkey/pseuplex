import {
	PlexAuthContext,
	PlexMetadataItem
} from '../plex/types';
import { plexDiscoverFetch } from './core';

export enum SearchProvider {
	Discover = 'discover',
	plexAvailableOnDemand = 'plexAVOD',
	plexTVOnDemand = 'plexTVOD',
	plexFAST = 'plexFAST'
};

export enum SearchType {
	AvailabilityPlatforms = 'availabilityPlatforms',
	Categories = 'caegories',
	Movies = 'movies',
	TV = 'tv',
	People = 'people',
	TVOnDemand = 'tvod',
	LiveTV = 'livetv'
}

export type SearchResult = {
	score: number; // value between 0 and 1
	Metadata: PlexMetadataItem
};

export enum SearchResultsType {
	Plex = 'plex',
	PlexTVOnDemand = 'plex_tvod',
	External = 'external'
};

export type SearchResults = {
	id: SearchResultsType;
	title: string;
	size: number;
	SearchResult?: SearchResult[];
};

export type SearchResultsPage = {
	MediaContainer: {
		suggestedTerms: string[];
		identifier: string[];
		size: number;
		SearchResults: SearchResults[];
	}
};

const booleanQueryParam = (param: boolean | undefined): string | undefined => {
	return param != null ? (param ? '1' : '0') : undefined;
};

export const search = async (options: {
	query: string;
	searchTypes: SearchType | SearchType[];
	searchProviders: SearchProvider | SearchProvider[];
	limit?: number;
	includeMetadata?: boolean;
	filterPeople?: boolean;
	authContext?: PlexAuthContext | null
}): Promise<SearchResultsPage> => {
	return await plexDiscoverFetch<SearchResultsPage>({
		method: 'GET',
		endpoint: 'library/search',
		params: {
			query: options.query,
			limit: options.limit,
			searchTypes: (options.searchTypes instanceof Array ? options.searchTypes.join(',') : options.searchTypes),
			searchProviders: (options.searchProviders instanceof Array ? options.searchProviders.join(',') : options.searchProviders),
			includeMetadata: booleanQueryParam(options.includeMetadata),
			filterPeople: booleanQueryParam(options.filterPeople)
		},
		authContext: options.authContext
	});
};
