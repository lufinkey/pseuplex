
export type PlexPlayQueueURIParts = {
	protocol?: string | undefined; // "server",
	machineIdentifier?: string | undefined;
	sourceIdentifier?: string | undefined; // "com.plexapp.plugins.library"
	path?: string | undefined;
};

export const parsePlayQueueURI = (uri: string): PlexPlayQueueURIParts => {
	// parse protocol
	const protocolIndex = uri.indexOf('://');
	let protocol: string | undefined;
	let startIndex: number;
	if(protocolIndex == -1) {
		if(uri.startsWith('/')) {
			return {path:uri};
		}
		protocol = undefined;
		startIndex = 0;
	} else {
		protocol = uri.substring(0, protocolIndex);
		startIndex = protocolIndex+3;
	}
	// parse machine id
	let slashIndex = uri.indexOf('/', startIndex);
	if(slashIndex == -1) {
		return {
			protocol,
			machineIdentifier: uri.substring(startIndex)
		};
	}
	const machineIdentifier = uri.substring(startIndex, slashIndex);
	// parse source ID
	startIndex = slashIndex+1;
	slashIndex = uri.indexOf('/', startIndex);
	if(slashIndex == -1) {
		return {
			protocol,
			machineIdentifier,
			sourceIdentifier: uri.substring(startIndex)
		};
	}
	const sourceIdentifier = uri.substring(startIndex, slashIndex);
	// parse path
	const path = uri.substring(slashIndex);
	return {
		protocol,
		machineIdentifier,
		sourceIdentifier,
		path
	};
};

export const stringifyPlayQueueURIParts = (uriParts: PlexPlayQueueURIParts): string => {
	let uri: string;
	if(uriParts.protocol != null) {
		uri = uriParts.protocol + '://';
	} else if(uriParts.machineIdentifier != null) {
		uri = '/';
	} else {
		return uriParts.path!;
	}
	uri += uriParts.machineIdentifier;
	if(uriParts.sourceIdentifier == null) {
		return uri;
	}
	uri += '/';
	uri += uriParts.sourceIdentifier;
	if(uriParts.path != null) {
		if(!uriParts.path.startsWith('/')) {
			uri += '/';
		}
		uri += uriParts.path;
	}
	return uri;
};
