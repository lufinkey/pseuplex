
import { Config } from './config';
import * as plexTypes from './plex/types';
import { IncomingPlexAPIRequest } from './plex/requesthandling';
import { PlexServerAccountsStore } from './plex/accounts';
import pseuplex from './pseuplex';
import * as pseuLetterboxd from './pseuplex/letterboxd';

export const addLetterboxdFriendsActivityHubIfNeeded = async (resData: plexTypes.PlexLibraryHubsPage, opts: {
	userReq: IncomingPlexAPIRequest,
	config: Config, 
	plexServerAccountsStore: PlexServerAccountsStore,
	plexServerURL: string
}): Promise<plexTypes.PlexLibraryHubsPage> => {
	try {
		// get request properties
		const userInfo = opts.userReq.plex.userInfo;
		const userPrefs = opts.config.perUser[userInfo.email];
		// add friends activity feed hub if enabled
		if(userPrefs?.letterboxdUsername && (userPrefs.letterboxdFriendsActivityHubEnabled ?? opts.config.letterboxdFriendsActivityHubEnabled ?? true)) {
			const params = plexTypes.parsePlexHubPageParams(opts.userReq, {fromListPage:true});
			const hub = await pseuplex.letterboxd.hubs.userFollowingActivity.get(userPrefs.letterboxdUsername);
			const page = await hub.getHubListEntry(params, {
				plexServerURL: opts.plexServerURL,
				plexAuthContext: opts.userReq.plex.authContext
			});
			if(!resData.MediaContainer.Hub) {
				resData.MediaContainer.Hub = [];
			} else if(!(resData.MediaContainer.Hub instanceof Array)) {
				resData.MediaContainer.Hub = [resData.MediaContainer.Hub];
			}
			resData.MediaContainer.Hub.splice(0, 0, page);
			resData.MediaContainer.size += 1;
		}
	} catch(error) {
		console.error(error);
	}
	return resData;
};
