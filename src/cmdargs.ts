
export type CommandArguments = {
	configPath?: string,
	logRequestPathMappings?: boolean,
	logFullURLs?: boolean,
	logPlexFuckery?: boolean,
	logOutgoingRequests?: boolean,
	logUserRequests?: boolean,
	logUserRequestHeaders?: boolean,
	logUserResponses?: boolean,
	logUserResponseHeaders?: boolean,
	logUserResponseBody?: boolean,
	logProxyRequests?: boolean,
	logProxyRequestHeaders?: boolean,
	logProxyResponses?: boolean,
	logProxyResponseHeaders?: boolean,
	logProxyResponseBody?: boolean,
	logProxyErrorResponseBody?: boolean,
	logWebsocketMessagesFromUser?: boolean,
	logWebsocketMessagesToUser?: boolean,
	logWebsocketMessagesFromServer?: boolean,
	logWebsocketMessagesToServer?: boolean,
	logWebsocketErrors?: boolean,
	verbose?: boolean,
	verboseHttpTraffic?: boolean,
	verboseWsTraffic?: boolean,
}

enum CmdFlag {
	configPath = '--config',
	logPlexFuckery = '--log-plex-fuckery',
	logOutgoingRequests = '--log-outgoing-requests',
	logUserRequests = '--log-user-requests',
	logUserRequestHeaders = '--log-user-request-headers',
	logUserResponses = '--log-user-responses',
	logUserResponseHeaders = '--log-user-response-headers',
	logUserResponseBody = '--log-user-response-body',
	logProxyRequests = '--log-proxy-requests',
	logProxyRequestHeaders = '--log-proxy-request-headers',
	logProxyResponses = '--log-proxy-responses',
	logProxyResponseHeaders = '--log-proxy-response-headers',
	logProxyResponseBody = '--log-proxy-response-body',
	logProxyErrorResponseBody = '--log-proxy-response-body',
	logWebsocketErrors = '--log-websocket-errors',
	logWebsocketFromUser = '--log-websocket-from-user',
	logWebsocketToUser = '--log-websocket-to-user',
	logWebsocketFromServer = '--log-websocket-from-server',
	logWebsocketToServer = '--log-websocket-to-server',
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

				case CmdFlag.logPlexFuckery:
					parsedArgs.logPlexFuckery = true;
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

				case CmdFlag.logWebsocketFromUser:
					parsedArgs.logWebsocketMessagesFromUser = true;
					break;

				case CmdFlag.logWebsocketToUser:
					parsedArgs.logWebsocketMessagesToUser = true;
					break;

				case CmdFlag.logWebsocketFromServer:
					parsedArgs.logWebsocketMessagesFromServer = true;
					break;

				case CmdFlag.logWebsocketToServer:
					parsedArgs.logWebsocketMessagesToServer = true;
					break;

				case CmdFlag.logWebsocketErrors:
					parsedArgs.logWebsocketErrors = true;
					break;
				
				case CmdFlag.verbose:
					parsedArgs.verbose = true;
					parsedArgs.logUserRequests = true;
					parsedArgs.logUserResponses = true;
					break;

				case CmdFlag.verboseHttpTraffic:
					parsedArgs.verboseHttpTraffic = true;
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
					parsedArgs.logWebsocketMessagesFromUser = true;
					parsedArgs.logWebsocketMessagesToUser = true;
					parsedArgs.logWebsocketMessagesFromServer = true;
					parsedArgs.logWebsocketMessagesToServer = true;
					parsedArgs.logWebsocketErrors = true;
					break;

				case CmdFlag.verboseTraffic:
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
					parsedArgs.verboseWsTraffic = true;
					parsedArgs.logWebsocketMessagesFromUser = true;
					parsedArgs.logWebsocketMessagesToUser = true;
					parsedArgs.logWebsocketMessagesFromServer = true;
					parsedArgs.logWebsocketMessagesToServer = true;
					parsedArgs.logWebsocketErrors = true;
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
