import { PlexAuthContext } from '../types';
import { PlexMyPlexAccountPage } from '../types/MyPlex';
import { plexServerFetch } from './core';

export const getMyPlexAccount = async (options: {
	serverURL: string,
	authContext: PlexAuthContext
}): Promise<PlexMyPlexAccountPage> => {
	return await plexServerFetch<PlexMyPlexAccountPage>({
		serverURL: options.serverURL,
		method: 'GET',
		endpoint: 'myplex/account',
		authContext: options.authContext
	});
};
