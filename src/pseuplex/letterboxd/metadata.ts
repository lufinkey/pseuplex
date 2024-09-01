
import * as letterboxd from 'letterboxd-retriever';
import * as plexTypes from '../../plex/types';
import * as plexDiscoverAPI from '../../plexdiscover';
import { PlexMediaItemMatchParams } from '../matching';
import { PseuplexMetadataProvider } from '../metadata';
import { PseuplexMetadataItem } from '../types';
import * as lbTransform from './transform';
import * as lbMetadata from './metadata';

export const getLetterboxdPlexMediaItemMatchParams = (filmInfo: letterboxd.FilmInfo): PlexMediaItemMatchParams | null => {
	let types: plexDiscoverAPI.SearchType[];
	const tmdbInfo = filmInfo.pageData.tmdb;
	if(tmdbInfo && tmdbInfo.type) {
		if(tmdbInfo.type == 'movie') {
			types = [plexDiscoverAPI.SearchType.Movies];
		} else if(tmdbInfo.type == 'tv') {
			types = [plexDiscoverAPI.SearchType.TV];
		}
	}
	const guids = lbTransform.filmInfoGuids(filmInfo);
	if(guids.length == 0) {
		return null;
	}
	if(!types) {
		types = [plexDiscoverAPI.SearchType.Movies,plexDiscoverAPI.SearchType.TV];
	}
	return {
		title: filmInfo.pageData.name,
		year: filmInfo.pageData.year,
		types: types,
		guids: guids
	};
};


export type LetterboxdMetadataItem = letterboxd.FilmInfo;


export class LetterboxdMetadataProvider extends PseuplexMetadataProvider<LetterboxdMetadataItem> {

	override async fetchMetadataItem(slug: string): Promise<LetterboxdMetadataItem> {
		console.log(`Fetching letterboxd film info for film ${slug}`);
		const filmInfo = await letterboxd.getFilmInfo({slug});
		//fixStringLeaks(filmInfo);
		return filmInfo;
	}

	override transformMetadataItem(metadataItem: LetterboxdMetadataItem): PseuplexMetadataItem {
		return lbTransform.filmInfoToPlexMetadata(metadataItem, {
			letterboxdMetadataBasePath: this.basePath
		});
	}

	override idFromMetadataItem(metadataItem: letterboxd.FilmInfo): string {
		return metadataItem.pageData.slug;
	}

	override getPlexMatchParams(metadataItem: LetterboxdMetadataItem): PlexMediaItemMatchParams {
		return lbMetadata.getLetterboxdPlexMediaItemMatchParams(metadataItem);
	}

	override async findMatchForPlexItem(metadataItem: plexTypes.PlexMetadataItem): Promise<letterboxd.FilmInfo | null> {
		const plexGuid = metadataItem.guid;
		if(plexGuid) {
			// try to get the item from the slug
			const slug = await this.plexGuidToIDCache.get(plexGuid);
			if(slug) {
				return await letterboxd.getFilmInfo({slug});
			} else if(slug === null) {
				return null;
			}
		}
		// match against guids
		if(!metadataItem.Guid || metadataItem.Guid.length == 0) {
			return null;
		}
		// match against tmdb ID
		const tmdbGuid = metadataItem.Guid.find((guid) => guid.id.startsWith('tmdb://'));
		if(tmdbGuid) {
			const tmdbId = tmdbGuid.id.substring(7);
			const filmInfoTask = letterboxd.getFilmInfo({tmdbId})
				.catch((error) => {
					if(error.statusCode) {
						return null;
					}
					throw error;
				});
			if(plexGuid) {
				this.plexGuidToIDCache.setSync(plexGuid, filmInfoTask.then((filmInfo) => {
					return this.idFromMetadataItem(filmInfo);
				}));
			}
			return await filmInfoTask;
		}
		// match against imdb ID
		const imdbGuid = metadataItem.Guid.find((guid) => guid.id.startsWith('imdb://'));
		if(imdbGuid) {
			const imdbId = imdbGuid.id.substring(7);
			const filmInfoTask = letterboxd.getFilmInfo({imdbId})
				.catch((error) => {
					if(error.statusCode) {
						return null;
					}
					throw error;
				});
			if(plexGuid) {
				this.plexGuidToIDCache.setSync(plexGuid, filmInfoTask.then((filmInfo) => {
					return this.idFromMetadataItem(filmInfo);
				}));
			}
			return await filmInfoTask;
		}
		// no matches
		return null;
	}
}


export const attachLetterboxdReviewsToPlexMetadata = async (metadataItem: plexTypes.PlexMetadataItem, options: {
	letterboxdMetadataProvider: LetterboxdMetadataProvider,
	letterboxdUsername: string
}): Promise<plexTypes.PlexMetadataItem> => {
	try {
		if(metadataItem.Guid) {
			let tmdbId: string = metadataItem.Guid.find((g) => g.id.startsWith('tmdb://'))?.id;
			if(tmdbId) {
				tmdbId = tmdbId.substring(7);
				const letterboxdSlug = await options.letterboxdMetadataProvider.getIDForPlexItem(metadataItem);
				if(letterboxdSlug) {
					const friendViewings = await letterboxd.getFriendsReviews({
						username: options.letterboxdUsername,
						filmSlug: letterboxdSlug
					});
					const reviews = friendViewings.items.map((viewing) => {
						return lbTransform.viewingToPlexReview(viewing);
					});
					if(metadataItem.Review) {
						metadataItem.Review = reviews.concat(metadataItem.Review);
					} else {
						metadataItem.Review = reviews;
					}
				}
			}
		}
	} catch(error) {
		console.error(error);
	}
	return metadataItem;
};
