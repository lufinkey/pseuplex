
import qs from 'querystring';

export enum PseuplexMetadataSource {
	Plex = 'plex',
	Letterboxd = 'letterboxd'
};

export type PseuplexMetadataIDParts = {
	isURL?: undefined;
	source?: undefined;
	directory?: undefined;
	id: string;
	relativePath?: undefined;
} | {
	isURL: boolean;
	source: PseuplexMetadataSource;
	directory?: string;
	id: string;
	relativePath?: string;
};

export type PseuplexMetadataIDString =
	`${string}`
	| `${string}:${string}`
	| `${string}:${string}:${string}`
	| `${PseuplexMetadataSource}://${string}`
	| `${PseuplexMetadataSource}://${string}/${string}`;

export const parseMetadataID = (idString: PseuplexMetadataIDString) => {
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
	let needsUnescape: boolean;
	let isURL: boolean;
	if(idString[delimiterIndex+1] == '/' && idString[delimiterIndex+2] == '/') {
		// ID is ://
		startIndex = delimiterIndex+3;
		delimiter = '/';
		needsUnescape = false;
		isURL = true;
	} else {
		// ID is source:directory:ID or source:ID
		startIndex = delimiterIndex+1;
		delimiter = ':';
		needsUnescape = true;
		isURL = false;
	}
	// parse directory
	delimiterIndex = idString.indexOf(delimiter, startIndex);
	if(delimiterIndex == -1) {
		// format was source:ID or source://ID
		let id: string;
		let relativePath: string | undefined;
		if(isURL) {
			id = idString.substring(startIndex);
			relativePath = undefined;
		} else {
			delimiterIndex = idString.indexOf('/', startIndex);
			if(delimiterIndex == -1) {
				id = id.substring(startIndex);
				relativePath = undefined;
			} else {
				id = id.substring(startIndex, delimiterIndex);
				relativePath = id.substring(delimiterIndex);
			}
		}
		if(needsUnescape) {
			id = qs.unescape(id);
		}
		return {
			isURL,
			source: source,
			id: id,
			relativePath
		};
	}
	let directory = idString.substring(startIndex, delimiterIndex);
	if(needsUnescape) {
		directory = qs.unescape(directory);
	}
	// parse id and relative path
	startIndex = delimiterIndex+1;
	delimiterIndex = idString.indexOf('/', startIndex);
	let id: string;
	let relativePath: string | undefined;
	if(delimiterIndex == -1) {
		id = idString.substring(startIndex);
		relativePath = undefined;
	} else {
		id = idString.substring(startIndex, delimiterIndex);
		relativePath = idString.substring(delimiterIndex);
	}
	// format was source:basePath:ID
	return {
		isURL,
		source: source,
		directory: directory,
		id: id,
		relativePath: relativePath
	};
};

export const stringifyMetadataID = (idParts: PseuplexMetadataIDParts) => {
	let idString: string;
	if(idParts.isURL) {
		if(idParts.directory == null) {
			idString = `${idParts.source}://${idParts.id}`;
		} else {
			idString = `${idParts.source}://${idParts.directory}/${idParts.id}`;
		}
	} else {
		if(idParts.source == null) {
			return idParts.id;
		} else {
			if(idParts.directory == null) {
				idString = `${idParts.source}:${qs.escape(idParts.id)}`;
			} else {
				idString = `${idParts.source}:${qs.escape(idParts.directory)}/${qs.escape(idParts.id)}`;
			}
		}
	}
	if(idParts.relativePath != null) {
		idString += idParts.relativePath;
	}
	return idString;
};