
export enum PseuplexMetadataSource {
	Plex = 'plex',
	Letterboxd = 'letterboxd'
};

export type PseuplexMetadataID = {
	source: PseuplexMetadataSource;
	basePath?: string;
	id: string;
};

export const parseMetadataID = (idString: string) => {
	const colonIndex = idString.indexOf(':');
	if(colonIndex === -1) {
		// ID is a plex ID
		return {
			source: PseuplexMetadataSource.Plex,
			id: idString
		};
	}
	const lastColonIndex = idString.lastIndexOf(':');
	if(lastColonIndex === colonIndex) {
		// format was source:ID
		return {
			source: idString.substring(0, colonIndex),
			id: idString.substring(colonIndex+1)
		};
	}
	// format was source:basePath:ID
	return {
		source: idString.substring(0, colonIndex),
		basePath: idString.substring(colonIndex+1, lastColonIndex),
		id: idString.substring(lastColonIndex+1)
	};
};

export const stringifyMetadataID = (id: PseuplexMetadataID) => {
	if(!id.basePath) {
		return `${id.source}:${id.id}`;
	}
	return `${id.source}:${id.basePath}:${id.id}`;
};
