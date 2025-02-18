import * as plexTypes from '../plex/types';
import {
	PlexDiscoverAPIRequestOptions,
	plexDiscoverFetch
} from './core';

export const search = async (options: (PlexDiscoverAPIRequestOptions & {
	params: plexTypes.PlexTVSearchParams,
})): Promise<plexTypes.PlexTVSearchResultsPage> => {
	// send request
	return await plexDiscoverFetch<plexTypes.PlexTVSearchResultsPage>({
		...options,
		method: 'GET',
		endpoint: 'library/search',
	});
};
