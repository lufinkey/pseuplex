
import aguid from 'aguid';
import * as letterboxd from "letterboxd-retriever";
import {
	PlexMediaItemType,
	PlexMetadataPage } from "../../plex/types";
import {
	intParam,
	combinePathSegments
} from '../../utils';

export interface LetterboxdToPlexOptions {
	letterboxdMetadataBasePath: string
}

export const filmInfoToPlexMetadata = (filmInfo: letterboxd.FilmInfo, options: LetterboxdToPlexOptions): PlexMetadataPage => {
	const releasedEvent = filmInfo.ldJson.releasedEvent;
	return {
		//guid: `plex://letterboxd/film/${aguid(`l${filmInfo.pageData.slug}`)}`,
		key: combinePathSegments(options.letterboxdMetadataBasePath, filmInfo.pageData.slug),
		type: PlexMediaItemType.Movie,
		title: filmInfo.ldJson.name,
		thumb: filmInfo.ldJson.image,
		tagline: filmInfo.pageData.tagline,
		summary: filmInfo.pageData.description,
		year: intParam(releasedEvent?.[0]?.startDate)
	} as any;
};

export const activityFeedFilmToPlexMetadata = (film: letterboxd.ActivityFeedFilm, options: LetterboxdToPlexOptions): PlexMetadataPage => {
	return {
		//guid: `plex://letterboxd/film/${aguid(`l${film.slug}`)}`,
		key: combinePathSegments(options.letterboxdMetadataBasePath, film.slug),
		type: PlexMediaItemType.Movie,
		title: film.name,
		thumb: film.imageURL,
		year: intParam(film.year)
	} as any;
};
