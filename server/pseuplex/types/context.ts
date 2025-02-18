
import { PlexServerAccountInfo } from '../../plex/accounts';
import * as plexTypes from '../../plex/types';

export type PseuplexRequestContext = {
	plexServerURL: string;
	plexAuthContext: plexTypes.PlexAuthContext;
	plexUserInfo: PlexServerAccountInfo;
};
