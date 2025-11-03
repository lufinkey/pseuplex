import { PlexAuthContext } from '../../plex/types';
import { PlexTVAPIRequestOptions, plexTVFetch } from './core';
import { PlexTVAccessTokensPage, PlexTVSharedServersPage } from '../types';

export const getSharedServers = async (args: {
	clientIdentifier: string,
}, options: PlexTVAPIRequestOptions): Promise<PlexTVSharedServersPage> => {
	return await plexTVFetch<PlexTVSharedServersPage>({
		...options,
		method: 'GET',
		endpoint: `api/servers/${args.clientIdentifier}/shared_servers`,
	});
};

export const getAccessTokens = async (options: PlexTVAPIRequestOptions): Promise<PlexTVAccessTokensPage> => {
	return await plexTVFetch<PlexTVAccessTokensPage>({
		...options,
		method: 'GET',
		endpoint: `api/v2/server/access_tokens`,
		headers: {
			'accept': 'application/json'
		}
	});
}
