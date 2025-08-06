import { PseuplexConfigBase } from '../../pseuplex/configbase';

// Global JustWatch plugin configuration (for config.json)
type JustWatchFlags = {
	justwatch?: {
		enabled?: boolean;
		defaultCountry?: string;
		defaultLanguage?: string;
	}
};

type JustWatchPerUserPluginConfig = {
	//
} & JustWatchFlags;

export type JustWatchPluginConfig = PseuplexConfigBase<JustWatchPerUserPluginConfig> & JustWatchFlags & {
	//
};
