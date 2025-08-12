import { PseuplexConfigBase } from '../../../../pseuplex';

type OverseerPerUserPluginConfig = {
	//
};
export type OverseerrRequestsPluginConfig = PseuplexConfigBase<OverseerPerUserPluginConfig> & {
	overseerr: {
		host: string;
		apiKey: string;
	}
};
