import {
	PseuplexApp,
	PseuplexMetadataProvider,
	PseuplexPlugin,
	PseuplexRequestContext
} from '../../pseuplex';
import {
	PasswordLockPluginConfig,
} from './config';
import { PasswordLockMetadataProvider } from './metadata';

export interface PasswordLockPluginDef extends PseuplexPlugin {
	readonly app: PseuplexApp;
	readonly metadata: PasswordLockMetadataProvider;

	get config(): PasswordLockPluginConfig;
	get basePath(): string;
} 
