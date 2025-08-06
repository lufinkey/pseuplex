import * as plexTypes from '../../../plex/types';
import { PseuplexRequestContext } from '../../../pseuplex';
import { JustWatchTitle, JustWatchHubConfig } from '../types';
import { JustWatchMetadataProvider } from '../metadata';
import { getPopularTitles } from '../api';
import { APIFeedHub, APIFeedHubOptions } from './APIFeedHub';

export type JustWatchHubOptions = Omit<APIFeedHubOptions<JustWatchTitle>, 'apiCall' | 'dataTransformer'> & {
	config: JustWatchHubConfig;
	justWatchMetadataProvider?: JustWatchMetadataProvider;
};

/**
 * JustWatch-specific hub that uses the generic APIFeedHub
 * with JustWatch API calls and transformations
 */
export class JustWatchHub extends APIFeedHub<JustWatchTitle> {
	private readonly justWatchConfig: JustWatchHubConfig;
	private readonly justWatchMetadataProvider?: JustWatchMetadataProvider;

	constructor(options: JustWatchHubOptions) {
		const apiOptions: APIFeedHubOptions<JustWatchTitle> = {
			...options,
			apiCall: async (params) => {
				const response = await getPopularTitles(params);
				return {
					data: response,
					hasMore: response?.popularTitles?.pageInfo?.hasNextPage || false,
					nextCursor: response?.popularTitles?.pageInfo?.endCursor
				};
			},
			dataTransformer: (apiData) => {
				return apiData?.popularTitles?.edges?.map((edge: any) => edge.node) || [];
			},
			apiParams: options.config
		};
		
		super(apiOptions);
		this.justWatchConfig = options.config;
		this.justWatchMetadataProvider = options.justWatchMetadataProvider;
	}

	protected override getItemId(item: JustWatchTitle): string {
		return item.id;
	}

	override async transformItem(item: JustWatchTitle, context: PseuplexRequestContext): Promise<plexTypes.PlexMetadataItem> {
		// Create a basic metadata item from JustWatch data
		const metadataItem = this.justWatchTitleToPlexMetadata(item, context, this.metadataTransformOptions);
		
		// Use the metadata provider to check if this item exists on the server and attach Plex data
		const metadataId = item.id;
		if (this.justWatchMetadataProvider) {
			return await this.justWatchMetadataProvider.attachPlexDataIfAble(metadataId, metadataItem, context);
		}
		
		return metadataItem;
	}

	private justWatchTitleToPlexMetadata(item: JustWatchTitle, context: PseuplexRequestContext, options: any): plexTypes.PlexMetadataItem {
		// Create a basic metadata item from JustWatch data
		const metadataItem: plexTypes.PlexMetadataItem = {
			ratingKey: `justwatch:${item.id}`,
			key: `/library/metadata/justwatch:${item.id}`,
			guid: '', // Will be set below
			slug: item.content.fullPath.split('/').pop() || item.id,
			type: item.objectType === 'MOVIE' ? plexTypes.PlexMediaItemType.Movie : plexTypes.PlexMediaItemType.TVShow,
			title: item.content.title,
			year: item.content.originalReleaseYear,
			summary: item.content.shortDescription || '',
			thumb: item.content.posterUrl ? `https://images.justwatch.com${item.content.posterUrl.replace('{profile}', 's718').replace('{format}', 'jpg')}` : undefined,
			art: item.content.backdrops?.[0]?.backdropUrl ? `https://images.justwatch.com${item.content.backdrops[0].backdropUrl.replace('{profile}', 's1920').replace('{format}', 'jpg')}` : undefined,
			rating: item.content.scoring?.imdbScore,
			audienceRating: item.content.scoring?.tmdbScore,
			duration: item.content.runtime ? item.content.runtime * 60 * 1000 : undefined, // Convert minutes to milliseconds
		};

		// Set GUID based on available external IDs
		if (item.content.externalIds.imdbId) {
			metadataItem.guid = `plex://movie/${item.content.externalIds.imdbId}`;
		} else if (item.content.externalIds.tmdbId) {
			metadataItem.guid = `plex://movie/${item.content.externalIds.tmdbId}`;
		} else {
			metadataItem.guid = `justwatch://title/${item.id}`;
		}

		// Add genres
		if (item.content.genres && item.content.genres.length > 0) {
			metadataItem.Genre = item.content.genres.map((genre, index) => ({
				filter: `genre=${index}`,
				id: index,
				tag: genre.translation || genre.shortName
			}));
		}

		// Add external IDs for Plex matching
		if (item.content.externalIds.imdbId || item.content.externalIds.tmdbId) {
			metadataItem.Guid = [];
			if (item.content.externalIds.imdbId) {
				metadataItem.Guid.push({ id: `imdb://${item.content.externalIds.imdbId}` });
			}
			if (item.content.externalIds.tmdbId) {
				metadataItem.Guid.push({ id: `tmdb://${item.content.externalIds.tmdbId}` });
			}
		}

		return metadataItem;
	}
}
