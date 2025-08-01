import letterboxd from 'letterboxd-retriever';
import { LoadableListItemNode } from '../../fetching/LoadableListFragment';
import {
	PseuplexFeedHub,
	PseuplexFeedHubChunk,
	PseuplexFeedHubOptions,
	PseuplexMetadataTransformOptions,
	PseuplexRequestContext
} from '../../pseuplex';
import * as plexTypes from '../../plex/types';
import * as lbtransform from './transform';
import { LetterboxdMetadataProvider } from './metadata';

export type LetterboxdFilmsHubOptions = PseuplexFeedHubOptions & {
	letterboxdMetadataProvider: LetterboxdMetadataProvider;
	metadataTransformOptions: PseuplexMetadataTransformOptions;
};

export type LetterboxdFilmsPageFetcher = (pageToken: string | null) => Promise<letterboxd.FilmsPage>;
type LetterboxdFilmsHubChunk = PseuplexFeedHubChunk<letterboxd.Film,void,string>;

export class LetterboxdFilmsHub extends PseuplexFeedHub<letterboxd.Film,void,string,LetterboxdFilmsHubOptions> {
	private _fetchPage: LetterboxdFilmsPageFetcher;

	constructor(options: LetterboxdFilmsHubOptions, fetchPage: LetterboxdFilmsPageFetcher) {
		super(options);
		this._fetchPage = fetchPage;
	}

	get metadataTransformOptions(): PseuplexMetadataTransformOptions {
		return this._options.metadataTransformOptions;
	}

	override parseItemTokenParam(itemToken: string): void {
		// films pages (ie similar films pages) dont have tokens
		return undefined;
	}

	override compareItemTokens(itemToken1: void, itemToken2: void): number {
		// Since we only load this list once (listStartFetchInterval = 'never'),
		//  we will always assume "reloads" of the list come before the old version
		return -1;
	}

	override async fetchPage(pageToken: string | null): Promise<LetterboxdFilmsHubChunk> {
		const page = await this._fetchPage(pageToken);
		return {
			items: page.items.map((film) => {
				return {
					id: film.href,
					token: undefined, // pages like the similar items list don't have tokens per item
					item: film
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
