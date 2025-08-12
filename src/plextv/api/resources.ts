import { PlexAuthContext } from '../../plex/types';
import { PlexTVAPIRequestOptions, plexTVFetch } from './core';
import { PlexTVResourcesPage } from '../types';

export const getResources = async (options: PlexTVAPIRequestOptions): Promise<PlexTVResourcesPage> => {
	return await plexTVFetch<PlexTVResourcesPage>({
		...options,
		method: 'GET',
		endpoint: 'api/resources',
	});
};
