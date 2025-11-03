import { PlexAuthContext } from '../../plex/types';
import { plexHttpRequest } from '../../plex/api/core';
import { Logger } from '../../logging';

export type PlexTVAPIRequestOptions = {
	authContext?: PlexAuthContext | null,
	logger?: Logger,
}

export const plexTVFetch = async <TResult>(options: (PlexTVAPIRequestOptions & {
	method?: 'GET' | 'POST' | 'PUT' | 'DELETE',
	endpoint: string,
	params?: {[key: string]: any} | null,
	headers?: {[key: string]: string},
})): Promise<TResult> => {
	// build URL
	let url = `https://plex.tv/${options.endpoint}`;
	// perform http request
	return await plexHttpRequest(url, {
		method: options.method,
		params: options.params,
		headers: options.headers,
		authContext: options.authContext,
		logger: options.logger,
	});
};
