import qs from 'querystring';
import * as plexTypes from '../plex/types';
import {
	PlexDiscoverAPIRequestOptions,
	plexDiscoverFetch
} from './core';

export const getLibraryMetadata = async (id: string | string[], options: (PlexDiscoverAPIRequestOptions & {
	params?: plexTypes.PlexMetadataPageParams,
})): Promise<plexTypes.PlexMetadataPage> => {
	const idString = (id instanceof Array) ? id.map((idVal) => qs.escape(idVal)).join(',') : qs.escape(id);
	return await plexDiscoverFetch<plexTypes.PlexMetadataPage>({
		...options,
		method: 'GET',
		endpoint: `library/metadata/${idString}`,
	});
};

export const getLibraryMetadataChildren = async (id: string, options: (PlexDiscoverAPIRequestOptions & {
	params?: plexTypes.PlexMetadataChildrenPageParams,
})): Promise<plexTypes.PlexMetadataPage> => {
	return await plexDiscoverFetch<plexTypes.PlexMetadataPage>({
		...options,
		method: 'GET',
		endpoint: `library/metadata/${qs.escape(id)}/children`,
	});
};
