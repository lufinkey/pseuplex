import * as plexDiscoverAPI from '../plexdiscover';
import {
	PlexAuthContext,
	PlexMetadataItem,
	PlexMetadataPage
} from '../plex/types';

export type PlexMetadataMatchStoreOptions = {
	plexServerURL: string,
	plexAuthContext: PlexAuthContext,
	sharedServersMinLifetime: number
};

export class PlexMetadataMatchStore {
	_options: PlexMetadataMatchStoreOptions;
	_tmdbIdsToPlexGuids: { [key: string]: string } = {};
	_imdbIdsToPlexGuids: { [key: string]: string } = {};

	constructor(options: PlexMetadataMatchStoreOptions) {
		this._options = options;
	}
}

export const findMatchingPlexMovieOrShow = async (options: {
	title: string,
	year: number | string,
	types: plexDiscoverAPI.SearchType | plexDiscoverAPI.SearchType[],
	guids: `${string}://${string}`[],
	authContext?: PlexAuthContext | null
}) => {
	var guidsSet = new Set<string>(options.guids);
	return await findMatchingPlexMetadata({
		query: options.year ? `${options.title} ${options.year}` : options.title,
		searchTypes: options.types,
		authContext: options.authContext
	}, (searchResult) => {
		return ((searchResult.Metadata.title == options.title || searchResult.Metadata.originalTitle == options.title)
			&& (searchResult.Metadata.year == options.year));
	}, (metadata) => {
		if(metadata.Guid && metadata.Guid.length > 0 && options.guids.length > 0) {
			for(const guid of metadata.Guid) {
				if(guidsSet.has(guid.id)) {
					return true;
				}
			}
			return false;
		}
		return true;
	});
};

type SearchResultMatchFilter = (resultItem: plexDiscoverAPI.SearchResult) => boolean;
type MetadataMatchFilter = (metadataItem: PlexMetadataItem) => boolean;

const findMatchingPlexMetadata = async (options: {
	query: string,
	limit?: number,
	searchTypes: plexDiscoverAPI.SearchType | plexDiscoverAPI.SearchType[],
	authContext?: PlexAuthContext | null
}, filter: SearchResultMatchFilter, validate: MetadataMatchFilter): Promise<PlexMetadataItem | null> => {
	const resultsPage = await plexDiscoverAPI.search({
		query: options.query,
		searchProviders: plexDiscoverAPI.SearchProvider.Discover,
		searchTypes: options.searchTypes,
		limit: options.limit ?? 10,
		authContext: options.authContext
	});
	const searchResultsList = resultsPage.MediaContainer?.SearchResults;
	if(searchResultsList) {
		for(const searchResults of searchResultsList) {
			if(searchResults.SearchResult) {
				for(const searchResult of searchResults.SearchResult) {
					if(filter(searchResult)) {
						// fetch metadata details
						let key = searchResult.Metadata.key;
						if(key.endsWith('/children')) {
							key = key.substring(0, key.length-'/children'.length);
						}
						const metadataPage = await plexDiscoverAPI.fetch<PlexMetadataPage>({
							endpoint: key,
							authContext: options.authContext
						});
						let metadataItems = metadataPage?.MediaContainer?.Metadata;
						const metadataItem = (metadataItems instanceof Array) ? metadataItems[0] : metadataItems;
						if(metadataItem) {
							// validate metadata
							if(validate(metadataItem)) {
								return metadataItem;
							}
						}
					}
				}
			}
		}
	}
	return null;
};
