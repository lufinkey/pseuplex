
import { PseuplexConfigBase } from '../../pseuplex/configbase';

type BandcampFlags = {
	//
};
type BandcampPerUserPluginConfig = {
	cookiesFile?: string;
} & BandcampFlags;
export type BandcampPluginConfig = PseuplexConfigBase<BandcampPerUserPluginConfig> & BandcampFlags & {
	//
};
