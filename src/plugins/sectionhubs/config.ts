import { PseuplexConfigBase } from '../../pseuplex/configbase';

export type SectionHubConfig = {
	plugin: string;
	hub: string;
	arg: string;
	position?: number; // Position where the hub should be inserted (0 = top, undefined = append at end)
};

export type SectionConfig = {
	enabled?: boolean;
	hubs: SectionHubConfig[];
};

type SectionHubsPerUserPluginConfig = {
	//
};

export type SectionHubsPluginConfig = PseuplexConfigBase<SectionHubsPerUserPluginConfig> & {
	// Section-specific configurations using section IDs as keys
	sections?: {
		[sectionId: string]: SectionConfig;
	};
	// Allow other config properties
	[key: string]: any;
};
