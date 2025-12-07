import qs from 'querystring';
import * as plexTypes from './types';
import { httpError } from '../utils/error';

export type PlexSingularMetadataKeyParts = {
	basePath: string;
	id: string;
	relativePath?: string;
};

export type PlexPluralMetadataKeyParts = {
	basePath: string;
	ids: string[];
	relativePath?: string;
};

export const PlexLibraryMetadataBasePath = '/library/metadata';


const parseRawPlexMetadataKeyOrThrow = (metadataKey: string, basePath: string): PlexSingularMetadataKeyParts => {
	if(!metadataKey) {
		throw httpError(400, `Invalid empty metadata key`);
	}
	if(!metadataKey.startsWith(basePath)) {
		throw httpError(400, `Unrecognized metadata key ${metadataKey}`);
	}
	if(metadataKey.length == basePath.length) {
		throw httpError(400, `Metadata key is the same as the base path ${metadataKey}`);
	}
	let idStartIndex = basePath.length;
	if(!basePath.endsWith('/')) {
		if(metadataKey[basePath.length] != '/') {
			throw httpError(400, `Unrecognized metadata key ${metadataKey}`);
		}
		idStartIndex += 1;
	}
	const parsedBasePath = metadataKey.slice(0, idStartIndex);
	const slashIndex = metadataKey.indexOf('/', idStartIndex);
	if(slashIndex == -1) {
		const idString = metadataKey.substring(idStartIndex);
		return {
			basePath: parsedBasePath,
			id: idString
		};
	}
	const idString = metadataKey.substring(idStartIndex, slashIndex);
	return {
		basePath: parsedBasePath,
		id: idString,
		relativePath: metadataKey.substring(slashIndex)
	};
};

export const parsePlexMetadataKeyOrThrow = (metadataKey: string): PlexSingularMetadataKeyParts => {
	return parseRawPlexMetadataKeyOrThrow(metadataKey, PlexLibraryMetadataBasePath);
};

export const parsePlexMetadataKey = (metadataKey: string, warnOnFailure: boolean = true): PlexSingularMetadataKeyParts | null => {
	try {
		return parsePlexMetadataKeyOrThrow(metadataKey);
	} catch(error) {
		if(warnOnFailure) {
			console.warn((error as Error).message);
		}
		return null;
	}
};

export const parsePlexPluralMetadataKeyOrThrow = (metadataKey: string): PlexPluralMetadataKeyParts => {
	const rawMetadataKeyParts = parseRawPlexMetadataKeyOrThrow(metadataKey, PlexLibraryMetadataBasePath);
	const ids = rawMetadataKeyParts.id.split(',');
	const pluralKeyParts = (rawMetadataKeyParts as Partial<PlexPluralMetadataKeyParts>);
	delete (rawMetadataKeyParts as Partial<typeof rawMetadataKeyParts>).id;
	pluralKeyParts.ids = ids;
	return pluralKeyParts as PlexPluralMetadataKeyParts;
};

export const parsePlexPluralMetadataKey = (metadataKey: string, warnOnFailure: boolean = true): PlexPluralMetadataKeyParts | null => {
	try {
		return parsePlexPluralMetadataKeyOrThrow(metadataKey);
	} catch(error) {
		if(warnOnFailure) {
			console.warn((error as Error).message);
		}
		return null;
	}
};

export type PlexMetadataGuidParts = {
	protocol: plexTypes.PlexMetadataGuidProtocol | string;
	type?: plexTypes.PlexMediaItemType | string;
	id: string;
	relativePath?: string;
};

export const parsePlexMetadataGuidOrThrow = (guid: string): PlexMetadataGuidParts => {
	if(!guid) {
		throw httpError(400, "Invalid empty guid");
	}
	// parse protocol
	const protocolEndIndex = guid.indexOf('://');
	if(protocolEndIndex == -1) {
		throw httpError(400, `Invalid guid ${guid} has no protocol`);
	}
	const protocol = guid.slice(0, protocolEndIndex);
	const pathStartIndex = protocolEndIndex+3;
	// try to find a slash that divides the type and ID
	const typeEndIndex = guid.indexOf('/', pathStartIndex);
	if(typeEndIndex == -1) {
		// there is no slash, so remaining path is just the ID
		// protocol://id
		return {
			protocol,
			id: guid.slice(pathStartIndex)
		};
	}
	else if(typeEndIndex == guid.length-1) {
		// ends in a slash, so just set a relative path and no "type"
		// protocol://id/
		return {
			protocol,
			id: guid.slice(pathStartIndex, typeEndIndex),
			relativePath: guid.slice(typeEndIndex),
		};
	}
	// got type
	const type = guid.slice(pathStartIndex, typeEndIndex);
	// find any other slashes in the remaining path
	const idStartIndex = typeEndIndex+1;
	const idEndIndex = guid.indexOf('/', idStartIndex);
	if(idEndIndex == -1) {
		// protocol://type/id
		return {
			protocol,
			type,
			id: guid.slice(idStartIndex)
		};
	}
	// split relative path
	const id = guid.slice(idStartIndex, idEndIndex);
	const relativePath = guid.slice(idEndIndex);
	// protocol://type/id/relativepath
	return {
		protocol,
		type,
		id,
		relativePath
	};
};

export const parsePlexMetadataGuid = (guid: string, warnOnFailure = true): PlexMetadataGuidParts | null => {
	try {
		return parsePlexMetadataGuidOrThrow(guid);
	} catch(error) {
		if(warnOnFailure) {
			console.warn((error as Error).message);
		}
		return null;
	}
};

export const parsePlexExternalGuids = (guids: plexTypes.PlexGuid[]): {[source: string]: string} => {
	const ids: {[source: string]: string} = {};
	if(guids) {
		for(const guid of guids) {
			const delimiterIndex = guid.id?.indexOf('://') ?? -1;
			if(delimiterIndex != -1) {
				ids[guid.id.substring(0, delimiterIndex)] = guid.id.substring(delimiterIndex+3);
			}
		}
	}
	return ids;
};

const libraryPathSegment = '/library';

export const plexLibraryMetadataPathToHubsMetadataPath = (metadataPath: string) => {
	const metadataIndex = metadataPath.search(/\/metadata(\/|$)/);
	if(metadataIndex == -1) {
		return metadataPath;
	}
	const libraryStartIndex = metadataIndex - libraryPathSegment.length;
	if(libraryStartIndex >= 0 && metadataPath.slice(libraryStartIndex, libraryStartIndex+libraryPathSegment.length) == libraryPathSegment) {
		metadataPath = `${metadataPath.slice(0, libraryStartIndex)}/hubs${metadataPath.slice(metadataIndex)}`;
	} else {
		metadataPath = `${metadataPath.slice(0, metadataIndex)}/hubs${metadataPath.slice(metadataIndex)}`;
	}
	return metadataPath;
};
