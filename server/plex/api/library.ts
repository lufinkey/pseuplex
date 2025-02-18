import qs from 'querystring';
import * as plexTypes from '../types';
import {
	PlexAPIRequestOptions,
	plexServerFetch
} from './core';

export const getLibraryMetadata = async (id: string | string[], options: (PlexAPIRequestOptions & {
	params?: plexTypes.PlexMetadataPageParams,
})): Promise<plexTypes.PlexMetadataPage> => {
	const idString = (id instanceof Array) ? id.map((idVal) => qs.escape(idVal)).join(',') : qs.escape(id);
	return await plexServerFetch<plexTypes.PlexMetadataPage>({
		...options,
		method: 'GET',
		endpoint: `library/metadata/${idString}`,
	});
};

export const getLibraryMetadataChildren = async (id: string, options: (PlexAPIRequestOptions & {
	params?: plexTypes.PlexMetadataChildrenPageParams,
})): Promise<plexTypes.PlexMetadataChildrenPage> => {
	return await plexServerFetch<plexTypes.PlexMetadataChildrenPage>({
		...options,
		method: 'GET',
		endpoint: `library/metadata/${qs.escape(id)}/children`,
	});
};

export type FindLibraryMetadataArgs = (
	{type?: plexTypes.PlexMediaItemTypeNumeric}
	& ({guid: string | string[]} | {'show.guid': string, 'season.index': number})
);

export const findLibraryMetadata = async (args: FindLibraryMetadataArgs, options: (PlexAPIRequestOptions & {
	params?: plexTypes.PlexMetadataPageParams,
})): Promise<plexTypes.PlexMetadataPage> => {
	return await plexServerFetch<plexTypes.PlexMetadataPage>({
		...options,
		method: 'GET',
		endpoint: 'library/all',
		params: {
			...args,
			...options.params,
		},
	});
};

export type GetRelatedHubsOptions = (PlexAPIRequestOptions & {
	params?: plexTypes.PlexHubListPageParams,
});

export const getLibraryMetadataRelatedHubs = async (id: string | string[], options: GetRelatedHubsOptions): Promise<plexTypes.PlexHubsPage> => {
	return await plexServerFetch({
		...options,
		method: 'GET',
		endpoint: `/library/metadata/${
			(id instanceof Array) ?
				id.map((idVal) => qs.escape(idVal)).join(',')
				: qs.escape(id)
		}/related`,
	});
};

export const getMetadataRelatedHubs = async (id: string | string[], options: GetRelatedHubsOptions): Promise<plexTypes.PlexHubsPage> => {
	return await plexServerFetch({
		...options,
		method: 'GET',
		endpoint: `/hubs/metadata/${
			(id instanceof Array) ?
				id.map((idVal) => qs.escape(idVal)).join(',')
				: qs.escape(id)
		}/related`,
	});
};

export const searchLibrary = async (options: (PlexAPIRequestOptions & {
	params: plexTypes.PlexLibrarySearchParams,
})): Promise<plexTypes.PlexLibrarySearchResultsPage> => {
	// parse params
	if(options.params?.searchTypes instanceof Array) {
		options.params.searchTypes = options.params.searchTypes.join(',') as any;
	}
	// send request
	return await plexServerFetch<plexTypes.PlexLibrarySearchResultsPage>({
		...options,
		method: 'GET',
		endpoint: 'library/search',
	});
};

export const getLibrarySections = async (options: PlexAPIRequestOptions): Promise<plexTypes.PlexLibrarySectionsPage> => {
	return await plexServerFetch({
		...options,
		method: 'GET',
		endpoint: `/library/sections`,
	});
}
