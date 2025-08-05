import {
	PseuplexApp,
	PseuplexPlugin,
	PseuplexRequestContext
} from '../../pseuplex';
import {
	DashboardHubConfig,
	DashboardPluginConfig
} from './config';

export interface DashboardPluginDef extends PseuplexPlugin {
	app: PseuplexApp;
	config: DashboardPluginConfig;
	getDashboardHubsConfigForContext(context: PseuplexRequestContext): (DashboardHubConfig[] | null);
	getDashboardHubsConfigForSection(sectionId: string | number, context: PseuplexRequestContext): (DashboardHubConfig[] | null);
} 
