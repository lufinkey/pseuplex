
import * as plexTypes from './types';
import { httpError } from '../utils/error';

export type PlexMetadataKeyParts = {
	basePath: string;
	id: string;
	relativePath?: string;
};

export const parseMetadataIDFromKeyOrThrow = (metadataKey: string | null | undefined, basePath: string): PlexMetadataKeyParts | null => {
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
		return {
			basePath: parsedBasePath,
			id: metadataKey.substring(idStartIndex)
		};
	}
	return {
		basePath: parsedBasePath,
		id: metadataKey.substring(idStartIndex, slashIndex),
		relativePath: metadataKey.substring(slashIndex)
	};
};

export const parseMetadataIDFromKey = (metadataKey: string | null | undefined, basePath: string, warnOnFailure: boolean = true): PlexMetadataKeyParts | null => {
	try {
		return parseMetadataIDFromKeyOrThrow(metadataKey, basePath);
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
	id: string
};

export const parsePlexMetadataGuidOrThrow = (guid: string): PlexMetadataGuidParts => {
	if(!guid) {
		throw httpError(400, "Invalid empty guid");
	}
	// trim trailing slash
	if(guid.endsWith('/')) {
		guid = guid.substring(0, guid.length-1);
	}
	// parse protocol
	const protocolEndIndex = guid.indexOf('://');
	if(protocolEndIndex == -1) {
		throw httpError(400, `Invalid guid ${guid}`);
	}
	const protocol = guid.slice(0, protocolEndIndex);
	// split remaining path
	const remainingPath = guid.slice(protocolEndIndex+3);
	if(!remainingPath) {
		throw httpError(400, `Invalid guid ${guid}`);
	}
	const pathParts = remainingPath.split('/');
	if(pathParts.length > 2) {
		throw httpError(400, `Invalid guid ${guid}`);
	}
	// parse ID portion
	const id = pathParts[pathParts.length-1];
	if(!id) {
		throw httpError(400, `Invalid guid ${guid}`);
	}
	// parse type portion
	const type = pathParts.length > 1 ? pathParts[0] : undefined;
	// parse protocol
	return {
		protocol,
		type,
		id
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
