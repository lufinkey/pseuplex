
export enum PlexSymbol {
	Star = 'star',
	Library = 'library',
	Stack = 'stack',
	Playlist = 'playlist'
}

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

export enum PlexMediaItemType {
	Movie = 'movie',
	TVShow = 'show',
	Episode = 'episode',
	Album = 'album',
	Clip = 'clip',
	Photos = 'photos',
	Mixed = 'mixed'
}

export enum PlexMediaItemTypeNumeric {
	Movie = 1
}
