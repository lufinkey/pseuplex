
import { CommandArguments } from "./cmdargs";

export const urlLogString = (args: CommandArguments, urlString: string) => {
	if(args.logFullURLs) {
		return urlString;
	}
	const queryIndex = urlString.indexOf('?');
	if(queryIndex != -1) {
		return urlString.substring(0, queryIndex);
	}
	return urlString;
};
