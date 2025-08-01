
export enum PlexPluginIdentifier {
	PlexAppLibrary = 'com.plexapp.plugins.library',
	PlexTVDiscover = 'tv.plex.provider.discover',
	PlexTVMetadata = 'tv.plex.provider.metadata'
}

export type PlexXMLBoolean = '1' | '0' | 1 | 0 | boolean;

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

export enum PlexLanguage {
	EnglishUS = 'en-US'
}

export enum PlexMetadataGuidProtocol {
	Plex = 'plex',
	Local = 'local',
}

export enum PlexMediaItemType {
	Movie = 'movie',
	TVShow = 'show',
	Season = 'season',
	Episode = 'episode',
	Artist = 'artist',
	Album = 'album',
	Track = 'track',
	Clip = 'clip',
	Photos = 'photos',
	Playlist = 'playlist',
	Mixed = 'mixed',
}

export enum PlexMediaItemTypeNumeric {
	Movie = 1,
	Show = 2,
	Season = 3,
	Episode = 4,
	Trailer = 5,
	Comic = 6,
	Person = 7,
	Artist = 8,
	Album = 9,
	Track = 10,
	Picture = 11,
	Clip = 12,
	Photo = 13,
	PhotoAlbum = 14,
	Playlist = 15,
	PlaylistFolder = 16,
	Collection = 18,
	OptimizedVersion = 42,
	UserPlaylistItem = 1001,
}

export const PlexMediaItemTypeToNumeric = {
	[PlexMediaItemType.Movie]: PlexMediaItemTypeNumeric.Movie,
	[PlexMediaItemType.TVShow]: PlexMediaItemTypeNumeric.Show,
	[PlexMediaItemType.Season]: PlexMediaItemTypeNumeric.Season,
	[PlexMediaItemType.Episode]: PlexMediaItemTypeNumeric.Episode,
	[PlexMediaItemType.Artist]: PlexMediaItemTypeNumeric.Artist,
	[PlexMediaItemType.Album]: PlexMediaItemTypeNumeric.Album,
	[PlexMediaItemType.Track]: PlexMediaItemTypeNumeric.Track,
	[PlexMediaItemType.Clip]: PlexMediaItemTypeNumeric.Clip,
	[PlexMediaItemType.Photos]: PlexMediaItemTypeNumeric.PhotoAlbum,
	[PlexMediaItemType.Playlist]: PlexMediaItemTypeNumeric.Playlist,
};

export const PlexMediaItemNumericToType = {
	[PlexMediaItemTypeNumeric.Movie]: PlexMediaItemType.Movie,
	[PlexMediaItemTypeNumeric.Show]: PlexMediaItemType.TVShow,
	[PlexMediaItemTypeNumeric.Season]: PlexMediaItemType.Season,
	[PlexMediaItemTypeNumeric.Episode]: PlexMediaItemType.Episode,
	[PlexMediaItemTypeNumeric.Artist]: PlexMediaItemType.Artist,
	[PlexMediaItemTypeNumeric.Album]: PlexMediaItemType.Album,
	[PlexMediaItemTypeNumeric.Track]: PlexMediaItemType.Track,
	[PlexMediaItemTypeNumeric.Clip]: PlexMediaItemType.Clip,
	[PlexMediaItemTypeNumeric.PhotoAlbum]: PlexMediaItemType.Photos,
	[PlexMediaItemTypeNumeric.Playlist]: PlexMediaItemType.Playlist,
};
