
export type PlexMetadataKeyParts = {
	basePath: string;
	id: string;
	relativePath?: string;
};

export const parseMetadataIDFromKey = (metadataKey: string | null | undefined, basePath: string): PlexMetadataKeyParts | null => {
	if(!metadataKey) {
		return null;
	}
	if(!basePath.endsWith('/')) {
		basePath += '/';
	}
	if(!metadataKey.startsWith(basePath)) {
		console.warn(`Unrecognized metadata key ${metadataKey}`);
		return null;
	}
	const slashIndex = metadataKey.indexOf('/', basePath.length);
	if(slashIndex == -1) {
		return {
			basePath,
			id: metadataKey.substring(basePath.length)
		};
	}
	return {
		basePath,
		id: metadataKey.substring(basePath.length, slashIndex),
		relativePath: metadataKey.substring(slashIndex)
	};
};
