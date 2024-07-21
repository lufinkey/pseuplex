
export interface Arguments {
	configPath?: string,
	logUserRequests?: boolean,
	logProxyRequests?: boolean,
	logProxyResponses?: boolean,
	logUserResponses?: boolean,
	verbose?: boolean
}

enum CmdFlag {
	configPath = '--config-path',
	logUserRequests = '--log-user-requests',
	logUserResponses = '--log-user-responses',
	logProxyRequests = '--log-proxy-requests',
	logProxyResponses = '--log-proxy-responses',
	verbose = '--verbose'
}

const ArgsWithValues: Set<CmdFlag> = new Set([
	CmdFlag.configPath
]);

export const parseCmdArgs = (args: string[]): Arguments => {
	var parsedArgs: Arguments = {};
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

				case CmdFlag.logUserRequests:
					parsedArgs.logUserRequests = true;
					break;

				case CmdFlag.logUserResponses:
					parsedArgs.logUserResponses = true;
					break;

				case CmdFlag.verbose:
					parsedArgs.verbose = true;
					parsedArgs.logProxyRequests = true;
					parsedArgs.logProxyResponses = true;
					parsedArgs.logUserRequests = true;
					parsedArgs.logUserResponses = true;
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
