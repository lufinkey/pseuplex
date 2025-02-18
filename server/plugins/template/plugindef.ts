import {
	PseuplexApp,
	PseuplexPlugin,
	PseuplexRequestContext
} from '../../pseuplex';
import {
	TemplatePluginConfig,
} from './config';

export interface TemplatePluginDef extends PseuplexPlugin {
	app: PseuplexApp;
	config: TemplatePluginConfig;
} 
