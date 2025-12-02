
import qs from 'querystring';
import {
	parsePlexMetadataKeyOrThrow,
	parsePlexPluralMetadataKeyOrThrow,
	PlexLibraryMetadataBasePath,
	plexLibraryMetadataPathToHubsMetadataPath,
	PlexPluralMetadataKeyParts,
	PlexSingularMetadataKeyParts
} from '../plex/metadataidentifier';
import { PseuplexRelatedHubsSource } from './metadata';
import { PseuplexMetadataItem } from './types';


export type PseuplexMetadataIDParts = {
	isURL?: boolean;
	source?: string;
	directory?: string;
	id: string;
	relativePath?: string;
};

export type PseuplexMetadataIDString =
	`${string}`
	| `${string}:${string}`
	| `${string}:${string}:${string}`
	| `${string}://${string}`
	| `${string}://${string}/${string}`
	| `${string}://${string}/${string}${string}`;

export const parsePseuplexMetadataID = (idString: PseuplexMetadataIDString): PseuplexMetadataIDParts => {
	// find metadata source / protocol
	let delimiterIndex = idString.indexOf(':');
	if(delimiterIndex === -1) {
		// just an ID string
		return {
			id: idString
		};
	}
	const source = idString.substring(0, delimiterIndex);
	// check if link is a url
	let startIndex: number;
	let delimiter: string;
	let isURL: boolean;
	if(idString[delimiterIndex+1] == '/' && idString[delimiterIndex+2] == '/') {
		// ID is ://
		startIndex = delimiterIndex+3;
		delimiter = '/';
		isURL = true;
	} else {
		// ID is source:directory:ID or source:ID
		startIndex = delimiterIndex+1;
		delimiter = ':';
		isURL = false;
	}
	// parse directory
	delimiterIndex = idString.indexOf(delimiter, startIndex);
	if(delimiterIndex == -1) {
		// no delimiter, so format was source:ID or source://ID or source://ID?relativepath
		const remainingString = idString.substring(startIndex);
		let id: string;
		let relativePath: string | undefined;
		if(isURL) {
			// parse relative path if it exists (ie: trailing query)
			delimiterIndex = remainingString.search(/(\?|\#)/);
			if(delimiterIndex != -1) {
				// format was source://ID?relativepath
				id = remainingString.substring(0, delimiterIndex);
				relativePath = remainingString.substring(delimiterIndex); // "?key=value"
			} else {
				// format was source://ID
				id = remainingString;
				relativePath = undefined;
			}
		} else {
			// format was source:ID
			id = remainingString;
			relativePath = undefined;
		}
		return {
			isURL,
			source: source,
			id: qs.unescape(id),
			relativePath
		};
	}
	// directory component found,
	//  so format was source:directory:ID or source://directory/ID
	let directory = idString.substring(startIndex, delimiterIndex);
	directory = qs.unescape(directory);
	// parse id and relative path
	startIndex = delimiterIndex+1;
	const remainingStr = idString.substring(startIndex);
	let id: string;
	let relativePath: string | undefined = undefined;
	if(isURL) {
		delimiterIndex = remainingStr.search(/(\/|\?|\#)/);
		if(delimiterIndex != -1) {
			// format was source://directory/ID/relativepath
			id = remainingStr.substring(0, delimiterIndex);
			let relPathStartIndex = delimiterIndex;
			if(!isURL) {
				relPathStartIndex++;
			}
			relativePath = remainingStr.substring(relPathStartIndex);
		} else {
			// format was source://directory/ID
			id = remainingStr;
			relativePath = undefined;
		}
	} else {
		// no relativePath if not a url
		id = remainingStr;
	}
	return {
		isURL,
		source,
		directory,
		id: isURL ? qs.unescape(id) : id, // id is not escaped when non-URL (but components of ID might be parsed and unescaped separately)
		relativePath,
	};
};



export const unescapeMetadataIdStringIfNeeded = (metadataIdString: string): PseuplexMetadataIDString => {
	if(!metadataIdString) {
		return metadataIdString;
	}
	if(metadataIdString.indexOf(':') == -1 && metadataIdString.indexOf('%') != -1) {
		return qs.unescape(metadataIdString);
	}
	return metadataIdString;
};


export const parsePseuplexMetadataKeyOrThrow = (metadataKey: string): PlexSingularMetadataKeyParts => {
	const metadataKeyParts = parsePlexMetadataKeyOrThrow(metadataKey);
	// only unescape if the key is definitely not plural
	if(metadataKeyParts.id.indexOf(',') == -1) {
		if(metadataKeyParts.id.indexOf(':') == -1 && metadataKeyParts.id.indexOf('%') != -1) {
			metadataKeyParts.id = qs.unescape(metadataKeyParts.id);
			// TODO maybe log a warning if there's a comma after unescaping?
		}
	}
	return metadataKeyParts;
};

export const parsePseuplexMetadataKey = (metadataKey: string, warnOnFailure: boolean = true): (PlexSingularMetadataKeyParts | null) => {
	try {
		return parsePseuplexMetadataKeyOrThrow(metadataKey);
	} catch(error) {
		if(warnOnFailure) {
			console.warn((error as Error).message);
		}
		return null;
	}
};



export type PseuplexSingularMetadataKeyParts = {
	basePath: string;
	idParts: PseuplexMetadataIDParts;
	relativePath?: string;
};

export const parsePseuplexKeyAndIDOrThrow = (metadataKey: string): PseuplexSingularMetadataKeyParts => {
	const metadataKeyParts = parsePseuplexMetadataKeyOrThrow(metadataKey);
	const metadataIdString = metadataKeyParts.id;
	const pseuMetadataKeyParts = (metadataKeyParts as Partial<PseuplexSingularMetadataKeyParts>);
	delete (metadataKeyParts as Partial<typeof metadataKeyParts>).id;
	pseuMetadataKeyParts.idParts = parsePseuplexMetadataID(metadataIdString);
	return pseuMetadataKeyParts as PseuplexSingularMetadataKeyParts;
};

export const parsePseuplexMetadataKeyAndID = (metadataKey: string, warnOnFailure: boolean = true): (PseuplexSingularMetadataKeyParts | null) => {
	try {
		return parsePseuplexKeyAndIDOrThrow(metadataKey);
	} catch(error) {
		if(warnOnFailure) {
			console.warn((error as Error).message);
		}
		return null;
	}
};



export const parsePseuplexPluralMetadataKeyOrThrow = (metadataKey: string): PlexPluralMetadataKeyParts => {
	const metadataKeyParts = parsePlexPluralMetadataKeyOrThrow(metadataKey);
	metadataKeyParts.ids = metadataKeyParts.ids.map((idString) => {
		return unescapeMetadataIdStringIfNeeded(idString);
	});
	return metadataKeyParts;
};

export const parsePseuplexPluralMetadataKey = (metadataKey: string, warnOnFailure: boolean = true): (PlexPluralMetadataKeyParts | null) => {
	try {
		return parsePseuplexPluralMetadataKeyOrThrow(metadataKey);
	} catch(error) {
		if(warnOnFailure) {
			console.warn((error as Error).message);
		}
		return null;
	}
};



export type PsuplexPluralMetadataKeyParts = {
	basePath: string;
	idsParts: PseuplexMetadataIDParts[];
	relativePath?: string;
};

export const parsePseuplexMetadataKeyAndIDsOrThrow = (metadataKey: string): PsuplexPluralMetadataKeyParts => {
	const metadataKeyParts = parsePseuplexPluralMetadataKeyOrThrow(metadataKey);
	const metadataIdStrings = metadataKeyParts.ids;
	const pseuMetadataKeyParts = (metadataKeyParts as Partial<PsuplexPluralMetadataKeyParts>);
	delete (metadataKeyParts as Partial<typeof metadataKeyParts>).ids;
	pseuMetadataKeyParts.idsParts = metadataIdStrings.map((idString) => parsePseuplexMetadataID(idString));
	return pseuMetadataKeyParts as PsuplexPluralMetadataKeyParts;
};

export const parsePseuplexMetadataKeyAndIDs = (metadataKey: string, warnOnFailure: boolean = true): (PsuplexPluralMetadataKeyParts | null) => {
	try {
		return parsePseuplexMetadataKeyAndIDsOrThrow(metadataKey);
	} catch(error) {
		if(warnOnFailure) {
			console.warn((error as Error).message);
		}
		return null;
	}
};



export const parsePseuplexMetadataIDStringFromItem = (metadataItem: PseuplexMetadataItem, warnOnFailure: boolean = true): PseuplexMetadataIDString | null => {
	if(metadataItem.ratingKey) {
		return metadataItem.ratingKey;
	}
	const metadataKeyParts = parsePseuplexMetadataKey(metadataItem.key, warnOnFailure);
	if(metadataKeyParts) {
		return metadataKeyParts.id;
	}
	if(warnOnFailure) {
		console.warn(`No metadata ID could be found on metadata item ${metadataItem.title}`);
	}
	return null;
};

export const parsePseuplexMetadataIDFromItem = (metadataItem: PseuplexMetadataItem, warnOnFailure: boolean = true): PseuplexMetadataIDParts | null => {
	const metadataIdString = parsePseuplexMetadataIDStringFromItem(metadataItem, warnOnFailure);
	if(!metadataIdString) {
		return null;
	}
	return parsePseuplexMetadataID(metadataIdString);
};



export const stringifyPseuplexMetadataID = (idParts: PseuplexMetadataIDParts): PseuplexMetadataIDString => {
	let idString: string;
	if(idParts.isURL) {
		if(idParts.directory == null && idParts.relativePath == null) {
			idString = `${idParts.source}://${qs.escape(idParts.id)}`;
		} else {
			idString = `${idParts.source}://${qs.escape(idParts.directory ?? '')}/${qs.escape(idParts.id)}`;
		}
		if(idParts.relativePath != null) {
			idString += idParts.relativePath;
		}
	} else {
		if(idParts.source == null) {
			if(idParts.directory != null) {
				console.error(`Directory component won't be used when there is no source`);
			}
			return idParts.id;
		} else {
			if(idParts.directory == null && idParts.relativePath == null) {
				idString = `${idParts.source}:${qs.escape(idParts.id)}`;
			} else {
				idString = `${idParts.source}:${qs.escape(idParts.directory ?? '')}:${idParts.id}`;
			}
		}
		if(idParts.relativePath != null) {
			console.error(`Non-url cannot include relativePath ${JSON.stringify(idParts.relativePath)}`);
		}
	}
	return idString;
};

export const stringifyPseuplexMetadataKeyFromIDString = (idString: PseuplexMetadataIDString | number, relativePath?: string) => {
	const escMetadataId = qs.escape(idString.toString());
	let metadataKey = `${PlexLibraryMetadataBasePath}/${escMetadataId}`;
	if(relativePath) {
		metadataKey += relativePath;
	}
	return metadataKey;
};

export const stringifyPseuplexMetadataKeyFromIDStrings = (idStrings: (PseuplexMetadataIDString | number)[], relativePath?: string) => {
	const escMetadataIds = idStrings.map((idStr) => qs.escape(idStr.toString())).join(',');
	let metadataKey = `${PlexLibraryMetadataBasePath}/${escMetadataIds}`;
	if(relativePath) {
		metadataKey += relativePath;
	}
	return metadataKey;
}

export const stringifyPseuplexMetadataKeyAndID = (keyParts: PseuplexSingularMetadataKeyParts) => {
	const metadataId = stringifyPseuplexMetadataID(keyParts.idParts);
	let metadataKey = `${keyParts.basePath}/${qs.escape(metadataId)}`;
	if(keyParts.relativePath) {
		metadataKey += keyParts.relativePath;
	}
	return metadataKey;
};

export const stringifyPseuplexPluralMetadataKey = (keyParts: PlexPluralMetadataKeyParts) => {
	return `${keyParts.basePath}${keyParts.ids.map((mid) => qs.escape(mid)).join(',')}${keyParts.relativePath ?? ''}`;
};



export type PseuplexPartialMetadataIDParts = {
	directory?: string;
	id: string;
};

export type PseuplexPartialMetadataIDString =
	`${string}`
	| `${string}:${string}`;

export const parsePartialPseuplexMetadataID = (metadataId: PseuplexPartialMetadataIDString): PseuplexPartialMetadataIDParts => {
	let colonIndex = metadataId.indexOf(':');
	if(colonIndex == -1) {
		return {id:qs.unescape(metadataId)};
	}
	return {
		directory: qs.unescape(metadataId.substring(0, colonIndex)),
		id: metadataId.substring(colonIndex+1)
	};
};



export const stringifyPartialPseuplexMetadataID = (idParts: PseuplexPartialMetadataIDParts): PseuplexPartialMetadataIDString => {
	if(idParts.directory == null) {
		return qs.escape(idParts.id);
	} else {
		return `${qs.escape(idParts.directory)}:${idParts.id}`;
	}
};

export const qualifyPartialPseuplexMetadataID = (metadataId: PseuplexPartialMetadataIDString, source: string) => {
	return `${source}:${metadataId}`;
};



export const getPlexRelatedHubsEndpoints = (metadataEndpoint: string): {
	endpoint: string,
	hubsSource: PseuplexRelatedHubsSource,
}[] => {
	if(!metadataEndpoint.endsWith('/')) {
		metadataEndpoint += '/';
	}
	const endpoints = [{
		endpoint: metadataEndpoint + 'related',
		hubsSource: PseuplexRelatedHubsSource.Library,
	}];
	const hubsMetadataEndpoint = plexLibraryMetadataPathToHubsMetadataPath(metadataEndpoint);
	if(hubsMetadataEndpoint != metadataEndpoint) {
		endpoints.push({
			endpoint: hubsMetadataEndpoint + 'related',
			hubsSource: PseuplexRelatedHubsSource.Hubs,
		});
	}
	return endpoints;
};
