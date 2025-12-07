import {
	PseuplexApp,
	PseuplexPlugin,
	PseuplexRequestContext,
} from '../../pseuplex';
import {
	RequestsPluginConfig,
} from './config';

export interface RequestsPluginDef extends PseuplexPlugin {
	app: PseuplexApp;
	config: RequestsPluginConfig;

	requestsEnabledForContext(context: PseuplexRequestContext): boolean | undefined;
	requestableSeasonsEnabledForContext(context: PseuplexRequestContext): boolean | undefined;
	partiallyAvailableOverlayEnabledForContext(context: PseuplexRequestContext): boolean | undefined;
} 
