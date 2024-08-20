
export const parseMetadataIDFromKey = (basePath: string, metadataKey: string | null | undefined): {id: string, relativePath?: string} | null => {
	if(!metadataKey) {
		return null;
	}
	if(!metadataKey.endsWith('/')) {
		metadataKey += '/';
	}
	if(!metadataKey.startsWith(basePath)) {
		console.warn(`Unrecognized metadata key ${metadataKey}`);
		return null;
	}
	const slashIndex = metadataKey.indexOf('/', basePath.length);
	if(slashIndex == -1) {
		return {
			id: metadataKey.substring(basePath.length)
		};
	}
	return {
		id: metadataKey.substring(basePath.length, slashIndex),
		relativePath: metadataKey.substring(slashIndex+1)
	};
};
