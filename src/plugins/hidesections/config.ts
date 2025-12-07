import { PseuplexConfigBase } from '../../pseuplex';

type HideSectionsFlags = {
	hideSections?: {
		ids: (number | string)[];
	}
};
type HideSectionsPerUserPluginConfig = {
	hideSections?: {
		override: boolean;
	}
} & HideSectionsFlags;
export type HideSectionsPluginConfig = PseuplexConfigBase<HideSectionsPerUserPluginConfig> & HideSectionsFlags & {
	//
};
