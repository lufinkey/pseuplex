import * as plexTypes from '../../plex/types';
import {
	PseuplexFeedHub,
	PseuplexFeedHubChunk,
	PseuplexFeedHubOptions,
	PseuplexRequestContext,
	PseuplexMetadataTransformOptions
} from '../../pseuplex';
import { LoadableListItemNode } from '../../fetching/LoadableListFragment';
import { JustWatchHubConfig, JustWatchTitle, JustWatchLanguage, JustWatchCountry, JustWatchSortBy } from './types';
import { JustWatchMetadataProvider } from './metadata';
import { getPopularTitles } from './api';

export type JustWatchHubOptions = PseuplexFeedHubOptions & {
	config: JustWatchHubConfig;
	justWatchMetadataProvider?: JustWatchMetadataProvider;
};

type JustWatchHubChunk = PseuplexFeedHubChunk<JustWatchTitle, void, string>;

export class JustWatchHub extends PseuplexFeedHub<JustWatchTitle, void, string, JustWatchHubOptions> {
	private _totalItemsFetched: number = 0;
	
	constructor(options: JustWatchHubOptions) {
		super(options);
	}

	get metadataTransformOptions(): PseuplexMetadataTransformOptions {
		return {
			metadataBasePath: '/library/metadata',
			qualifiedMetadataId: true
		};
	}

	override parseItemTokenParam(itemToken: string | number): void | undefined {
		// JustWatch doesn't use item tokens for pagination
		return undefined;
	}

	override compareItemTokens(itemToken1: void, itemToken2: void) {
		return 0;
	}

	override async fetchPage(pageToken: string | null): Promise<JustWatchHubChunk> {
		const config = this._options.config;
		const configMaxItems = config.first || 15;
		
		// If we've already fetched enough items, return empty result
		if (this._totalItemsFetched >= configMaxItems) {
			return {
				items: [],
				nextPageToken: null
			};
		}
		
		// Calculate how many items we still need
		const remainingItems = configMaxItems - this._totalItemsFetched;
		const requestCount = Math.min(remainingItems, 15); // Request max 15 at a time
		
		console.log(`Fetching JustWatch titles: ${JSON.stringify({
			first: requestCount,
			objectType: config.objectType,
			packages: config.packages,
			after: pageToken
		})}`);

		const response = await getPopularTitles({
			first: requestCount,
			after: pageToken || undefined,
			objectType: config.objectType,
			packages: (config.packages || []).map(pkg => pkg.toLowerCase()),
			country: config.country || JustWatchCountry.Netherlands,
			language: config.language || JustWatchLanguage.English,
			sortBy: config.popularTitlesSortBy || JustWatchSortBy.Popular,
			genres: config.genres || [],
			excludeGenres: config.excludeGenres || [],
			monetizationTypes: config.monetizationTypes || []
		});

		if (!response) {
			throw new Error('JustWatch API returned no data');
		}

		const edges = response.popularTitles.edges || [];
		const pageInfo = response.popularTitles.pageInfo;

		console.log(`JustWatch API response for packages ${JSON.stringify(config.packages)}: ${edges.length} titles returned (requested: ${config.first || 15})`);
		
		// Log first few titles for debugging
		if (edges.length > 0) {
			const firstTitles = edges.slice(0, 3).map((edge: any) => edge.node.content.title);
			console.log(`First 3 titles for ${JSON.stringify(config.packages)}: ${JSON.stringify(firstTitles)}`);
		}

		// Limit results to the requested amount and respect total limit
		const totalMaxItems = config.first || 15;
		const remainingSlots = totalMaxItems - this._totalItemsFetched;
		const limitedEdges = edges.slice(0, Math.min(remainingSlots, requestCount));
		
		// Update total counter
		this._totalItemsFetched += limitedEdges.length;
		
		// Determine if there are more items (only if we haven't reached our total limit)
		const hasMoreItems = pageInfo?.hasNextPage && this._totalItemsFetched < totalMaxItems;

		return {
			items: limitedEdges.map((edge, index) => ({
				id: edge.node.id,
				token: undefined as void,
				item: edge.node
			})),
			nextPageToken: hasMoreItems ? pageInfo.endCursor : null,
		};
	}

	override async transformItem(item: JustWatchTitle, context: PseuplexRequestContext): Promise<plexTypes.PlexMetadataItem> {
		// Create a basic metadata item from JustWatch data
		const metadataItem = this.justWatchTitleToPlexMetadata(item, context, this.metadataTransformOptions);
		
		// Use the metadata provider to check if this item exists on the server and attach Plex data
		const metadataId = item.id;
		const metadataProvider = this._options.justWatchMetadataProvider;
		if (metadataProvider) {
			return await metadataProvider.attachPlexDataIfAble(metadataId, metadataItem, context);
		}
		
		return metadataItem;
	}

	private justWatchTitleToPlexMetadata(item: JustWatchTitle, context: PseuplexRequestContext, options: PseuplexMetadataTransformOptions): plexTypes.PlexMetadataItem {
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
