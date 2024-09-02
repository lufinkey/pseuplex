
export enum PlexGeneralHubIdentifierType {
	HomeContinue = 'home.continue',
	Custom = 'custom',
	CustomCollection = 'custom.collection'
}

// context types for plex movie hubs
export enum PlexMovieHubIdentifierType {
	Similar = 'movie.similar',
	InProgress = 'movie.inprogress',
	RecentlyAdded = 'movie.recentlyadded',
	RecentlyReleased = 'movie.recentlyreleased',
	Genre = 'movie.genre',
	ByActorOrDirector = 'movie.by.actor.or.director',
	TopUnwatched = 'movie.topunwatched',
	RecentlyViewed = 'movie.recentlyviewed',
	RecentPlaylists = 'movie.recentplaylists'
}

// context types for plex tv hubs
export enum PlexTVHubIdentifierType {
	TopRated = 'tv.toprated'
}

// context types for "Movies" hub (not sure what makes these different from the "movie" contexts)
export enum PlexMoviesHubIdentifierType {
	Similar = 'movies.similar',
	Recommended = 'movies.recommended',
	Recent = 'movies.recent',
	WatchList = 'movies.watchlist',
	BingeWorthyShows = 'movies.binge-worthy-shows',
	LightheartedAndFunny = 'movies.lighthearted-and-funny',
	SummerLovin = 'movies.summer-lovin-',
	PlexPicksOfTheWeek = 'movies.plex-picks-of-the-week',
	Trending = 'movies.trending',
	MostWatchlisted = 'movies.mostWatchlisted',
	QuestsSagasAndDragons = 'movies.quests-sagas-and-dragons',
	CrimeTime = 'movies.crimetime'
}
export type PlexMoviesHubIdentifierTypeBecauseYouWatched = `hub.movies.byw.${string}`;

export type PlexHubIdentifierType =
	PlexGeneralHubIdentifierType
	| PlexMovieHubIdentifierType
	| PlexTVHubIdentifierType
	| PlexMoviesHubIdentifierType
	| PlexMoviesHubIdentifierTypeBecauseYouWatched;

export type PlexHubIdentifier = PlexHubIdentifierType | `${PlexHubIdentifierType}.${string}`;
export type PlexHubContext = `hub.${PlexHubIdentifierType | string}`;
