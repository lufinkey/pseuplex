import {
	PlexAuthContext,
	PlexMyPlexAccountPage
} from '../types';
import {
	PlexAPIRequestOptions,
	plexServerFetch
} from './core';

export const getMyPlexAccount = async (options: PlexAPIRequestOptions): Promise<PlexMyPlexAccountPage> => {
	return await plexServerFetch<PlexMyPlexAccountPage>({
		...options,
		method: 'GET',
		endpoint: 'myplex/account',
	});
};
