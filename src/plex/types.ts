
import {
	XML_ATTRIBUTES_CHAR
} from '../constants';

export enum PlexLibraryAgent {
	Movie = 'tv.plex.agents.movie',
	TVSeries = 'tv.plex.agents.series'
}

export enum PlexLibraryScanner {
	Movie = 'Plex Movie',
	TVSeries = 'Plex TV Series'
}

export enum PlexMovieContentRating {
	Restricted = 'R'
}

export enum PlexTVContentRating {
	Mature = 'TV-MA'
}

export type PlexContentRating = PlexMovieContentRating | PlexTVContentRating;

export enum PlexLibrarySectionType {
	Movie = 'movie',
	TVShow = 'show',
}

export interface PlexLibraryMinimalSection {
	hubKey: string; // "/hubs"
	title: string; // "Home"
}

export interface PlexLibrarySection {
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

export enum PlexSymbol {
	Star = 'star',
	Library = 'library',
	Stack = 'stack',
	Playlist = 'playlist'
}

export interface PlexPivot {
	id: string; // "recommended", "library", "collections", "playlists", "categories"
	key: string; // "/hubs/section/1", "/library/sections/1/all?type=1", "/library/sections/1/collections", "/playlists?type=15&sectionID=1&playlistType=video"
	type: PlexLibrarySectionPivotType;
	title: string; // "Recommended", "Library", "Collections"
	context: PlexPivotContext;
	symbol: PlexSymbol;
}

export enum PlexGeneralHubContextType {
	HomeContinue = 'hub.home.continue',
	CustomCollection = 'hub.custom.collection'
}

// context types for plex movie hubs
export enum PlexMovieHubContextType {
	InProgress = 'hub.movie.inprogress',
	RecentlyAdded = 'hub.movie.recentlyadded',
	RecentlyReleased = 'hub.movie.recentlyreleased',
	Genre = 'hub.movie.genre',
	ByActorOrDirector = 'hub.movie.by.actor.or.director',
	TopUnwatched = 'hub.movie.topunwatched',
	RecentlyViewed = 'hub.movie.recentlyviewed',
	RecentPlaylists = 'hub.movie.recentplaylists'
}
export type PlexMovieHubContext = PlexMovieHubContextType;

// context types for plex tv hubs
export enum PlexTVHubContextType {
	TopRated = 'hub.tv.toprated'
}
export type PlexTVHubContext = PlexTVHubContextType;

// context types for "Movies" hub (not sure what makes these different from the "movie" contexts)
export enum PlexMoviesHubContextType {
	Recommended = 'hub.movies.recommended',
	Recent = 'hub.movies.recent',
	WatchList = 'hub.movies.watchlist',
	BingeWorthyShows = 'hub.movies.binge-worthy-shows',
	LightheartedAndFunny = 'hub.movies.lighthearted-and-funny',
	SummerLovin = 'hub.movies.summer-lovin-',
	PlexPicksOfTheWeek = 'hub.movies.plex-picks-of-the-week',
	Trending = 'hub.movies.trending',
	MostWatchlisted = 'hub.movies.mostWatchlisted',
	QuestsSagasAndDragons = 'hub.movies.quests-sagas-and-dragons',
	CrimeTime = 'hub.movies.crimetime'
}
export type PlexMoviesHubContextBecauseYouWatched = `hub.movies.byw.${string}`;
export type PlexMoviesHubContext = PlexMoviesHubContextType | PlexMoviesHubContextBecauseYouWatched;

export type PlexHubContext = PlexGeneralHubContextType | PlexMovieHubContext | PlexTVHubContext | PlexMoviesHubContext;

export enum PlexHubStyle {
	Shelf = 'shelf',
	Hero = 'hero'
}

export enum PlexHubType {
	Movie = 'movie',
	TVShow = 'show',
	Episode = 'episode',
	Album = 'album',
	Clip = 'clip',
	Photos = 'photos',
	Mixed = 'mixed'
}

export enum PlexHubNumericType {
	Movie = 1
}

export interface PlexHub {
	hubKey: string; // "/library/metadata/21406,1859,18071"
	key: string; // "/hubs/sections/1/continueWatching/items"
	title: string; // "Continue Watching"
	type: PlexHubType;
	hubIdentifier: string; // "movie.inprogress.1", "hub.movie.recentlyadded.1"
	context: PlexHubContext | string;
	size?: number;
	more: boolean;
	style: PlexHubStyle;
	random?: boolean;
	promoted?: boolean;
}

export type PlexHubPageParams = {
	count?: number;
	contentDirectoryID?: number;
	pinnedContentDirectoryID?: number;
	includeMeta?: number | boolean;
	excludeFields?: string[]; // "summary"
	includeStations?: number | boolean;
	includeLibraryPlaylists?: number | boolean;
	includeRecentChannels?: number | boolean;
	excludeContinueWatching?: number | boolean;
};

export type PlexHubPage = {
	[XML_ATTRIBUTES_CHAR]: PlexHub;
	Metadata: PlexMetadataPage[]
};

export enum PlexMetadataItemType {
	Movie = 'movie',
	Episode = 'episode',
	Show = 'show'
}

export type PlexMetadataItem = {

	guid: string; // "plex://episode/6rv4x76r8x9bqb98xqt9qbt29r"
	key: string; // "/library/metadata/20205"
	slug?: string; // "spartacus"
	type: PlexMetadataItemType; // 'episode'
	title: string; // "Some Episode Name"
	originalTitle?: string;
	tagline?: string;
	summary?: string;
	thumb?: string; // "/library/metadata/20205/thumb/98535429"
	art?: string; // "/library/metadata/20198/art/179430404"
	contentRating?: PlexContentRating; // "TV-MA"
	index?: number; // 4
	lastViewedAt?: number; // timestamp since 1970
	includedAt?: number; // timestamp since 1970
	year?: number; // 2012
	duration?: number;
	ratingKey?: string; // "20205"
	rating?: number; // [0.0, 10.0f]
	ratingImage?: string; // "rottontomatoes://image.rating.ripe"
	audienceRating?: number; // [0.0, 10.0f]
	audienceRatingImage?: string; // "imdb://image.rating", "rottontomatoes://image.rating.upright"
	imdbRatingCount?: number;
	originallyAvailableAt?: string; // "2012-03-19"
	addedAt?: number; // 17003248740
	updatedAt?: number; // 23476345400

	studio?: string; // "United Artists"
	viewOffset?: number;
	skipCount?: number;
	expiresAt?: number;
	attribution?: string; // "shout-factory"
	publicPagesURL?: string; // "https://watch.plex.tv/show/<TVSHOW-SLUG>/season/1/episode/4"
	availabilityId?: string;
	streamingMediaId?: string;
} & ({} |
	{
		librarySectionTitle: string; // "My TV Shows"
		librarySectionID: number; // 2
		librarySectionKey: string; // "/library/sections/2"
	}
) & ({} |
	({
		parentGuid: string; // "plex://season/5464cnhtcb071t52015c02"
		parentKey: string; // "/library/metadata/20201"
		parentRatingKey: string; // "20205"
		parentTitle: string; // "Season 1"
		parentIndex: number; // 1
		parentThumb: string; // "/library/metadata/20205/thumb/98535429"
	} & ({} |
		{
			grandparentGuid: string; // "plex://show/0374ctv2rv1c123c40cv01t3"
			grandparentKey: string; // "/library/metadata/20198"
			grandparentRatingKey: string; // "20198"
			grandparentSlug: string; // 'pokemon'
			grandparentThumb: string; // "/library/metadata/20205/thumb/98535429"
			grandparentArt: string; // "/library/metadata/20198/art/179430404"
			grandparentTheme?: string; // "/library/metadata/20198/theme/45343402402354"
		}))
);

export interface PlexMetadataPage {
	[XML_ATTRIBUTES_CHAR]: PlexMetadataItem;
	// TODO add other properties
};
