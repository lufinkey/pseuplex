
import aguid from 'aguid';
import * as letterboxd from "letterboxd-retriever";
import {
	PlexMediaItemType,
	PlexMetadataPage } from "../../plex/types";

export interface LetterboxdToPlexOptions {
	letterboxdMetadataBasePath: string
}

const integerOrUndefined = (value: any): number | undefined => {
	if(typeof value !== 'number') {
		if(value == null) {
			return undefined;
		}
		value = Number.parseInt(value);
	}
	if(Number.isNaN(value)) {
		return undefined;
	}
	return value;
};

export const filmInfoToPlexMetadata = (filmInfo: letterboxd.FilmInfo, options: LetterboxdToPlexOptions): PlexMetadataPage => {
	const releasedEvent = filmInfo.ldJson.releasedEvent;
	return {
		guid: aguid(`l${filmInfo.pageData.slug}`),
		key: `${options.letterboxdMetadataBasePath}/${filmInfo.pageData.slug}`,
		type: PlexMediaItemType.Movie,
		title: filmInfo.ldJson.name,
		thumb: filmInfo.ldJson.image,
		tagline: filmInfo.pageData.tagline,
		summary: filmInfo.pageData.description,
		year: integerOrUndefined(releasedEvent?.[0]?.startDate)
	};
};

export const activityFeedFilmToPlexMetadata = (film: letterboxd.ActivityFeedFilm, options: LetterboxdToPlexOptions): PlexMetadataPage => {
	return {
		guid: aguid(`l${film.slug}`),
		key: `${options.letterboxdMetadataBasePath}/${film.slug}`,
		type: PlexMediaItemType.Movie,
		title: film.name,
		thumb: film.imageURL,
		year: integerOrUndefined(film.year)
	};
};

export const uniqueActivityFeedFilms = (items: letterboxd.ActivityFeedEntry[], uniqueFilmSlugsMap: {[key: string]: letterboxd.ActivityFeedFilm} = {}): letterboxd.ActivityFeedFilm[] => {
	const uniqueFilms: letterboxd.ActivityFeedFilm[] = [];
	for(const item of items) {
		if(item.film) {
			const existingFilm = uniqueFilmSlugsMap[item.film.slug];
			if(existingFilm) {
				if(!existingFilm.imageURL && item.film.imageURL) {
					existingFilm.imageURL = item.film.imageURL;
				}
				// TODO attach some kind of context info to the item
			} else {
				uniqueFilmSlugsMap[item.film.slug] = item.film;
				uniqueFilms.push(item.film);
				// TODO attach some kind of context info to the item
			}
		}
	}
	return uniqueFilms;
};
