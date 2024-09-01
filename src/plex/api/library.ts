import qs from 'querystring';
import {
	PlexAuthContext,
	PlexMetadataPage
} from '../types';
import { plexServerFetch } from './core';

export const getLibraryMetadata = async (id: string | string[], options: {
	params?: {
		include_guids?: boolean | 0 | 1,
		checkFiles?: boolean | 0 | 1
	} & {[key: string]: any},
	serverURL: string,
	authContext?: PlexAuthContext | null
}): Promise<PlexMetadataPage> => {
	const params = options.params;
	if(params) {
		if(typeof params.include_guids === 'boolean') {
			params.include_guids = params.include_guids ? 1 : 0;
		}
		if(typeof params.checkFiles === 'boolean') {
			params.checkFiles = params.checkFiles ? 1 : 0;
		}
	}
	return await plexServerFetch<PlexMetadataPage>({
		serverURL: options.serverURL,
		method: 'GET',
		endpoint: `library/metadata/${(id instanceof Array) ? id.map((idVal) => qs.escape(idVal)).join(',') : qs.escape(id)}`,
		params: params,
		authContext: options.authContext
	});
};
