
import express from 'express';

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

export const parsePlexQueryParams = (req: express.Request, includeParam: (key:string) => boolean): {[key:string]: any} => {
	const params: {[key:string]: any} = {};
	for(const key in req.query) {
		if(includeParam(key)) {
			params[key] = req.query[key];
		}
	}
	return params;
};
