import { PseuplexConfigBase } from '../../pseuplex';

type PasswordLockFlags = {
	passwordLock?: {
		password?: string;
		autoWhitelistNetmask?: string | string[];
	}
};
type PasswordLockPerUserPluginConfig = {
	passwordLock?: {
		overrideAutoWhitelistNetmask?: boolean;
	}
} & PasswordLockFlags;
export type PasswordLockPluginConfig = PseuplexConfigBase<PasswordLockPerUserPluginConfig> & PasswordLockFlags & {
	plex: {
		assumedTopSectionId?: string | number;
	}
	passwordLock?: {
		enabled?: boolean;
		authCachePath?: string;
		readableAuthCacheJson?: boolean;
		sectionID?: number;
		sectionUUID?: string;
		sectionTitle?: string;
		hubsPivotTitle?: string;
		introHubTitle?: string;
		instructionsItemUUID?: string;
		instructionsItemTitle?: string;
		instructionsItemSummary?: string;
		instructionsItemVideoId?: number;
		loginSuccessItemUUID?: string;
		loginFailureDelay?: number;
	}
};
