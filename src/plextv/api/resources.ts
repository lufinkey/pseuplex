import { PlexAuthContext } from '../../plex/types';
import { plexTVFetch } from './core';
import { PlexTVResourcesPage } from '../types/Resources';

export const getResources = async (options: {
	authContext: PlexAuthContext
}): Promise<PlexTVResourcesPage> => {
	return await plexTVFetch<PlexTVResourcesPage>({
		method: 'GET',
		endpoint: 'api/resources',
		authContext: options.authContext
	});
};
