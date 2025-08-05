import { PseuplexConfigBase } from '../../pseuplex/configbase';

export type DashboardHubConfig = {
	plugin: string;
	hub: string;
	arg: string;
	position?: number; // Position where the hub should be inserted (0 = top, undefined = append at end)
};

export type DashboardSectionConfig = {
	enabled?: boolean;
	hubs: DashboardHubConfig[];
};

type DashboardFlags = {
	dashboard?: {
		enabled?: boolean;
		title?: string;
		hubs: DashboardHubConfig[],
	}
};

type DashboardPerUserPluginConfig = {
	//
} & DashboardFlags;

export type DashboardPluginConfig = PseuplexConfigBase<DashboardPerUserPluginConfig> & DashboardFlags & {
	// Section-specific configurations using section IDs as keys
	sections?: {
		[sectionId: string]: DashboardSectionConfig;
	};
	// Allow other config properties
	[key: string]: any;
};
