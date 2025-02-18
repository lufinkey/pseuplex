import {
	PlexAuthContext,
	PlexServerIdentityPage,
	PlexServerMediaProvidersPage
} from '../types';
import { PlexAPIRequestOptions, plexServerFetch } from './core';

export const getServerIdentity = async (options: PlexAPIRequestOptions): Promise<PlexServerIdentityPage> => {
	return await plexServerFetch<PlexServerIdentityPage>({
		...options,
		method: 'GET',
		endpoint: 'identity',
	});
};

export const getMediaProviders = async (options: PlexAPIRequestOptions): Promise<PlexServerMediaProvidersPage> => {
	return await plexServerFetch<PlexServerMediaProvidersPage>({
		...options,
		method: 'GET',
		endpoint: 'media/providers',
	});
};
