
import * as letterboxd from 'letterboxd-retriever';
import {
	PseuplexHub,
	PseuplexHubItemsPage,
	PseuplexHubPage
} from '../hub';
import {
	PlexHub,
	PlexHubContext,
	PlexHubPageParams,
	PlexHubPage,
	PlexHubStyle,
	PlexMediaItemType,
	PlexMetadataItem
} from '../../plex/types';
import {
	addQueryArgumentToURLPath,
	fixStringLeaks
} from '../../utils';
import {
	LoadableList,
	LoadableListChunk
} from '../../fetching/LoadableList';
import * as lbtransform from './transform';
import * as pseuLetterboxdCache from './cache';

export type LetterboxdUserFeedHubOptions = {
	letterboxdUsername: string;
	hubPath: string;
	context: PlexHubContext | string;
	style: PlexHubStyle;
	promoted?: boolean;
	defaultItemCount: number;
	uniqueItemsOnly: boolean;
	verbose: boolean;
} & lbtransform.LetterboxdToPlexOptions;

type PageToken = {
	csrf: string;
	token: string;
};

export type LetterboxdFeedHubParams = PlexHubPageParams & {
	listStartToken: string | number | null | undefined;
};

export class LetterboxdUserFollowingActivityFeedHub extends PseuplexHub<LetterboxdFeedHubParams> {
	_options: LetterboxdUserFeedHubOptions;
	_itemList: LoadableList<letterboxd.ActivityFeedFilm,number,PageToken>;
	
	constructor(options: LetterboxdUserFeedHubOptions) {
		super();
		this._options = options;
		this._itemList = new LoadableList<letterboxd.ActivityFeedFilm,number,PageToken>({
			loader: async (pageToken: PageToken | null) => {
				if(this._options.verbose) {
					console.log(`Fetching letterboxd following feed for user ${this._options.letterboxdUsername} (pageToken=${JSON.stringify(pageToken)})`);
				}
				const page = await letterboxd.getUserFollowingFeed(this._options.letterboxdUsername, {
					after: pageToken?.token ?? undefined,
					csrf: pageToken?.csrf ?? undefined
				});
				//fixStringLeaks(page);
				return {
					items: page.items.filter((item) => (item.film != null)).map((item) => {
						const token = Number.parseInt(item.id);
						return {
							id: item.film.slug,
							token: !Number.isNaN(token) ? token : item.id as any as number,
							item: item.film
						};
					}),
					nextPageToken: (page.items.length > 0 && !page.end) ? {
						csrf: page.csrf,
						token: page.items[page.items.length-1].id
					} : null
				};
			},
			tokenComparer: (itemToken1, itemToken2) => {
				return itemToken2 - itemToken1;
			}
		});
	}

	override get metadataBasePath() {
		return this._options.letterboxdMetadataBasePath;
	}

	override async get(params: LetterboxdFeedHubParams): Promise<PseuplexHubPage> {
		const opts = this._options;
		let chunk: LoadableListChunk<letterboxd.ActivityFeedFilm,number>;
		let start: number;
		let { listStartToken } = params;
		if(params.listStartToken != null) {
			listStartToken = Number.parseInt(params.listStartToken as any);
			listStartToken = !Number.isNaN(listStartToken) ? listStartToken : params.listStartToken;
			start = params.start ?? 0;
			chunk = await this._itemList.getOrFetchItems(listStartToken as any, start, params.count ?? opts.defaultItemCount, {unique:opts.uniqueItemsOnly});
		} else {
			start = params.count ?? opts.defaultItemCount;
			chunk = await this._itemList.getOrFetchStartItems(start, {unique:opts.uniqueItemsOnly});
			listStartToken = chunk.items[0].token;
		}
		const lbTransformFilmOpts: lbtransform.LetterboxdToPlexOptions = {
			letterboxdMetadataBasePath: opts.letterboxdMetadataBasePath
		};
		let hubKey = opts.hubPath;
		if(listStartToken) {
			hubKey = addQueryArgumentToURLPath(opts.hubPath, `listStartToken=${listStartToken}`);
		}
		return {
			hub: {
				key: hubKey,
				title: `${opts.letterboxdUsername}'s Letterboxd Following Feed`,
				type: PlexMediaItemType.Movie,
				hubIdentifier: opts.context + ((params.contentDirectoryID != null && !(params.contentDirectoryID instanceof Array)) ? `.${params.contentDirectoryID}` : ''),
				context: opts.context,
				style: opts.style,
				promoted: opts.promoted
			},
			itemsPage: {
				items: await Promise.all(chunk.items.map(async (itemNode) => {
					try {
						const filmInfo = await pseuLetterboxdCache.metadataCache.fetch(itemNode.item.slug);
						return lbtransform.filmInfoToPlexMetadata(filmInfo, lbTransformFilmOpts);
					} catch(error) {
						console.error(error);
					}
					return lbtransform.activityFeedFilmToPlexMetadata(itemNode.item, lbTransformFilmOpts);
				})),
				offset: start,
				more: chunk.hasMore,
				totalCount: opts.uniqueItemsOnly ? this._itemList.totalUniqueItemCount : this._itemList.totalItemCount
			}
		};
	}
}
