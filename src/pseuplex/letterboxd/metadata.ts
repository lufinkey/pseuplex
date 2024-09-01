
import * as letterboxd from 'letterboxd-retriever';
import * as plexTypes from '../../plex/types';
import * as plexDiscoverAPI from '../../plexdiscover';
import { PlexMediaItemMatchParams } from '../matching';
import { PseuplexMetadataProvider, PseuplexMetadataProviderParams } from '../metadata';
import { PseuplexMetadataItem, PseuplexMetadataPage } from '../types';
import * as lbTransform from './transform';
import * as lbMetadata from './metadata';

export const getLetterboxdPlexMediaItemMatchParams = (filmInfo: letterboxd.FilmInfo): PlexMediaItemMatchParams | null => {
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
	return {
		title: filmInfo.pageData.name,
		year: filmInfo.pageData.year,
		types: [plexDiscoverAPI.SearchType.Movies, plexDiscoverAPI.SearchType.TV],
		guids: guids
	};
};


export type LetterboxdMetadataItem = letterboxd.FilmInfo;


export class LetterboxdMetadataProvider extends PseuplexMetadataProvider<LetterboxdMetadataItem> {

	override async fetchRawMetadata(slug: string): Promise<LetterboxdMetadataItem> {
		console.log(`Fetching letterboxd film info for film ${slug}`);
		const filmInfo = await letterboxd.getFilmInfo({slug});
		//fixStringLeaks(filmInfo);
		return filmInfo;
	}

	override transformRawMetadata(metadataItem: LetterboxdMetadataItem): PseuplexMetadataItem {
		return lbTransform.filmInfoToPlexMetadata(metadataItem, {
			letterboxdMetadataBasePath: this.basePath
		});
	}

	override getRawMetadataMatchParams(metadataItem: LetterboxdMetadataItem): PlexMediaItemMatchParams {
		return lbMetadata.getLetterboxdPlexMediaItemMatchParams(metadataItem);
	}
}

