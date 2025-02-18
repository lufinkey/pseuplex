import * as plexTypes from '../../plex/types';
import {
	PseuplexHub,
	PseuplexRequestContext,
	PseuplexSectionBase,
	PseuplexSectionOptions
} from '../../pseuplex';
import { DashboardPluginDef } from './plugindef';

export class DashboardSection extends PseuplexSectionBase {
	readonly plugin: DashboardPluginDef;

	constructor(plugin: DashboardPluginDef, options: PseuplexSectionOptions) {
		super(options);
		this.plugin = plugin;
	}

	async getTitle(context: PseuplexRequestContext): Promise<string> {
		const config = this.plugin.config;
		const title = config.perUser?.[context.plexUserInfo.email]?.dashboard?.title
			?? config.dashboard?.title;
		if(title != null) {
			return title;
		}
		return await super.getTitle(context);
	}

	async getPivots(): Promise<plexTypes.PlexPivot[]> {
		return [
			{
				id: plexTypes.PlexPivotID.Recommended,
				key: this.hubsPath,
				type: plexTypes.PlexPivotType.Hub,
				title: "Your Dashboard",
				context: plexTypes.PlexPivotContext.Discover,
				symbol: plexTypes.PlexSymbol.Star,
			}
		];
	}

	override async getHubs(params: plexTypes.PlexHubListPageParams, context: PseuplexRequestContext): Promise<PseuplexHub[]> {
		const hubConfigs = this.plugin.getDashboardHubsConfigForContext(context);
		const hubs: PseuplexHub[] = [];
		if(!hubConfigs) {
			return hubs;
		}
		for(const hubConfig of hubConfigs) {
			try {
				const plugin = this.plugin.app.plugins[hubConfig.plugin];
				if(!plugin) {
					//throw new Error(`No plugin with slug ${hubConfig.plugin}`);
					continue;
				}
				const hubProvider = plugin.hubs?.[hubConfig.hub];
				if(!hubProvider) {
					//throw new Error(`No hub with slug ${hubConfig.hub}`);
					continue;
				}
				const hub = await hubProvider.get(hubConfig.arg);
				if(!hub) {
					//throw new Error(`No hub from arg ${hubConfig.arg}`);
					continue;
				}
				hubs.push(hub);
			} catch(error) {
				console.error(`Hub ${hubConfig.hub} ${hubConfig.arg ? `(${hubConfig.arg}) ` : ''}) from plugin ${hubConfig.plugin} failed:`);
				console.error(error);
			}
		}
		return hubs;
	}

	override async getPromotedHubs(params: plexTypes.PlexHubListPageParams, context: PseuplexRequestContext): Promise<PseuplexHub[]> {
		return (await this.getHubs?.(params, context)) ?? [];
	}
}
