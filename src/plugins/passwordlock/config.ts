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
		instructionsItemTitle?: string;
		instructionsItemSummary?: string;
		loginSuccessItemUUID?: string;
		loginFailureDelay?: number;
	}
};
