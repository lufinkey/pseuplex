
import aguid from 'aguid';
import * as letterboxd from 'letterboxd-retriever';
import * as plexTypes from '../../plex/types';
import {
	PseuplexMetadataSource,
	PseuplexMetadataIDParts,
	stringifyMetadataID
} from '../metadataidentifier';
import {
	intParam,
	combinePathSegments
} from '../../utils';
import {
	PseuplexMetadataItem
} from '../types';

export type LetterboxdToPlexOptions = {
	letterboxdMetadataBasePath: string
};

export const filmInfoToPlexMetadata = (filmInfo: letterboxd.FilmInfo, options: LetterboxdToPlexOptions): PseuplexMetadataItem => {
	const releasedEvent = filmInfo.ldJson.releasedEvent;
	return {
		guid: stringifyMetadataID({
			isURL: true,
			source: PseuplexMetadataSource.Letterboxd,
			directory: filmInfo.pageData.type ?? 'film',
			id: filmInfo.pageData.slug
		}),
		key: combinePathSegments(options.letterboxdMetadataBasePath, filmInfo.pageData.slug),
		ratingKey: stringifyMetadataID({
			isURL: false,
			source: PseuplexMetadataSource.Letterboxd,
			directory: filmInfo.pageData.type ?? 'film',
			id: filmInfo.pageData.slug
		}),
		type: plexTypes.PlexMediaItemType.Movie,
		title: filmInfo.ldJson.name,
		art: filmInfo.pageData.backdrop.default,
		thumb: filmInfo.ldJson.image,
		tagline: filmInfo.pageData.tagline,
		summary: filmInfo.pageData.description,
		year: intParam(releasedEvent?.[0]?.startDate),
		Pseuplex: {
			isOnServer: false
		},
		Guid: filmInfoGuids(filmInfo).map((guid) => {
			return {id:guid};
		}),
		Director: filmInfo.ldJson?.director?.map((directorInfo): plexTypes.PlexPerson => {
			return {
				tag: directorInfo.name,
				role: "Director"
			} as plexTypes.PlexPerson;
		}) ?? undefined,
		Role: filmInfo.pageData?.cast?.map((actorInfo): plexTypes.PlexPerson => {
			return {
				tag: actorInfo.name,
				role: actorInfo.role
			} as plexTypes.PlexPerson;
		}) ?? undefined,
		Writer: filmInfo.pageData?.crew
			?.filter((crewMember) => (crewMember.role == letterboxd.CrewRoleType.Writer))
			.map((crewMember): plexTypes.PlexPerson => {
				return {
					tag: crewMember.name,
					role: crewMember.role
				} as plexTypes.PlexPerson;
			}) ?? undefined,
		Review: filmInfo.pageData.popularReviews?.map((viewing) => {
			return viewingToPlexReview(viewing);
		})
	};
};

export const filmInfoGuids = (filmInfo: letterboxd.FilmInfo) => {
	let guids: `${string}://${string}`[] = [];
	const tmdbInfo = filmInfo.pageData.tmdb;
	if(tmdbInfo && tmdbInfo.id) {
		guids.push(`tmdb://${tmdbInfo.id}`);
	}
	const imdbInfo = filmInfo.pageData.imdb;
	if(imdbInfo && imdbInfo.id) {
		guids.push(`imdb://${imdbInfo.id}`);
	}
	return guids;
};

export const activityFeedFilmToPlexMetadata = (film: letterboxd.Film, options: LetterboxdToPlexOptions): plexTypes.PlexMetadataItem => {
	return {
		guid: `letterboxd://film/${film.slug}`,
		key: combinePathSegments(options.letterboxdMetadataBasePath, film.slug),
		ratingKey: `letterboxd:film:${film.slug}`,
		type: plexTypes.PlexMediaItemType.Movie,
		title: film.name,
		thumb: film.imageURL,
		year: intParam(film.year)
	};
};

export const viewingToPlexReview = (viewing: letterboxd.Viewing): plexTypes.PlexReview => {
	return {
		source: "Letterboxd",
		tag: viewing.user.displayName,
		//image: viewing.user.imageURL,
		link: letterboxd.BASE_URL + viewing.href,
		text: viewing.text
	};
};
