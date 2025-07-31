
import qs from 'querystring';
import { plexLibraryMetadataPathToHubsMetadataPath } from '../plex/metadataidentifier';
import { PseuplexRelatedHubsSource } from './metadata';

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

export const parseMetadataID = (idString: PseuplexMetadataIDString): PseuplexMetadataIDParts => {
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

export const stringifyMetadataID = (idParts: PseuplexMetadataIDParts): PseuplexMetadataIDString => {
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

export type PseuplexPartialMetadataIDParts = {
	directory?: string;
	id: string;
};

export type PseuplexPartialMetadataIDString =
	`${string}`
	| `${string}:${string}`;

export const parsePartialMetadataID = (metadataId: PseuplexPartialMetadataIDString): PseuplexPartialMetadataIDParts => {
	let colonIndex = metadataId.indexOf(':');
	if(colonIndex == -1) {
		return {id:qs.unescape(metadataId)};
	}
	return {
		directory: qs.unescape(metadataId.substring(0, colonIndex)),
		id: metadataId.substring(colonIndex+1)
	};
};

export const stringifyPartialMetadataID = (idParts: PseuplexPartialMetadataIDParts): PseuplexPartialMetadataIDString => {
	if(idParts.directory == null) {
		return qs.escape(idParts.id);
	} else {
		return `${qs.escape(idParts.directory)}:${idParts.id}`;
	}
};

export const qualifyPartialMetadataID = (metadataId: PseuplexPartialMetadataIDString, source: string) => {
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
