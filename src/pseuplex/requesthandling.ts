
import express from 'express';
import { httpError } from '../utils';
import * as plexTypes from '../plex/types';
import { handlePlexAPIRequest } from '../plex/requesthandling';
import { PlexServerAccountInfo, PlexServerAccountsStore } from '../plex/accounts';

export const handleAuthenticatedPlexAPIRequest = <ResultType>(
	req: express.Request,
	res: express.Response,
	accountsStore: PlexServerAccountsStore,
	handler: (reqInfo: {
		authContext: plexTypes.PlexAuthContext,
		userInfo: PlexServerAccountInfo
	}) => Promise<ResultType>) => {
	return handlePlexAPIRequest(req, res, async () => {
		const authContext = plexTypes.parseAuthContextFromRequest(req);
		const userInfo = await accountsStore.getTokenUserInfoOrNull(authContext['X-Plex-Token']);
		if(!userInfo) {
			throw httpError(401, "You do not have access to this resource");
		}
		return await handler({
			authContext: authContext,
			userInfo: userInfo
		});
	});
};
