import { PseuplexConfigBase } from '../../pseuplex';

export type DashboardHubConfig = {
	plugin: string;
	hub: string;
	arg?: string;
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
export type DashboardPluginConfig = (PseuplexConfigBase<DashboardPerUserPluginConfig> & DashboardFlags & {
	dashboard?: {
		uuid?: string;
	}
});
