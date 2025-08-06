import { PseuplexConfigBase } from '../../pseuplex/configbase';

export type JustWatchHubConfig = {
	title?: string;
	first?: number;
	objectType?: 'MOVIE' | 'SHOW';
	packages?: string[];
	language?: string;
	country?: string;
	popularTitlesSortBy?: 'POPULAR' | 'RECENT';
	monetizationTypes?: string[];
	genres?: string[];
	excludeGenres?: string[];
};

type JustWatchFlags = {
	justwatch?: {
		enabled?: boolean;
		defaultCountry?: string;
		defaultLanguage?: string;
	}
};

type JustWatchPerUserPluginConfig = {
	//
} & JustWatchFlags;

export type JustWatchPluginConfig = PseuplexConfigBase<JustWatchPerUserPluginConfig> & JustWatchFlags & {
	//
};

export interface JustWatchResponse {
	data: {
		popularTitles: {
			edges: JustWatchEdge[];
			pageInfo: {
				startCursor: string;
				endCursor: string;
				hasPreviousPage: boolean;
				hasNextPage: boolean;
			};
			totalCount: number;
		};
	};
}

export interface JustWatchSingleTitleResponse {
	data: {
		node: JustWatchTitle;
	};
}

export interface JustWatchEdge {
	cursor: string;
	node: JustWatchTitle;
}

export interface JustWatchTitle {
	__typename: 'Movie' | 'Show';
	id: string;
	objectId: number;
	objectType: 'MOVIE' | 'SHOW';
	content: {
		externalIds: {
			tmdbId?: string;
			imdbId?: string;
		};
		title: string;
		fullPath: string;
		originalReleaseYear: number;
		shortDescription?: string;
		posterUrl?: string;
		backdrops?: {
			backdropUrl: string;
		}[];
		runtime?: number;
		genres?: {
			translation: string;
			shortName: string;
		}[];
		scoring?: {
			imdbVotes?: number;
			imdbScore?: number;
			tmdbScore?: number;
			tomatoMeter?: number;
			jwRating?: number;
		};
	};
}

export interface JustWatchQueryVariables {
	first: number;
	popularTitlesSortBy: 'POPULAR' | 'RECENT';
	sortRandomSeed: number;
	offset?: number | null;
	creditsRole: string;
	after: string;
	popularTitlesFilter: {
		ageCertifications: string[];
		excludeGenres: string[];
		excludeProductionCountries: string[];
		objectTypes: string[];
		productionCountries: string[];
		subgenres: string[];
		genres: string[];
		packages: string[];
		excludeIrrelevantTitles: boolean;
		presentationTypes: string[];
		monetizationTypes: string[];
		searchQuery: string;
	};
	watchNowFilter: {
		packages: string[];
		monetizationTypes: string[];
	};
	language: string;
	country: string;
}
