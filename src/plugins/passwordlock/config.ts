import { PseuplexConfigBase } from '../../pseuplex';

type PasswordLockFlags = {
	//
};
type PasswordLockPerUserPluginConfig = {
	//
} & PasswordLockFlags;
export type PasswordLockPluginConfig = PseuplexConfigBase<PasswordLockPerUserPluginConfig> & PasswordLockFlags & {
	passwordLock?: {
		enabled?: boolean;
		sectionUUID?: string;
		authCachePath?: string;
	}
};
