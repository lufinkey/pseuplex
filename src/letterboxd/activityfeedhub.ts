
import {
	XML_ATTRIBUTES_CHAR
} from '../constants';
import * as letterboxd from 'letterboxd-retriever';
import {
	PlexHubContext,
	PlexHubPageParams,
	PlexHubPage,
	PlexHubStyle,
	PlexHubType } from '../plex/types';
import {
	PseuplexHub } from '../pseuplex/hub';
import * as lbtransform from './transform';

type ActivityFeedProvider = (params: PlexHubPageParams) => Promise<letterboxd.ActivityFeedPage>;

export type ActivityFeedHubOptions = {
	hubPath: string;
	context: PlexHubContext | string;
	title: string;
	style: PlexHubStyle;
	promoted?: boolean;
} & lbtransform.LetterboxdToPlexOptions;

const letterboxdActivityFeedHub = (hubOptions: ActivityFeedHubOptions, provider: ActivityFeedProvider): PseuplexHub => {
	return async (params: PlexHubPageParams) => {
		const feedPage = await provider(params);
		const uniqueMovies: letterboxd.ActivityFeedFilm[] = [];
		const uniqueMovieSlugsSet = new Set<string>();
		for(const item of feedPage.items) {
			if(item.film) {
				if(uniqueMovieSlugsSet.has(item.film.slug)) {
					// TODO attach some kind of context info to the item
				} else {
					uniqueMovieSlugsSet.add(item.film.slug);
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
};

export const letterboxdUserFollowingActivityFeedHub = (username: string, hubOptions: ActivityFeedHubOptions): PseuplexHub => {
	return letterboxdActivityFeedHub(hubOptions, async (params) => {
		let page: letterboxd.ActivityFeedPage;
		let after: string | undefined = undefined;
		do {
			const newPage = await letterboxd.getUserFollowingFeed(username, {
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
		return page;
	});
};
