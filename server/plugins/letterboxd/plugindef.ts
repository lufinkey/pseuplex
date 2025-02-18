import {
	PseuplexApp,
	PseuplexPlugin,
} from '../../pseuplex';
import {
	LetterboxdPluginConfig,
} from './config';

export interface LetterboxdPluginDef extends PseuplexPlugin {
	app: PseuplexApp;
	config: LetterboxdPluginConfig;
} 
