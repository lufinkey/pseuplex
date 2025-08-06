import * as plexTypes from '../../plex/types';
import {
	parsePlexExternalGuids,
	parsePlexMetadataGuid,
} from '../../plex/metadataidentifier';
import {
	PseuplexMetadataItem,
	PseuplexMetadataProviderBase,
	PseuplexMetadataTransformOptions,
	PseuplexPartialMetadataIDString,
	PseuplexMetadataSource,
	PseuplexRequestContext,
	PseuplexMetadataProviderItemMatchParams,
} from '../../pseuplex';
import { JustWatchTitle, JustWatchSingleTitleResponse, JustWatchQueryVariables } from './types';

export type JustWatchMetadataItem = JustWatchTitle;

const JUSTWATCH_GRAPHQL_QUERY = `query GetTitle($country: Country!, $language: Language!, $titleId: ID!) {
  node(id: $titleId) {
    ... on MovieOrShow {
      id
      objectId
      objectType
      content(country: $country, language: $language) {
        externalIds {
          tmdbId
          imdbId
        }
        title
        fullPath
        originalReleaseYear
        shortDescription
        scoring {
          imdbVotes
          imdbScore
          tmdbPopularity
          tmdbScore
          tomatoMeter
          certifiedFresh
          jwRating
        }
        posterUrl(profile: S718, format: JPG)
        backdrops(profile: S1920, format: JPG) {
          backdropUrl
        }
        isReleased
        runtime
        genres {
          translation(language: $language)
          shortName
        }
      }
    }
  }
}`;

export class JustWatchMetadataProvider extends PseuplexMetadataProviderBase<JustWatchMetadataItem> {
	readonly sourceDisplayName = "JustWatch";
	readonly sourceSlug = "justwatch" as PseuplexMetadataSource;

	override async fetchMetadataItem(id: PseuplexPartialMetadataIDString): Promise<JustWatchMetadataItem> {
		console.log(`Fetching JustWatch info for ${id}`);
		
		// Extract the title ID from the metadata ID (format: "tm123456")
		const titleId = id;
		
		const variables = {
			titleId,
			language: 'en',
			country: 'NL'
		};

		const response = await fetch('https://apis.justwatch.com/graphql', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				operationName: 'GetTitle',
				variables,
				query: JUSTWATCH_GRAPHQL_QUERY
			})
		});

		if (!response.ok) {
			throw new Error(`JustWatch API error: ${response.status} ${response.statusText}`);
		}

		const data = await response.json() as JustWatchSingleTitleResponse;
		const title = data.data?.node;
		
		if (!title) {
			throw new Error(`Title not found: ${titleId}`);
		}

		return title as JustWatchTitle;
	}

	override transformMetadataItem(metadataItem: JustWatchMetadataItem, context: PseuplexRequestContext, transformOpts: PseuplexMetadataTransformOptions): PseuplexMetadataItem {
		const plexMetadata = this.justWatchTitleToPlexMetadata(metadataItem, context, transformOpts);
		const metadataId = this.idFromMetadataItem(metadataItem);
		
		return {
			...plexMetadata,
			Pseuplex: {
				isOnServer: false,
				unavailable: true,
				metadataIds: {
					[this.sourceSlug]: metadataId
				}
			}
		};
	}

	override idFromMetadataItem(metadataItem: JustWatchMetadataItem): PseuplexPartialMetadataIDString {
		return metadataItem.id;
	}

	override getPlexMatchParams(title: JustWatchMetadataItem): (PseuplexMetadataProviderItemMatchParams | null) {
		const guids = this.titleGuids(title);
		if (guids.length === 0) {
			return null;
		}

		let types: plexTypes.PlexMediaItemTypeNumeric[] = [];
		if (title.objectType === 'MOVIE') {
			types = [plexTypes.PlexMediaItemTypeNumeric.Movie];
		} else if (title.objectType === 'SHOW') {
			types = [plexTypes.PlexMediaItemTypeNumeric.Show];
		} else {
			types = [plexTypes.PlexMediaItemTypeNumeric.Movie, plexTypes.PlexMediaItemTypeNumeric.Show];
		}

		return {
			title: title.content.title,
			year: title.content.originalReleaseYear,
			types: types,
			guids: guids as `${string}://${string}`[],
		};
	}

	override async findMatchForPlexItem(metadataItem: plexTypes.PlexMetadataItem): Promise<JustWatchMetadataItem | null> {
		const plexGuid = metadataItem.guid;
		const plexGuidParts = plexGuid ? parsePlexMetadataGuid(plexGuid) : null;
		
		if (plexGuidParts) {
			// Get the ID from the cache if it exists
			const id = await this.plexGuidToIDCache.get(plexGuid!);
			if (id) {
				return this.fetchMetadataItem(id);
			} else if (id === null) {
				return null;
			}
		}

		// Try to find by external IDs
		const idMap = parsePlexExternalGuids(metadataItem.Guid ?? []);
		const tmdbId = idMap['tmdb'];
		const imdbId = idMap['imdb'];

		if (!tmdbId && !imdbId) {
			return null;
		}

		// For now, we can't directly search JustWatch by TMDB/IMDB ID in their public API
		// This would require a more complex search implementation
		return null;
	}

	private justWatchTitleToPlexMetadata(title: JustWatchTitle, context: PseuplexRequestContext, options: PseuplexMetadataTransformOptions): PseuplexMetadataItem {
		const metadataId = this.idFromMetadataItem(title);
		const fullMetadataId = `justwatch:${metadataId}`;
		
		const metadataItem: PseuplexMetadataItem = {
			key: `${options.metadataBasePath}/${options.qualifiedMetadataId ? fullMetadataId : metadataId}`,
			ratingKey: fullMetadataId,
			type: title.objectType === 'MOVIE' ? plexTypes.PlexMediaItemType.Movie : plexTypes.PlexMediaItemType.TVShow,
			title: title.content.title,
			year: title.content.originalReleaseYear,
			summary: title.content.shortDescription || '',
			thumb: title.content.posterUrl ? `https://images.justwatch.com${title.content.posterUrl.replace('{profile}', 's718').replace('{format}', 'jpg')}` : undefined,
			art: title.content.backdrops?.[0]?.backdropUrl ? `https://images.justwatch.com${title.content.backdrops[0].backdropUrl.replace('{profile}', 's1920').replace('{format}', 'jpg')}` : undefined,
			rating: title.content.scoring?.imdbScore,
			audienceRating: title.content.scoring?.tmdbScore,
			duration: title.content.runtime ? title.content.runtime * 60 * 1000 : undefined,
			Pseuplex: {
				isOnServer: false,
				unavailable: true,
				metadataIds: {
					[this.sourceSlug]: metadataId
				}
			},
			Guid: this.titleGuids(title).map((guid) => ({id: guid as `${string}://${string}`})),
			Genre: title.content.genres?.map((genre, index) => ({
				filter: `genre=${index}`,
				id: index,
				tag: genre.translation || genre.shortName
			})) || undefined,
		};

		return metadataItem;
	}

	private titleGuids(title: JustWatchTitle): string[] {
		const guids: string[] = [];
		if (title.content.externalIds.tmdbId) {
			guids.push(`tmdb://${title.content.externalIds.tmdbId}`);
		}
		if (title.content.externalIds.imdbId) {
			guids.push(`imdb://${title.content.externalIds.imdbId}`);
		}
		return guids;
	}
}
