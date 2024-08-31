
import * as letterboxd from 'letterboxd-retriever';
import {
	LoadableList,
	LoadableListChunk
} from '../../fetching/LoadableList';
import {
	PseuplexHub,
	PseuplexHubPage,
	PseuplexHubPageParams
} from '../hub';
import {
	PlexHubContext,
	PlexHubStyle,
	PlexMediaItemType
} from '../../plex/types';
import {
	addQueryArgumentToURLPath,
	fixStringLeaks
} from '../../utils';
import * as lbtransform from './transform';

export type LetterboxdActivityFeedHubOptions = {
	title: string;
	hubPath: string;
	context: PlexHubContext | string;
	style: PlexHubStyle;
	promoted?: boolean;
	defaultItemCount: number;
	uniqueItemsOnly: boolean;
	fetchPage: (pageToken: PageToken | null) => Promise<letterboxd.ActivityFeedPage>;
} & lbtransform.LetterboxdToPlexOptions;

type PageToken = {
	csrf: string;
	token: string;
};

export class LetterboxdActivityFeedHub extends PseuplexHub {
	_options: LetterboxdActivityFeedHubOptions;
	_itemList: LoadableList<letterboxd.Film,number,PageToken>;
	
	constructor(options: LetterboxdActivityFeedHubOptions) {
		super();
		this._options = options;
		this._itemList = new LoadableList<letterboxd.Film,number,PageToken>({
			loader: async (pageToken: PageToken | null) => {
				const page = await this._options.fetchPage(pageToken);
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

	override async get(params: PseuplexHubPageParams): Promise<PseuplexHubPage> {
		const opts = this._options;
		let chunk: LoadableListChunk<letterboxd.Film,number>;
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
				title: opts.title,
				type: PlexMediaItemType.Movie,
				hubIdentifier: opts.context + ((params.contentDirectoryID != null && !(params.contentDirectoryID instanceof Array)) ? `.${params.contentDirectoryID}` : ''),
				context: opts.context,
				style: opts.style,
				promoted: opts.promoted
			},
			items: await Promise.all(chunk.items.map(async (itemNode) => {
				return lbtransform.activityFeedFilmToPlexMetadata(itemNode.item, lbTransformFilmOpts);
			})),
			offset: start,
			more: chunk.hasMore,
			totalCount: opts.uniqueItemsOnly ? this._itemList.totalUniqueItemCount : this._itemList.totalItemCount
		};
	}
}
