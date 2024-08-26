import qs from 'querystring';
import {
	PlexAuthContext,
	PlexMediaItemTypeNumeric,
	PlexMetadataPage
} from '../types';
import { plexServerFetch } from './core';

export const getLibraryMetadata = async (id: string | string[], options: {
	serverURL: string,
	authContext?: PlexAuthContext | null
}): Promise<PlexMetadataPage> => {
	return await plexServerFetch<PlexMetadataPage>({
		serverURL: options.serverURL,
		method: 'GET',
		endpoint: `library/metadata/${(id instanceof Array) ? id.map((idVal) => qs.escape(idVal)).join(',') : qs.escape(id)}`,
		authContext: options.authContext
	});
};
