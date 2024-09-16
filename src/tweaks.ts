
import { Config } from './config';
import * as plexTypes from './plex/types';
import { IncomingPlexAPIRequest } from './plex/requesthandling';
import { PlexServerAccountsStore } from './plex/accounts';
import pseuplex from './pseuplex';

export const addLetterboxdFeedHub = async (resData: plexTypes.PlexLibraryHubsPage, opts: {
	userReq: IncomingPlexAPIRequest,
	config: Config, 
	plexServerAccountsStore: PlexServerAccountsStore,
	plexServerURL: string
}): Promise<plexTypes.PlexLibraryHubsPage> => {
	try {
		const plexToken = plexTypes.parsePlexTokenFromRequest(opts.userReq);
		const userInfo = await opts.plexServerAccountsStore.getTokenUserInfoOrNull(plexToken);
		console.log(`userInfo for token ${plexToken} is ${userInfo?.email} (isServerOwner=${userInfo?.isServerOwner})`);
		if(userInfo) {
			const perUserCfg = userInfo ? opts.config.perUser[userInfo.email] : null;
			if(perUserCfg?.letterboxdUsername) {
				const params = plexTypes.parsePlexHubPageParams(opts.userReq, {fromListPage:true});
				const hub = await pseuplex.letterboxd.hubs.userFollowingActivity.get(perUserCfg.letterboxdUsername);
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
		}
	} catch(error) {
		console.error(error);
	}
	return resData;
};
