import fs from 'fs';
import type { SSLConfig } from './utils/ssl';
import type { IPv4NormalizeModeKey } from './utils/ip';
import type {
	PseuplexAppPerUserConfig,
	PseuplexConfigBase,
	PseuplexServerProtocol,
} from './pseuplex';
import type { LetterboxdPluginConfig } from './plugins/letterboxd/config';
import type { RequestsPluginConfig } from './plugins/requests/config';
import type { DashboardPluginConfig } from './plugins/dashboard/config';
import type { OverseerrRequestsPluginConfig } from './plugins/requests/providers/overseerr/config';
import type { LoggingOptions } from './logging';

export type Config = {
	protocol?: PseuplexServerProtocol,
	host?: string;
	port?: number;
	httpPort?: number;
	httpsPort?: number;
	ipv4ForwardingMode?: IPv4NormalizeModeKey;
	sendMetadataUnavailability?: boolean;
	forwardMetadataRefreshToPluginMetadata?: boolean;
	redirectPlexStreams?: boolean;
	imageOverlays?: {
		enabled?: boolean;
		overrides?: {[overlayName: string]: string};
	},
	remapMetadataIds?: boolean;
	plex: {
		host?: string;
		secureHost?: string;
		redirectHost?: string;
		secureRedirectHost?: string;
		token: string;
		processedMachineIdentifier?: string;
		appDataPath?: string;
		metadataHost?: string;
		notificationSocketRetryInterval?: number;
		overwritePrivatePort?: number | boolean;
	},
	ssl?: SSLConfig & {
		autoP12Path?: boolean;
		autoP12Password?: boolean;
		watchCertChanges?: boolean;
		certReloadDelay?: number;
	},
	logging?: LoggingOptions;
	plugins?: {
		[id: string]: string
	}
} & PseuplexConfigBase<PseuplexAppPerUserConfig>
	& LetterboxdPluginConfig
	& RequestsPluginConfig
	& DashboardPluginConfig
	& OverseerrRequestsPluginConfig;

export const readConfigFile = async (path: string): Promise<Config> => {
	const data = await fs.promises.readFile(path, 'utf8');
	const cfg: Config = JSON.parse(data);
	if(!cfg || typeof cfg !== 'object') {
		throw new Error("Invalid config file");
	}
	if(!cfg.perUser) {
		cfg.perUser = {};
	}
	return cfg;
};
