import { PseuplexConfigBase } from '../../pseuplex/configbase';
import {
	JustWatchTitle,
	JustWatchObjectType,
	JustWatchSortBy,
	JustWatchCountry,
	JustWatchLanguage,
	JustWatchPopularTitlesResponse,
	JustWatchSingleTitleResponse,
	JustWatchPopularTitlesVariables,
	JustWatchEdge
} from './apitypes';

// Re-export the main types for backward compatibility
export {
	JustWatchTitle,
	JustWatchObjectType,
	JustWatchSortBy,
	JustWatchCountry,
	JustWatchLanguage,
	JustWatchEdge,
	JustWatchPopularTitlesResponse as JustWatchResponse,
	JustWatchSingleTitleResponse,
	JustWatchPopularTitlesVariables as JustWatchQueryVariables
} from './apitypes';

export type JustWatchHubConfig = {
	title?: string;
	first?: number;
	objectType?: JustWatchObjectType;
	packages?: string[];
	language?: JustWatchLanguage;
	country?: JustWatchCountry;
	popularTitlesSortBy?: JustWatchSortBy;
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
