import { PlexAuthContext } from '../../plex/types';
import { plexTVFetch } from './core';
import { PlexTVSharedServersPage } from '../types/Servers';

export const getSharedServers = async (options: {
	clientIdentifier: string,
	authContext: PlexAuthContext
}): Promise<PlexTVSharedServersPage> => {
	return await plexTVFetch<PlexTVSharedServersPage>({
		method: 'GET',
		endpoint: `api/servers/${options.clientIdentifier}/shared_servers`,
		authContext: options.authContext
	});
};
