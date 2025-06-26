
import { Bandcamp, BandcampFanFeed$Item } from 'bandcamp-retriever';
import { LoadableListFetchedChunk } from '../../fetching/LoadableListFragment';
import * as plexTypes from '../../plex/types';
import {
	PseuplexFeedHub,
	PseuplexFeedHubChunk,
	PseuplexFeedHubOptions,
	PseuplexMetadataTransformOptions,
	PseuplexRequestContext
} from '../../pseuplex';
import { BandcampMetadataProvider } from './metadata';
import * as bcTransform from './transform';

type ItemToken = number;
type PageToken = number;

export type BandcampFanFeedHubOptions = PseuplexFeedHubOptions & {
	metadataTransformOptions: PseuplexMetadataTransformOptions;
	bandcampClient: Bandcamp;
	bandcampMetadataProvider: BandcampMetadataProvider;
};

type BandcampFeedHubChunk = PseuplexFeedHubChunk<BandcampFanFeed$Item,ItemToken,PageToken>;

export class BandcampFanFeedHub extends PseuplexFeedHub<BandcampFanFeed$Item,ItemToken,PageToken,BandcampFanFeedHubOptions> {
	override get metadataTransformOptions(): PseuplexMetadataTransformOptions {
		return this._options.metadataTransformOptions;
	}

	override parseItemTokenParam(itemToken: string): ItemToken | null {
		const parsedToken = Number.parseInt(itemToken);
		return Number.isNaN(parsedToken) ? null : parsedToken;
	}

	override async fetchPage(pageToken: PageToken | null): Promise<BandcampFeedHubChunk> {
		const page = await this._options.bandcampClient.getFanFeed({
			olderThan: pageToken ?? undefined,
		});
		return {
			items: page.stories.filter((story) => (story.item != null)).map((story) => {
				const storyDate = new Date(story.date);
				const storyToken = storyDate.getTime() / 1000;
				return {
					id: story.item!.id != null ? `${story.item!.id}` : undefined!,
					token: storyToken,
					item: story.item!,
				};
			}),
			nextPageToken: page.oldestStoryDate,
		};
	}

	override compareItemTokens(itemToken1: number, itemToken2: number) {
		// larger token is first (ie, newer date)
		return itemToken2 - itemToken1;
	}

	override async transformItem(item: BandcampFanFeed$Item, context: PseuplexRequestContext): Promise<plexTypes.PlexMetadataItem> {
		// TODO transform story to item
		return bcTransform.fanFeedItemToPlexMetadata(item, this.metadataTransformOptions);
	}
}
