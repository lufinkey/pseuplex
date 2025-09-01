import { PseuplexConfigBase } from '../../pseuplex';

type PasswordLockFlags = {
	passwordLock?: {
		password?: string;
	}
};
type PasswordLockPerUserPluginConfig = {
	//
} & PasswordLockFlags;
export type PasswordLockPluginConfig = PseuplexConfigBase<PasswordLockPerUserPluginConfig> & PasswordLockFlags & {
	plex: {
		assumedTopSectionId?: string | number;
	}
	passwordLock?: {
		enabled?: boolean;
		autoWhitelistedNetmask?: string;
		authCachePath?: string;
		readableAuthCacheJson?: boolean;
		sectionID?: number;
		sectionUUID?: string;
		sectionTitle?: string;
		hubsPivotTitle?: string;
		introHubTitle?: string;
		instructionsItemTitle?: string;
		instructionsItemSummary?: string;
		loginSuccessItemUUID?: string;
		loginFailureDelay?: number;
	}
};
