
import aguid from 'aguid';
import * as letterboxd from 'letterboxd-retriever';
import {
	PlexMediaItemType,
	PlexMetadataItem,
	PlexReview
} from '../../plex/types';
import {
	intParam,
	combinePathSegments
} from '../../utils';

export interface LetterboxdToPlexOptions {
	letterboxdMetadataBasePath: string
}

export const filmInfoToPlexMetadata = (filmInfo: letterboxd.FilmInfo, options: LetterboxdToPlexOptions): PlexMetadataItem => {
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
	};
};

export const activityFeedFilmToPlexMetadata = (film: letterboxd.Film, options: LetterboxdToPlexOptions): PlexMetadataItem => {
	return {
		//guid: `plex://letterboxd/film/${aguid(`l${film.slug}`)}`,
		key: combinePathSegments(options.letterboxdMetadataBasePath, film.slug),
		type: PlexMediaItemType.Movie,
		title: film.name,
		thumb: film.imageURL,
		year: intParam(film.year)
	};
};

export const viewingToPlexReview = (viewing: letterboxd.Viewing): PlexReview => {
	return {
		source: "Letterboxd",
		tag: viewing.user.displayName,
		image: viewing.user.imageURL,
		link: letterboxd.BASE_URL + viewing.href,
		text: viewing.text
	};
};
