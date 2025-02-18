import { PlexTVAPIRequestOptions, plexTVFetch } from './core';
import { PlexTVCurrentUserInfo } from '../types';

export const getCurrentUser = async (options: PlexTVAPIRequestOptions): Promise<PlexTVCurrentUserInfo> => {
	return await plexTVFetch<PlexTVCurrentUserInfo>({
		...options,
		method: 'GET',
		endpoint: `api/v2/user`,
		headers: {
			'Accept': 'application/json'
		},
	});
};
