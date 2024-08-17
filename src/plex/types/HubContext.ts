
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
