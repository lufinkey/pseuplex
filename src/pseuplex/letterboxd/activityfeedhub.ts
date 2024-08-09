
import * as letterboxd from 'letterboxd-retriever';
import {
	XML_ATTRIBUTES_CHAR } from '../../constants';
import {
	PlexHubContext,
	PlexHubPageParams,
	PlexHubPage,
	PlexHubStyle,
	PlexHubType } from '../../plex/types';
import * as lbtransform from './transform';

type ActivityFeedHubOptions = {
	hubPath: string;
	context: PlexHubContext | string;
	title: string;
	style: PlexHubStyle;
	promoted?: boolean;
} & lbtransform.LetterboxdToPlexOptions;

const letterboxdActivityFeedHub = async (params: PlexHubPageParams, hubOptions: ActivityFeedHubOptions, feedPage: letterboxd.ActivityFeedPage): Promise<PlexHubPage> => {
	const uniqueMovies: letterboxd.ActivityFeedFilm[] = [];
	const uniqueMovieSlugsMap: {[key: string]: letterboxd.ActivityFeedFilm} = {};
	for(const item of feedPage.items) {
		if(item.film) {
			const existingFilm = uniqueMovieSlugsMap[item.film.slug];
			if(existingFilm) {
				if(!existingFilm.imageURL && item.film.imageURL) {
					existingFilm.imageURL = item.film.imageURL;
				}
				// TODO attach some kind of context info to the item
			} else {
				uniqueMovieSlugsMap[item.film.slug] = item.film;
				uniqueMovies.push(item.film);
				// TODO attach some kind of context info to the item
			}
		}
	}
	const metadataPage: PlexHubPage = {
		[XML_ATTRIBUTES_CHAR]: {
			hubKey: `${hubOptions.letterboxdMetadataBasePath}/${uniqueMovies.map((item) => item.slug).join(',')}`,
			key: hubOptions.hubPath,
			title: hubOptions.title,
			type: PlexHubType.Movie,
			hubIdentifier: hubOptions.context + (params.contentDirectoryID != null ? `.${params.contentDirectoryID}` : ''),
			context: hubOptions.context,
			more: !feedPage.end,
			style: hubOptions.style,
			promoted: hubOptions.promoted
		},
		Metadata: uniqueMovies.map((film) => {
			return lbtransform.activityFeedFilmToPlexMetadata(film, {
				letterboxdMetadataBasePath: hubOptions.letterboxdMetadataBasePath
			});
		})
	};
	return metadataPage;
};

export type LetterboxdUserFeedHubParams = PlexHubPageParams & {
	username: string;
};

export const letterboxdUserFollowingActivityFeedHub = async (params: LetterboxdUserFeedHubParams, hubOptions: ActivityFeedHubOptions): Promise<PlexHubPage> => {
	// fetch letterboxd user following feed
	let page: letterboxd.ActivityFeedPage;
	let after: string | undefined = undefined;
	do {
		const newPage = await letterboxd.getUserFollowingFeed(params.username, {
			after: after,
			csrf: page?.csrf
		});
		if(!page) {
			page = newPage;
			if(page.items.length == 0) {
				break;
			}
		} else {
			page.items = page.items.concat(newPage.items);
			page.csrf = newPage.csrf;
			page.end = newPage.end;
		}
		after = page.items[page.items.length - 1].id;
	} while(params.count && page.items.length < params.count && !page.end);
	// create letterboxd hub
	return letterboxdActivityFeedHub(params, hubOptions, page);
};
