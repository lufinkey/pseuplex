import qs from 'querystring';
import {
	PlexAuthContext,
	PlexMetadataPage,
	PlexMetadataPageParams
} from '../types';
import { plexServerFetch } from './core';

export const getLibraryMetadata = async (id: string | string[], options: {
	params?: PlexMetadataPageParams,
	serverURL: string,
	authContext?: PlexAuthContext | null
}): Promise<PlexMetadataPage> => {
	return await plexServerFetch<PlexMetadataPage>({
		serverURL: options.serverURL,
		method: 'GET',
		endpoint: `library/metadata/${(id instanceof Array) ? id.map((idVal) => qs.escape(idVal)).join(',') : qs.escape(id)}`,
		params: options.params,
		authContext: options.authContext
	});
};
