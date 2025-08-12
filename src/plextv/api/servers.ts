import { PlexAuthContext } from '../../plex/types';
import { PlexTVAPIRequestOptions, plexTVFetch } from './core';
import { PlexTVSharedServersPage } from '../types';

export const getSharedServers = async (args: {
	clientIdentifier: string,
}, options: PlexTVAPIRequestOptions): Promise<PlexTVSharedServersPage> => {
	return await plexTVFetch<PlexTVSharedServersPage>({
		...options,
		method: 'GET',
		endpoint: `api/servers/${args.clientIdentifier}/shared_servers`,
	});
};
