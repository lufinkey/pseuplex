
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

// context types for plex movies
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

// context types for "Movies and Shows on Plex" hub
export enum PlexMoviesAndShowsContextType {
	Recommended = 'hub.movies.recommended',
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
export type PlexMoviesAndShowsContextBecauseYouWatched = `hub.movies.byw.${string}`;
export type PlexMoviesAndShowsContext = PlexMoviesAndShowsContextType | PlexMoviesAndShowsContextBecauseYouWatched;

export type PlexHubContext = PlexMovieHubContext | PlexMoviesAndShowsContext;

export enum PlexHubStyle {
	Shelf = 'shelf'
}

export enum PlexHubType {
	Movie = 'movie',
	TVShow = 'show',
	Mixed = 'mixed'
}

export interface PlexHub {
	hubKey: string; // "/library/metadata/21406,1859,18071"
	key: string; // "/hubs/sections/1/continueWatching/items"
	title: string; // "Continue Watching"
	type: PlexHubType;
	hubIdentifier: string; // "movie.inprogress.1", "hub.movie.recentlyadded.1"
	context: PlexHubContext;
	size: number;
	more: boolean;
	style: PlexHubStyle;
}

export enum PlexMediaItemType {
	Movie = 'movie',
	Episode = 'episode'
}

export type PlexMediaItem = {

	guid: string; // "plex://episode/6rv4x76r8x9bqb98xqt9qbt29r"
	key: string; // "/library/metadata/20205"
	ratingKey: string; // "20205"
	type: PlexMediaItemType; // 'episode'
	title: string; // "Some Episode Name"
	thumb: string; // "/library/metadata/20205/thumb/98535429"
	art: string; // "/library/metadata/20198/art/179430404"
	contentRating: PlexContentRating; // "TV-MA"
	index: number; // 4
	lastViewedAt?: number; // timestamp since 1970
	includedAt?: number; // timestamp since 1970
	year: number; // 2012
	duration: number;
	rating?: number; // [0.0, 10.0f]
	audienceRating?: number; // [0.0, 10.0f]
	audienceRatingImage?: string; // "imdb://image.rating", "rottontomatoes://image.rating.upright"
	originallyAvailableAt: string; // "2012-03-19"
	addedAt: number; // 17003248740
	updatedAt: number; // 23476345400

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
