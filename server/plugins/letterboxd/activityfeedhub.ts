
import * as letterboxd from 'letterboxd-retriever';
import * as plexTypes from '../../plex/types';
import {
	PseuplexFeedHub,
	PseuplexFeedHubOptions,
	PseuplexMetadataTransformOptions,
	PseuplexRequestContext
} from '../../pseuplex';
import { LetterboxdMetadataProvider } from './metadata';
import * as lbtransform from './transform';
import { LoadableListFetchedChunk } from '../../fetching/LoadableListFragment';

type PageToken = {
	csrf: string;
	token: string;
};

export type LetterboxdActivityFeedHubOptions = PseuplexFeedHubOptions & {
	metadataTransformOptions: PseuplexMetadataTransformOptions;
	letterboxdMetadataProvider: LetterboxdMetadataProvider;
};

export type LetterboxdActivityFeedPageFetcher = (pageToken: PageToken | null) => Promise<letterboxd.ActivityFeedPage>;

export class LetterboxdActivityFeedHub extends PseuplexFeedHub<letterboxd.Film,number,PageToken,LetterboxdActivityFeedHubOptions> {
	_fetchPage: LetterboxdActivityFeedPageFetcher;

	constructor(options: LetterboxdActivityFeedHubOptions, fetchPage: LetterboxdActivityFeedPageFetcher) {
		super(options);
		this._fetchPage = fetchPage;
	}

	override get metadataTransformOptions(): PseuplexMetadataTransformOptions {
		return this._options.metadataTransformOptions;
	}

	override parseItemTokenParam(itemToken: string): number | null {
		const parsedToken = Number.parseInt(itemToken);
		return Number.isNaN(parsedToken) ? null : parsedToken;
	}

	override async fetchPage(pageToken: PageToken | null): Promise<LoadableListFetchedChunk<letterboxd.Film,number,PageToken>> {
		const page = await this._fetchPage(pageToken);
		return {
			items: page.items.filter((item) => (item.film != null)).map((item) => {
				const token = Number.parseInt(item.id);
				return {
					id: item.film!.href,
					token: !Number.isNaN(token) ? token : item.id as any,
					item: item.film!
				};
			}),
			nextPageToken: (page.items.length > 0 && !page.end) ? {
				csrf: page.csrf,
				token: page.items[page.items.length-1].id
			} : null
		};
	}

	override compareItemTokens(itemToken1: number, itemToken2: number) {
		// larger token is first (ie, newer date)
		return itemToken2 - itemToken1;
	}

	override async transformItem(item: letterboxd.Film, context: PseuplexRequestContext): Promise<plexTypes.PlexMetadataItem> {
		const opts = this._options;
		return await lbtransform.transformLetterboxdFilmHubEntry(item, context, opts.letterboxdMetadataProvider, opts.metadataTransformOptions);
	}
}
