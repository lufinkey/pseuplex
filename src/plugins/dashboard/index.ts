
import express from 'express';
import * as plexTypes from '../../plex/types';
import { IncomingPlexAPIRequest } from '../../plex/requesthandling';
import {
	PseuplexApp,
	PseuplexPlugin,
	PseuplexPluginClass,
	PseuplexReadOnlyResponseFilters,
	PseuplexRequestContext,
	PseuplexSection
} from '../../pseuplex';
import { DashboardHubConfig, DashboardPluginConfig } from './config';
import { DashboardSection } from './section';
import { DashboardPluginDef } from './plugindef';

export default (class DashboardPlugin implements DashboardPluginDef, PseuplexPlugin {
	static slug = 'dashboard';
	readonly slug = DashboardPlugin.slug;
	readonly app: PseuplexApp;
	readonly section: DashboardSection;

	constructor(app: PseuplexApp) {
		this.app = app;
		this.section = new DashboardSection(this, {
			id: 'dashboard',
			uuid: this.config.dashboard?.uuid ?? '81596aaa-14b1-4b74-8433-ff564d3020ff',
			type: plexTypes.PlexMediaItemType.Mixed,
			title: "Dashboard",
			path: `${this.basePath}`,
			hubsPath: `${this.basePath}/hubs`,
		});
	}

	get basePath(): string {
		return `/${this.app.slug}/${this.slug}`;
	}

	get config(): DashboardPluginConfig {
		return this.app.config as DashboardPluginConfig;
	}

	responseFilters?: PseuplexReadOnlyResponseFilters = {
		//
	}

	defineRoutes(router: express.Express) {
		router.get(this.section.path, [
			this.app.middlewares.plexAuthentication,
			this.app.middlewares.plexRequestHandler(async (req: IncomingPlexAPIRequest, res) => {
				const context = this.app.contextForRequest(req);
				return await this.section.getSectionPage(context);
			}),
		]);

		router.get(this.section.hubsPath, [
			this.app.middlewares.plexAuthentication,
			this.app.middlewares.plexRequestHandler(async (req: IncomingPlexAPIRequest, res) => {
				const context = this.app.contextForRequest(req);
				const reqParams = req.plex.requestParams;
				return await this.section.getHubsPage(reqParams,context);
			}),
		]);
	}

	async hasSections(context: PseuplexRequestContext): Promise<boolean> {
		const hubsConfig = this.getDashboardHubsConfigForContext(context);
		return (hubsConfig?.length ?? 0) > 0;
	}

	async getSections(context: PseuplexRequestContext): Promise<PseuplexSection[]> {
		const hubsConfig = this.getDashboardHubsConfigForContext(context);
		if((hubsConfig?.length ?? 0) == 0) {
			return []
		}
		return [
			this.section
		];
	}



	getDashboardHubsConfigForContext(context: PseuplexRequestContext): (DashboardHubConfig[] | null) {
		const dashboardEnabled = this.config.perUser?.[context.plexUserInfo.email]?.dashboard?.enabled
			?? this.config.dashboard?.enabled;
		if(!dashboardEnabled) {
			return null;
		}
		const hubsConfig = this.config.perUser?.[context.plexUserInfo.email]?.dashboard?.hubs
			?? this.config.dashboard?.hubs;
		if(!hubsConfig || hubsConfig.length == 0) {
			return null;
		}
		return hubsConfig;
	}

} as PseuplexPluginClass);
