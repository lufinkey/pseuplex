import { LoggingOptions } from './logging';

export type CommandArguments = {
	configPath?: string,
	verbose?: boolean,
	verboseHttpTraffic?: boolean,
	verboseWsTraffic?: boolean,
	noInstallPlugins?: boolean,
	installPluginsAndExit?: boolean,
} & LoggingOptions;

enum CmdFlag {
	configPath = '--config',
	installPluginsAndExit = '--install-plugins-and-exit',
	noInstallPlugins = '--no-install-plugins',
	logTimestamps = '--log-timestamps',
	logLogLevel = '--log-loglevel',
	logPlexTokenInfo = '--log-plex-tokens',
	logWatchedPaths = '--log-watched-paths',
	logOutgoingRequests = '--log-outgoing-requests',
	logUserRequests = '--log-user-requests',
	logUserRequestHeaders = '--log-user-request-headers',
	logUserResponses = '--log-user-responses',
	logUserResponseHeaders = '--log-user-response-headers',
	logUserResponseBody = '--log-user-response-body',
	logUnsecureUserRequests = '--log-unsecure-user-requests',
	logProxyRequests = '--log-proxy-requests',
	logProxyRequestHeaders = '--log-proxy-request-headers',
	logProxyResponses = '--log-proxy-responses',
	logProxyResponseHeaders = '--log-proxy-response-headers',
	logProxyResponseBody = '--log-proxy-response-body',
	logProxyErrorResponseBody = '--log-proxy-response-body',
	logWebsocketErrors = '--log-websocket-errors',
	logWebsocketConnections = '--log-websocket-connections',
	logSentNotifications = '--log-sent-notifications',
	logAdminNotifications = '--log-admin-notifications',
	logOverseerrUsers = '--log-overseerr-users',
	verbose = '--verbose',
	verboseHttpTraffic = '--verbose-http-traffic',
	verboseWsTraffic = '--verbose-ws-traffic',
	verboseTraffic = '--verbose-traffic',
}

const ArgsWithValues: Set<CmdFlag> = new Set([
	CmdFlag.configPath
]);

export const parseCmdArgs = (args: string[]): CommandArguments => {
	var parsedArgs: CommandArguments = {};
	for(let i=0; i<args.length; i++) {
		const arg = args[i];
		// check if argument is a flag
		if(arg.startsWith("-")) {
			// parse flag
			const eqIndex = arg.indexOf('=');
			let flag;
			let flagVal;
			if (eqIndex == -1) {
				flag = arg;
				if(ArgsWithValues.has(flag)) {
					i++;
					if (i < args.length) {
						flagVal = args[i];
					} else {
						throw new Error(`Missing value for flag ${flag}`);
					}
				} else {
					flagVal = undefined;
				}
			} else {
				flag = arg.substring(0, eqIndex);
				flagVal = arg.substring(eqIndex+1);
			}
			// handle flag
			switch (flag) {
				case CmdFlag.configPath:
					if(!flagVal) {
						throw new Error(`Missing value for flag ${arg}`);
					}
					parsedArgs.configPath = flagVal;
					break;

				case CmdFlag.noInstallPlugins:
					parsedArgs.noInstallPlugins = true;
					break;

				case CmdFlag.installPluginsAndExit:
					parsedArgs.installPluginsAndExit = true;
					break;

				case CmdFlag.logTimestamps:
					parsedArgs.logTimestamps = true;
					break;

				case CmdFlag.logLogLevel:
					parsedArgs.logLogLevel = true;
					break;

				case CmdFlag.logPlexTokenInfo:
					parsedArgs.logPlexTokenInfo = true;
					break;

				case CmdFlag.logWatchedPaths:
					parsedArgs.logWatchedPaths = true;
					break;
				
				case CmdFlag.logOutgoingRequests:
					parsedArgs.logOutgoingRequests = true;
					break;

				case CmdFlag.logUserRequests:
					parsedArgs.logUserRequests = true;
					break;

				case CmdFlag.logUserRequestHeaders:
					parsedArgs.logUserRequestHeaders = true;
					break;
				
				case CmdFlag.logUserResponses:
					parsedArgs.logUserResponses = true;
					break;

				case CmdFlag.logUserResponseHeaders:
					parsedArgs.logUserResponseHeaders = true;
					break;
				
				case CmdFlag.logUserResponseBody:
					parsedArgs.logUserResponseBody = true;
					break;

				case CmdFlag.logUnsecureUserRequests:
					parsedArgs.logUnsecureUserRequests = true;
					break;
				
				case CmdFlag.logProxyRequests:
					parsedArgs.logProxyRequests = true;
					break;

				case CmdFlag.logProxyRequestHeaders:
					parsedArgs.logProxyRequestHeaders = true;
					break;
				
				case CmdFlag.logProxyResponses:
					parsedArgs.logProxyResponses = true;
					break;

				case CmdFlag.logProxyResponseHeaders:
					parsedArgs.logProxyResponseHeaders = true;
					break;
				
				case CmdFlag.logProxyResponseBody:
					parsedArgs.logProxyResponseBody = true;
					break;
				
				case CmdFlag.logProxyErrorResponseBody:
					parsedArgs.logProxyErrorResponseBody = true;
					break;

				case CmdFlag.logWebsocketConnections:
					parsedArgs.logWebsocketConnections = true;
					break;

				case CmdFlag.logWebsocketErrors:
					parsedArgs.logWebsocketErrors = true;
					break;

				case CmdFlag.logSentNotifications:
					parsedArgs.logSentPlexNotifications = true;
					break;

				case CmdFlag.logAdminNotifications:
					parsedArgs.logAdminNotificationsFromServer = true;
					break;

				case CmdFlag.logOverseerrUsers:
					parsedArgs.logOverseerrUserMatches = true;
					parsedArgs.logOverseerrUserMatchFailures = true;
					parsedArgs.logOverseerrUsers = true;
					break;
				
				case CmdFlag.verbose:
					parsedArgs.verbose = true;
					parsedArgs.logDebug = true;
					parsedArgs.logUserRequests = true;
					parsedArgs.logUserResponses = true;
					break;

				case CmdFlag.verboseHttpTraffic:
					parsedArgs.verboseHttpTraffic = true;
					parsedArgs.logFullURLs = true;
					parsedArgs.logOutgoingRequests = true;
					parsedArgs.logUserRequests = true;
					parsedArgs.logUserRequestHeaders = true;
					parsedArgs.logUserResponses = true;
					parsedArgs.logUserResponseHeaders = true;
					parsedArgs.logUserResponseBody = true;
					//parsedArgs.logRequestPathMappings = true;
					parsedArgs.logProxyRequests = true;
					parsedArgs.logProxyRequestHeaders = true;
					parsedArgs.logProxyResponses = true;
					parsedArgs.logProxyResponseHeaders = true;
					//parsedArgs.logProxyResponseBody = true;
					parsedArgs.logProxyErrorResponseBody = true;
					break;

				case CmdFlag.verboseWsTraffic:
					parsedArgs.verboseWsTraffic = true;
					parsedArgs.logFullURLs = true;
					parsedArgs.logWebsocketConnections = true;
					parsedArgs.logWebsocketErrors = true;
					parsedArgs.logAdminNotificationsFromServer = true;
					parsedArgs.logSentPlexNotifications = true;
					break;

				case CmdFlag.verboseTraffic:
					parsedArgs.logFullURLs = true;
					parsedArgs.verboseHttpTraffic = true;
					parsedArgs.logOutgoingRequests = true;
					parsedArgs.logUserRequests = true;
					parsedArgs.logUserRequestHeaders = true;
					parsedArgs.logUserResponses = true;
					parsedArgs.logUserResponseHeaders = true;
					parsedArgs.logUserResponseBody = true;
					//parsedArgs.logRequestPathMappings = true;
					parsedArgs.logProxyRequests = true;
					parsedArgs.logProxyRequestHeaders = true;
					parsedArgs.logProxyResponses = true;
					parsedArgs.logProxyResponseHeaders = true;
					//parsedArgs.logProxyResponseBody = true;
					parsedArgs.logProxyErrorResponseBody = true;
					parsedArgs.verboseWsTraffic = true;
					parsedArgs.logWebsocketConnections = true;
					parsedArgs.logWebsocketErrors = true;
					parsedArgs.logAdminNotificationsFromServer = true;
					parsedArgs.logSentPlexNotifications = true;
					break;
				
				default:
					throw new Error(`Unrecognized argument ${arg}`);
			}
		} else {
			throw new Error(`Unrecognized argument ${arg}`);
		}
	}
	return parsedArgs;
};
