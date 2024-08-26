
import letterboxd from 'letterboxd-retriever';
import * as plexTypes from '../../plex/types';
import * as plexDiscoverAPI from '../../plexdiscover';
import { findMatchingPlexMovieOrShow } from '../matching';

export const findPlexMetadataFromLetterboxdFilm = async (filmInfo: letterboxd.FilmInfo): Promise<plexTypes.PlexMetadataItem | null> => {
	let types: plexDiscoverAPI.SearchType[];
	let guids: `${string}://${string}`[] = [];
	const tmdbInfo = filmInfo.pageData.tmdb;
	if(tmdbInfo && tmdbInfo.id) {
		guids.push(`tmdb://${tmdbInfo.id}`);
		if(tmdbInfo.type == 'movie') {
			types = [plexDiscoverAPI.SearchType.Movies];
		} else if(tmdbInfo.type == 'tv') {
			types = [plexDiscoverAPI.SearchType.TV];
		}
	}
	const imdbInfo = filmInfo.pageData.imdb;
	if(imdbInfo && imdbInfo.id) {
		guids.push(`imdb://${imdbInfo.id}`);
	}
	if(guids.length == 0) {
		return null;
	}
	if(!types) {
		types = [plexDiscoverAPI.SearchType.Movies,plexDiscoverAPI.SearchType.TV];
	}
	return await findMatchingPlexMovieOrShow({
		title: filmInfo.pageData.name,
		year: filmInfo.pageData.year,
		types: [plexDiscoverAPI.SearchType.Movies, plexDiscoverAPI.SearchType.TV],
		guids: guids
	});
};
