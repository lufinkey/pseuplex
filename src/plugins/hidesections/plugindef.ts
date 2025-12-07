import {
	PseuplexApp,
	PseuplexPlugin,
	PseuplexRequestContext
} from '../../pseuplex';
import {
	HideSectionsPluginConfig,
} from './config';

export interface HideSectionsPluginDef extends PseuplexPlugin {
	app: PseuplexApp;
	config: HideSectionsPluginConfig;
}
