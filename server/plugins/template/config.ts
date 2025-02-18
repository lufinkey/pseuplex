
import { PseuplexConfigBase } from '../../pseuplex';

type TemplateFlags = {
	templatePlugin?: {
		enabled?: boolean;
	}
};
type TemplatePerUserPluginConfig = {
	//
} & TemplateFlags;
export type TemplatePluginConfig = PseuplexConfigBase<TemplatePerUserPluginConfig> & TemplateFlags & {
	//
};
