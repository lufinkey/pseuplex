
export interface CommandArguments {
	configPath?: string,
	logRequestPathMappings?: boolean,
	logFullURLs?: boolean,
	logUserRequests?: boolean,
	logProxyRequests?: boolean,
	logProxyResponses?: boolean,
	logProxyResponseBody?: boolean,
	logUserResponses?: boolean,
	logUserResponseBody?: boolean,
	verbose?: boolean,
}

enum CmdFlag {
	configPath = '--config',
	logUserRequests = '--log-user-requests',
	logUserResponses = '--log-user-responses',
	logUserResponseBody = '--log-user-response-body',
	logProxyRequests = '--log-proxy-requests',
	logProxyResponses = '--log-proxy-responses',
	logProxyResponseBody = '--log-proxy-response-body',
	verbose = '--verbose'
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
				
				case CmdFlag.logProxyRequests:
					parsedArgs.logProxyRequests = true;
					break;
				
				case CmdFlag.logProxyResponses:
					parsedArgs.logProxyResponses = true;
					break;
				
				case CmdFlag.logProxyResponseBody:
					parsedArgs.logProxyResponseBody = true;
					break;
				
				case CmdFlag.logUserRequests:
					parsedArgs.logUserRequests = true;
					break;
				
				case CmdFlag.logUserResponses:
					parsedArgs.logUserResponses = true;
					break;
				
				case CmdFlag.logUserResponseBody:
					parsedArgs.logUserResponseBody = true;
					break;
				
				case CmdFlag.verbose:
					parsedArgs.verbose = true;
					//parsedArgs.logFullURLs = true;
					//parsedArgs.logRequestPathMappings = true;
					parsedArgs.logProxyRequests = true;
					parsedArgs.logProxyResponses = true;
					//parsedArgs.logProxyResponseBody = true;
					parsedArgs.logUserRequests = true;
					parsedArgs.logUserResponses = true;
					//parsedArgs.logUserResponseBody = true;
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
