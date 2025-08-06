// JustWatch API Types

export enum JustWatchObjectType {
	Movie = 'MOVIE',
	Show = 'SHOW'
}

export enum JustWatchSortBy {
	Popular = 'POPULAR',
	Recent = 'RECENT'
}

export enum JustWatchCountry {
	Netherlands = 'NL',
	UnitedStates = 'US',
	UnitedKingdom = 'GB'
}

export enum JustWatchLanguage {
	English = 'en',
	Dutch = 'nl'
}

// External IDs
export type JustWatchExternalIds = {
	tmdbId?: string;
	imdbId?: string;
};

// Scoring information
export type JustWatchScoring = {
	imdbVotes?: number;
	imdbScore?: number;
	tmdbPopularity?: number;
	tmdbScore?: number;
	tomatoMeter?: number;
	certifiedFresh?: boolean;
	jwRating?: number;
};

// Genre information
export type JustWatchGenre = {
	translation: string;
	shortName: string;
};

// Backdrop image
export type JustWatchBackdrop = {
	backdropUrl: string;
};

// Credits
export type JustWatchCredit = {
	name: string;
	personId: number;
};

// Title content
export type JustWatchTitleContent = {
	externalIds: JustWatchExternalIds;
	title: string;
	fullPath: string;
	originalReleaseYear: number;
	shortDescription?: string;
	posterUrl?: string;
	backdrops?: JustWatchBackdrop[];
	runtime?: number;
	genres?: JustWatchGenre[];
	scoring?: JustWatchScoring;
	isReleased: boolean;
	credits?: JustWatchCredit[];
};

// Main title object
export type JustWatchTitle = {
	__typename: 'Movie' | 'Show';
	id: string;
	objectId: number;
	objectType: JustWatchObjectType;
	content: JustWatchTitleContent;
};

// Edge wrapper for paginated results
export type JustWatchEdge = {
	cursor: string;
	node: JustWatchTitle;
};

// Page info for pagination
export type JustWatchPageInfo = {
	startCursor: string;
	endCursor: string;
	hasPreviousPage: boolean;
	hasNextPage: boolean;
};

// Popular titles response
export type JustWatchPopularTitlesResponse = {
	data: {
		popularTitles: {
			edges: JustWatchEdge[];
			pageInfo: JustWatchPageInfo;
			totalCount: number;
		};
	};
};

// Single title response
export type JustWatchSingleTitleResponse = {
	data: {
		node: JustWatchTitle;
	};
};

// Query variables for popular titles
export type JustWatchPopularTitlesVariables = {
	first: number;
	popularTitlesSortBy: JustWatchSortBy;
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
	language: JustWatchLanguage;
	country: JustWatchCountry;
};

// Query variables for single title
export type JustWatchSingleTitleVariables = {
	titleId: string;
	language: JustWatchLanguage;
	country: JustWatchCountry;
};

// Error type
export type JustWatchError = {
	message: string;
	extensions?: {
		code: string;
		exception?: {
			stacktrace: string[];
		};
	};
};

// API response wrapper
export type JustWatchAPIResponse<T> = {
	data?: T;
	errors?: JustWatchError[];
};
