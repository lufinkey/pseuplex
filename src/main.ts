#!/usr/bin/env node --enable-source-maps
import tls from 'tls';
import sharp from 'sharp';
import fs from 'fs';
import * as constants from './constants';
import {
	Config,
	readConfigFile
} from './config';
import {
	CommandArguments,
	parseCmdArgs
} from './cmdargs';
import {
	SSLConfig,
	readSSLCertAndKey,
	watchSSLCertAndKeyChanges
} from './utils/ssl';
import { IPv4NormalizeMode } from './utils/ip';
import {
	includeLogLevelForAllLogs,
	includeTimestampsForAllLogs,
	includeTracesForConsoleWarnAndError,
	modConsoleColors,
} from './utils/console';
import { addProtocolToUrlIfMissing } from './utils/url';
import { getAppVersionString } from './utils/version';
import { RequestExecutor } from './fetching/RequestExecutor';
import { PseuplexApp } from './pseuplex';
import PasswordLockPlugin from './plugins/passwordlock';
import HideSectionsPlugin from './plugins/hidesections';
import LetterboxdPlugin from './plugins/letterboxd';
import RequestsPlugin from './plugins/requests';
import DashboardPlugin from './plugins/dashboard';
import {
	calculatePlexP12Password,
	findPlexP12Path,
	readPlexPreferences
} from './plex/config';
import { PlexPreferences } from './plex/types';
import { PlexClient } from './plex/client';
import { Logger, LoggingOptions } from './logging';
import { importPlugins, installPlugins } from './pluginload';

if(process.env.NODE_ENV !== 'production') {
	includeTracesForConsoleWarnAndError();
}
modConsoleColors();
sharp.concurrency(1);
sharp.cache(false);

let plexPrefs: PlexPreferences | undefined = undefined;
let cfg: Config;
let args: CommandArguments;

(async () => { try {
	const appVersionString = await getAppVersionString();
	console.log(`${constants.APP_NAME} ${appVersionString}\n`);
	console.log(`${(new Date()).toISOString()}`);

	// parse command line arguments
	args = parseCmdArgs(process.argv.slice(2));
	if(!args.configPath) {
		console.error("No config path specified");
		process.exit(1);
	}
	if(args.verbose) {
		console.log(`parsed arguments:\n${JSON.stringify(args, null, '\t')}\n`);
		process.env.DEBUG = '*';
	}
	if(args.logLogLevel) {
		includeLogLevelForAllLogs();
	}
	if(args.logTimestamps) {
		includeTimestampsForAllLogs();
	}

	// load config
	cfg = await readConfigFile(args.configPath);
	if (args.verbose) {
		console.log(`parsed config:\n${JSON.stringify(cfg, null, '\t')}\n`);
	}

	// create logger
	const loggingOptions: LoggingOptions = {...cfg.logging};
	for(const key of Object.keys(args)) {
		if(key.startsWith('log')) {
			const val = args[key];
			if(val != null) {
				loggingOptions[key] = val;
			}
		}
	}
	if(args.verbose) {
		console.log(`Logging options: ${JSON.stringify(loggingOptions, null, '\t')}`);
	}
	const logger = new Logger(loggingOptions);

	// only install plugins and exit if needed
	if(args.installPluginsAndExit) {
		if(!args.noInstallPlugins) {
			await installPlugins(cfg);
		}
		process.exit(0);
		return;
	}

	// define function to read plex prefs
	const readPlexPrefsIfNeeded = async () => {
		if(!plexPrefs) {
			plexPrefs = await readPlexPreferences({
				appDataPath: cfg.plex?.appDataPath
			});
		}
	};

	// get plex server urls
	let plexServerHost = cfg.plex.host;
	if(!plexServerHost) {
		console.error("Missing .plex.host in config");
		process.exit(1);
	}
	plexServerHost = addProtocolToUrlIfMissing(plexServerHost, 'http');
	let plexServerHostSecure = cfg.plex.secureHost;
	if(plexServerHostSecure) {
		plexServerHostSecure = addProtocolToUrlIfMissing(plexServerHostSecure, 'https');
	}

	// get plex server redirect urls
	let plexServerRedirectHost = cfg.plex.redirectHost;
	if(plexServerRedirectHost) {
		plexServerRedirectHost = addProtocolToUrlIfMissing(plexServerRedirectHost, 'http');
	}
	let plexServerRedirectHostSecure = cfg.plex.secureRedirectHost;
	if(plexServerRedirectHostSecure) {
		plexServerRedirectHostSecure = addProtocolToUrlIfMissing(plexServerRedirectHostSecure, 'https');
	}
	
	// initialize server SSL
	const sslConfig: SSLConfig = {
		p12Path: cfg.ssl?.p12Path,
		p12Password: cfg.ssl?.p12Password,
		certPath: cfg.ssl?.certPath,
		keyPath: cfg.ssl?.keyPath,
	};
	// auto-determine p12 path if needed
	if(cfg.ssl?.autoP12Path && (!sslConfig.p12Path || !fs.existsSync(sslConfig.p12Path))) {
		if(sslConfig.p12Path) {
			console.error(`Failed to find plex p12 certificate at ${sslConfig.p12Path}. Other paths will be searched.`);
		}
		let { appDataPath, appCachePath } = cfg.plex;
		if(!appDataPath) {
			// determine the path of plex's app data
			if(process.platform == 'win32') {
				// on windows, we can read plex's registry config to determine the appdata path
				await readPlexPrefsIfNeeded();
				if(plexPrefs!.LocalAppDataPath) {
					appDataPath = plexPrefs!.LocalAppDataPath;
				}
			}
		}
		sslConfig.p12Path = await findPlexP12Path({appDataPath,appCachePath});
		console.log(`Using plex p12 certificate path ${sslConfig.p12Path}`);
	}
	// calculate p12 password if needed
	if(sslConfig.p12Path && !sslConfig.p12Password && cfg.ssl?.autoP12Password) {
		// get plex ProcessedMachineIdentifier
		let plexMachineId = cfg.plex.processedMachineIdentifier;
		if(!plexMachineId) {
			await readPlexPrefsIfNeeded();
			plexMachineId = plexPrefs!.ProcessedMachineIdentifier;
		}
		sslConfig.p12Password = calculatePlexP12Password({ProcessedMachineIdentifier:plexMachineId});
	}

	// install and import plugins
	if(!args.noInstallPlugins) {
		await installPlugins(cfg);
	}
	const plugins = await importPlugins(cfg);

	// read SSL certificates, if any
	const sslCertData = await readSSLCertAndKey(sslConfig);

	// create server
	const pseuplex = new PseuplexApp({
		protocol: cfg.protocol,
		httpPort: cfg.httpPort ?? cfg.port,
		httpsPort: cfg.httpsPort ?? cfg.port,
		ipv4ForwardingMode: cfg.ipv4ForwardingMode ? IPv4NormalizeMode[cfg.ipv4ForwardingMode] : undefined,
		trustProxy: cfg.trustProxy,
		forwardMetadataRefreshToPluginMetadata: cfg.forwardMetadataRefreshToPluginMetadata,
		sendMetadataUnavailability: cfg.sendMetadataUnavailability,
		overwritePlexPrivatePort: cfg.plex.overwritePrivatePort,
		mapPseuplexMetadataIds: cfg.remapMetadataIds,
		tlsCertOptions: {
			...sslCertData
		},
		plexServerHost,
		plexServerHostSecure,
		plexServerRedirectHost,
		plexServerRedirectHostSecure,
		redirectPlexStreams: cfg.redirectPlexStreams,
		plexAdminAuthContext: {
			'X-Plex-Token': cfg.plex.token
		},
		plexMetadataClient: new PlexClient({
			requestOptions: {
				serverURL: cfg.plex.metadataHost || 'https://metadata.provider.plex.tv',
				authContext: {
					'X-Plex-Token': cfg.plex.token
				},
				logger,
			},
			requestExecutor: new RequestExecutor({
				maxParallelRequests: 5,
				occasionalDelayFrequency: 10,
			}),
		}),
		plexServerNotifications: {
			socketRetryInterval: cfg.plex?.notificationSocketRetryInterval,
		},
		overlaysEnabled: cfg.imageOverlays?.enabled,
		overlayImageOverrides: cfg.imageOverlays?.overrides,
		logger,
		plugins: [
			PasswordLockPlugin,
			HideSectionsPlugin,
			LetterboxdPlugin,
			RequestsPlugin,
			DashboardPlugin,
			...plugins,
		],
		config: cfg
	});

	// start server
	pseuplex.listen({
		onHttpListening: (port) => {
			console.log(`${constants.APP_NAME} is listening for http connections on port ${port}\n`);
		},
		onHttpsListening: (port) => {
			console.log(`${constants.APP_NAME} is listening for https connections on port ${port}\n`);
		},
		onHttpolyglotListening: (port) => {
			console.log(`${constants.APP_NAME} is listening for http and https connections on port ${port}\n`);
		},
	});

	// watch for certificate changes if this is an SSL server
	const secureServer = pseuplex.httpsServer || ((pseuplex.httpolyglotServer as any)?._tlsServer as tls.Server);
	if(cfg.ssl?.watchCertChanges && secureServer?.setSecureContext) {
		const watcher = watchSSLCertAndKeyChanges(sslConfig, {
			debounceDelay: (cfg.ssl?.certReloadDelay ?? 1000),
			logger,
		}, (sslCertData) => {
			try {
				console.log("\nUpdating SSL certificate");
				secureServer.setSecureContext(sslCertData);
			} catch(error) {
				console.error("Failed to set secure context:");
				console.error(error);
			}
		});
	}

} catch(error) {
	console.error(error);
	process.exit(2);
} })();
