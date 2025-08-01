import letterboxd from 'letterboxd-retriever';
import {
	PseuplexFeedHub,
	PseuplexFeedHubChunk,
	PseuplexFeedHubOptions,
	PseuplexHubPage,
	PseuplexHubPageParams,
	PseuplexMetadataTransformOptions,
	PseuplexRequestContext
} from '../../pseuplex';
import * as plexTypes from '../../plex/types';
import * as lbtransform from './transform';
import { LetterboxdMetadataProvider } from './metadata';

export enum LetterboxdListItemTokenSource {
	ID = 'id',
	FilmID = 'film.id',
}

export type LetterboxdFilmListHubOptions = PseuplexFeedHubOptions & {
	letterboxdMetadataProvider: LetterboxdMetadataProvider;
	metadataTransformOptions: PseuplexMetadataTransformOptions;
	itemTokenSource?: LetterboxdListItemTokenSource | undefined | null;
};

export type LetterboxdFilmListPageFetcher = (pageToken: string | null) => Promise<letterboxd.FilmListPage>;
type LetterboxdFilmListHubChunk = PseuplexFeedHubChunk<letterboxd.Film,number,string>;

export class LetterboxdFilmListHub extends PseuplexFeedHub<letterboxd.Film,number,string,LetterboxdFilmListHubOptions> {
	title?: (string | undefined);
	private _fetchPage: LetterboxdFilmListPageFetcher;

	constructor(options: LetterboxdFilmListHubOptions, fetchPage: LetterboxdFilmListPageFetcher) {
		super(options);
		this._fetchPage = fetchPage;
	}

	override async get(params: PseuplexHubPageParams, context: PseuplexRequestContext): Promise<PseuplexHubPage> {
		const page = await super.get(params, context);
		if(this.title != null) {
			page.hub.title = this.title;
		}
		return page;
	}

	get metadataTransformOptions(): PseuplexMetadataTransformOptions {
		return this._options.metadataTransformOptions;
	}

	override parseItemTokenParam(itemToken: string | number): number | undefined {
		if(this._options.itemTokenSource) {
			// parse string as number
			if(typeof itemToken != 'string') {
				return itemToken;
			}
			const parsedItemToken = Number.parseInt(itemToken);
			if(Number.isNaN(parsedItemToken)) {
				return itemToken as any;
			}
			return parsedItemToken;
		}
		return undefined;
	}

	override compareItemTokens(itemToken1: number, itemToken2: number) {
		if(this._options.itemTokenSource) {
			if(itemToken1 == null || itemToken2 == null) {
				// if one of the items has a null token, we can't compare tokens
				//  so we will always assume "reloads" of the list come before the old version
				return -1;
			}
			// larger token is first (ie, newer date)
			return itemToken2 - itemToken1;
		} else {
			// Since we aren't using tokens and only load this list once,
			//  we will always assume "reloads" of the list come before the old version
			return -1;
		}
	}

	override async fetchPage(pageToken: string | null): Promise<LetterboxdFilmListHubChunk> {
		const page = await this._fetchPage(pageToken);
		if(page.title != null) {
			this.title = page.title;
		}
		return {
			items: page.items.map((listItem) => {
				let token: any = undefined;
				switch(this._options.itemTokenSource) {
					case LetterboxdListItemTokenSource.ID: {
						// parse string as number
						token = listItem.id;
						if(token != null && typeof token === 'string') {
							const parsedToken = Number.parseInt(token);
							if(!Number.isNaN(parsedToken)) {
								token = parsedToken;
							}
						}
					} break;
				}
				return {
					id: listItem.id,
					token: token,
					item: listItem.film
				};
			}),
			//hasMore: (page.nextPageHref ? true : false),
			//totalItemCount: page.items?.length ?? 0,
			nextPageToken: page.nextPageHref ?? null,
		};
	}

	override async transformItem(item: letterboxd.Film, context: PseuplexRequestContext): Promise<plexTypes.PlexMetadataItem> {
		return await lbtransform.transformLetterboxdFilmHubEntry(item, context, this._options.letterboxdMetadataProvider, this.metadataTransformOptions);
	}
}
