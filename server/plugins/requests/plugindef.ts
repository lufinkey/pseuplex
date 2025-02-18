import {
	PseuplexApp,
	PseuplexPlugin,
} from '../../pseuplex';
import {
	RequestsPluginConfig,
} from './config';

export interface RequestsPluginDef extends PseuplexPlugin {
	app: PseuplexApp;
	config: RequestsPluginConfig;
} 
