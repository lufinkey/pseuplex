import {
	PlexAuthContext,
	PlexServerIdentityPage
} from '../types';
import { plexServerFetch } from './core';

export const getServerIdentity = async (options: {
	serverURL: string,
	authContext: PlexAuthContext
}): Promise<PlexServerIdentityPage> => {
	return await plexServerFetch<PlexServerIdentityPage>({
		serverURL: options.serverURL,
		method: 'GET',
		endpoint: 'identity',
		authContext: options.authContext
	});
};
