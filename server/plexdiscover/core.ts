import qs from 'querystring';
import { PlexAuthContext } from '../plex/types';
import * as plexServerAPI from '../plex/api';

export const BASE_URL = 'https://discover.provider.plex.tv';

export type PlexDiscoverAPIRequestOptions = {
	authContext?: PlexAuthContext | null,
	verbose?: boolean,
}

export const plexDiscoverFetch = async <TResult>(options: (PlexDiscoverAPIRequestOptions & {
	method?: 'GET' | 'POST' | 'PUT' | 'DELETE',
	endpoint: string,
	params?: {[key: string]: any} | null,
	headers?: {[key: string]: string},
})): Promise<TResult> => {
	return await plexServerAPI.fetch({
		...options,
		serverURL: BASE_URL
	});
};
