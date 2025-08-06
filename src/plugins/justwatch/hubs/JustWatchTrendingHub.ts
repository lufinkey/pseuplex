import { JustWatchTitle, JustWatchHubConfig } from '../types';
import { JustWatchMetadataProvider } from '../metadata';
import { APIFeedHub, APIFeedHubOptions } from './APIFeedHub';

export type JustWatchTrendingHubOptions = Omit<APIFeedHubOptions<JustWatchTitle>, 'apiCall' | 'dataTransformer'> & {
	config: JustWatchHubConfig;
	justWatchMetadataProvider?: JustWatchMetadataProvider;
};

/**
 * Example of how the generic APIFeedHub can be reused for different endpoints
 * This shows how easy it would be to add new JustWatch hub types
 */
export class JustWatchTrendingHub extends APIFeedHub<JustWatchTitle> {
	constructor(options: JustWatchTrendingHubOptions) {
		const apiOptions: APIFeedHubOptions<JustWatchTitle> = {
			...options,
			apiCall: async (params) => {
				// This would call a different API endpoint in the future
				// const response = await getTrendingTitles(params);
				
				// Placeholder implementation
				return {
					data: null,
					hasMore: false,
					nextCursor: undefined
				};
			},
			dataTransformer: (apiData) => {
				// Would transform trending data in the future
				return [];
			},
			apiParams: options.config
		};
		
		super(apiOptions);
	}

	protected override getItemId(item: JustWatchTitle): string {
		return item.id;
	}

	// Could override transformItem if trending data needs different transformation
}
