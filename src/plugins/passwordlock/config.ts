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
	passwordLock?: {
		enabled?: boolean;
		authCachePath?: string;
		sectionUUID?: string;
		sectionTitle?: string;
		hubsPivotTitle?: string;
		introHubTitle?: string;
		instructionsItemTitle?: string;
		instructionsItemSummary?: string;
		loginSuccessItemUUID?: string;
	}
};
