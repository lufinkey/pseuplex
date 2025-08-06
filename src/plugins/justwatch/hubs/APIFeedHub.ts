import * as plexTypes from '../../../plex/types';
import {
	PseuplexFeedHub,
	PseuplexFeedHubChunk,
	PseuplexFeedHubOptions,
	PseuplexRequestContext,
	PseuplexMetadataTransformOptions
} from '../../../pseuplex';
import { JustWatchTitle } from '../types';
import { JustWatchMetadataProvider } from '../metadata';

export type APIFeedHubOptions<T> = PseuplexFeedHubOptions & {
	apiCall: (params: any) => Promise<{ data: any; hasMore: boolean; nextCursor?: string }>;
	dataTransformer: (apiData: any) => T[];
	metadataProvider?: JustWatchMetadataProvider;
	apiParams: any;
};

/**
 * Generic hub class that can work with different API endpoints
 * by providing the API call function and data transformer
 */
export class APIFeedHub<T> extends PseuplexFeedHub<T, void, string, APIFeedHubOptions<T>> {
	private _totalItemsFetched: number = 0;
	
	constructor(options: APIFeedHubOptions<T>) {
		super(options);
	}

	get metadataTransformOptions(): PseuplexMetadataTransformOptions {
		return {
			metadataBasePath: '/library/metadata',
			qualifiedMetadataId: true
		};
	}

	override parseItemTokenParam(itemToken: string | number): void | undefined {
		return undefined;
	}

	override compareItemTokens(itemToken1: void, itemToken2: void): number {
		// Force reloading the entire list on each request for dynamic content
		return -1;
	}

	override async fetchPage(pageToken: string | null): Promise<PseuplexFeedHubChunk<T, void, string>> {
		const maxItems = this._options.apiParams.first || 15;
		
		if (this._totalItemsFetched >= maxItems) {
			return {
				items: [],
				nextPageToken: null
			};
		}
		
		const remainingItems = maxItems - this._totalItemsFetched;
		const requestCount = Math.min(remainingItems, 15);
		
		// Call the provided API function with parameters
		const apiParams = {
			...this._options.apiParams,
			first: requestCount,
			after: pageToken || undefined
		};
		
		const response = await this._options.apiCall(apiParams);
		
		if (!response) {
			throw new Error('API returned no data');
		}

		// Transform API data to the expected format
		const items = this._options.dataTransformer(response.data);
		
		// Limit results and update counter
		const limitedItems = items.slice(0, Math.min(remainingItems, requestCount));
		this._totalItemsFetched += limitedItems.length;
		
		const hasMoreItems = response.hasMore && this._totalItemsFetched < maxItems;

		return {
			items: limitedItems.map((item, index) => ({
				id: this.getItemId(item),
				token: undefined as void,
				item: item
			})),
			nextPageToken: hasMoreItems ? (response.nextCursor || null) : null,
		};
	}

	// Override this in subclasses to extract ID from different item types
	protected getItemId(item: T): string {
		return (item as any).id || Math.random().toString();
	}

	override async transformItem(item: T, context: PseuplexRequestContext): Promise<plexTypes.PlexMetadataItem> {
		// Default implementation - override in subclasses for specific transformations
		return this.defaultTransformItem(item, context);
	}

	protected defaultTransformItem(item: T, context: PseuplexRequestContext): plexTypes.PlexMetadataItem {
		// Basic transformation - override in subclasses
		const anyItem = item as any;
		return {
			ratingKey: `api:${this.getItemId(item)}`,
			key: `/library/metadata/api:${this.getItemId(item)}`,
			guid: `api://item/${this.getItemId(item)}`,
			type: plexTypes.PlexMediaItemType.Movie,
			title: anyItem.title || anyItem.name || 'Unknown',
			year: anyItem.year || anyItem.releaseYear,
			summary: anyItem.summary || anyItem.description || '',
		};
	}
}
