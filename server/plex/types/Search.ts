import { PlexMetadataItem } from './Metadata';
import { PlexTVSearchProviderType } from './SearchProvider';

export enum PlexLibrarySearchType {
	Movies = 'movies',
	TV = 'tv',
	Music = 'music',
	People = 'people'
}

export type PlexLibrarySearchResult = {
	score: number; // value between 0 and 1
	Metadata: PlexMetadataItem
};

export type PlexLibrarySearchResultsPage = {
	MediaContainer: {
		size: number;
		SearchResult: PlexLibrarySearchResult[];
	}
};

export type PlexLibrarySearchParams = {
	query: string;
	searchTypes: PlexLibrarySearchType | PlexLibrarySearchType[];
	limit?: number;
	includeCollections?: boolean,
	includeExternalMedia?: boolean
};



export enum PlexTVSearchType {
	AvailabilityPlatforms = 'availabilityPlatforms',
	Categories = 'categories',
	Movies = PlexLibrarySearchType.Movies,
	TV = PlexLibrarySearchType.TV,
	Music = PlexLibrarySearchType.Music,
	People = PlexLibrarySearchType.People,
	TVOnDemand = 'tvod',
	LiveTV = 'livetv'
}

export enum PlexTVSearchResultsType {
	Plex = 'plex',
	PlexTVOnDemand = 'plex_tvod',
	External = 'external'
};

export type PlexTVSearchResults = {
	id: PlexTVSearchResultsType;
	title: string;
	size: number;
	SearchResult?: PlexLibrarySearchResult[];
};

export type PlexTVSearchResultsPage = {
	MediaContainer: {
		suggestedTerms: string[];
		identifier: string[];
		size: number;
		SearchResults: PlexTVSearchResults[];
	}
};

export type PlexTVSearchParams = {
	query: string,
	searchTypes: PlexTVSearchType | PlexTVSearchType[],
	searchProviders?: PlexTVSearchProviderType | PlexTVSearchProviderType[],
	limit?: number,
	includeMetadata?: boolean,
	filterPeople?: boolean
};



export type PlexSearchResultsPage = PlexLibrarySearchResultsPage | PlexTVSearchResultsPage;
