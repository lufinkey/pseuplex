
import aguid from 'aguid';
import * as letterboxd from "letterboxd-retriever";
import {
	PlexMetadataItemType,
	PlexMetadataPage } from "../plex/types";
import { XML_ATTRIBUTES_CHAR } from "../constants";

export interface LetterboxdToPlexOptions {
	letterboxdMetadataBasePath: string
}

export const filmInfoToPlexMetadata = (filmInfo: letterboxd.FilmInfo, options: LetterboxdToPlexOptions): PlexMetadataPage => {
	const releasedEvent = filmInfo.ldJson.releasedEvent;
	const filmYear = releasedEvent ? releasedEvent[0]?.startDate : undefined;
	return {
		[XML_ATTRIBUTES_CHAR]: {
			guid: aguid(`l${filmInfo.pageData.slug}`),
			key: `${options.letterboxdMetadataBasePath}/${filmInfo.pageData.slug}`,
			type: PlexMetadataItemType.Movie,
			title: filmInfo.ldJson.name,
			tagline: filmInfo.pageData.tagline,
			summary: filmInfo.pageData.description,
			year: (!Number.isNaN(filmYear) ? Number.parseInt(filmYear) : undefined)
		}
	};
};

export const activityFeedFilmToPlexMetadata = (film: letterboxd.ActivityFeedFilm, options: LetterboxdToPlexOptions): PlexMetadataPage => {
	return {
		[XML_ATTRIBUTES_CHAR]: {
			guid: aguid(`l${film.slug}`),
			key: `${options.letterboxdMetadataBasePath}/${film.slug}`,
			type: PlexMetadataItemType.Movie,
			title: film.name,
			year: (!Number.isNaN(film.year) ? Number.parseInt(film.year) : undefined)
		}
	};
};
