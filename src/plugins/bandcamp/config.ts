
import { PseuplexConfigBase } from '../../pseuplex/configbase';

type BandcampFlags = {
	BandcampPlugin?: {
		enabled?: boolean;
	}
};
type BandcampPerUserPluginConfig = {
	//
} & BandcampFlags;
export type BandcampPluginConfig = PseuplexConfigBase<BandcampPerUserPluginConfig> & BandcampFlags & {
	//
};
