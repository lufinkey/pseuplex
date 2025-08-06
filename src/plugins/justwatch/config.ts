import { PseuplexConfigBase } from '../../pseuplex/configbase';

export type JustWatchHubConfig = {
	first?: number;
	objectType?: 'MOVIE' | 'SHOW';
	packages?: string[];
	language?: string;
	country?: string;
	popularTitlesSortBy?: 'POPULAR' | 'RECENT';
	monetizationTypes?: string[];
	genres?: string[];
	excludeGenres?: string[];
};

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
