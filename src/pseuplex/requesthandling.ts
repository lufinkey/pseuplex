import qs from 'querystring';
import express from 'express';
import {
	handlePlexAPIRequest,
	IncomingPlexAPIRequest,
	PlexAPIRequestHandlerOptions
} from '../plex/requesthandling';
import {
	parsePseuplexMetadataID,
	PseuplexMetadataIDParts,
	PseuplexMetadataIDString,
} from './metadataidentifier';
import {
	PseuplexIDRemappings,
	PseuplexPrivateToPublicIDsMap
} from './idmappings';
import {
	asyncRequestHandler,
} from '../utils/requesthandling';
import {
	httpError,
} from '../utils/error';


export const parsePseuplexMetadataIDFromPathParam = (paramString: string): PseuplexMetadataIDParts => {
	// express automatically unescapes the path parameters, so no need to unescape here
	// TODO check if this logic works consistently. We might just want to check if we need to unescape anyways
	return parsePseuplexMetadataID(paramString);
};

export const parsePseuplexMetadataIDStringsFromPathParam = (idsString: string): PseuplexMetadataIDString[] => {
	// express automatically unescapes the path parameters, so no need to unescape here
	// TODO check if this logic works consistently. We might just want to check if we need to unescape anyways
	return idsString.split(',');
};

export const parsePseuplexMetadataIDsFromPathParam = (idsString: string): PseuplexMetadataIDParts[] => {
	return parsePseuplexMetadataIDStringsFromPathParam(idsString)
		.map((m) => parsePseuplexMetadataID(idsString));
};



export type PseuplexRemappedMetadataIdsRequest = IncomingPlexAPIRequest & {
	remappedPlexMetadataIds: PseuplexPrivateToPublicIDsMap;
};

export const remapPublicToPrivateMetadataIdMiddleware = (
	metadataIdMappings: PseuplexIDRemappings,
	options: PlexAPIRequestHandlerOptions,
	replaceIdInPath: (req: express.Request, newMetadataId: string) => string,
) => {
	return asyncRequestHandler(async (req: express.Request, res): Promise<boolean> => {
		const privateToPublicIds: {[key: string]: (number | string)} = {};
		const metadataIdString = req.params.metadataId;
		if(metadataIdString) {
			const metadataIdParts = parsePseuplexMetadataIDFromPathParam(metadataIdString);
			if(!metadataIdParts.source) {
				const privateId = metadataIdMappings.getPrivateIDFromPublicID(metadataIdParts.id);
				if(privateId != null) {
					// id is a mapped ID, so we need to handle the request
					privateToPublicIds[privateId] = metadataIdParts.id;
					const escapedPrivateId = qs.escape(privateId);
					// we should assume req.url refers to the full url here, and not a sub url
					const queryIndex = req.url.indexOf('?');
					const queryString = (queryIndex != -1 ? req.url.slice(queryIndex) : '');
					const newUrl = replaceIdInPath(req, escapedPrivateId) + queryString;
					req.params.metadataId = escapedPrivateId;
					req.url = newUrl;
					// TODO log remapping
				}
			}
		}
		(req as PseuplexRemappedMetadataIdsRequest).remappedPlexMetadataIds = privateToPublicIds;
		return false;
	});
};

export const remapPublicToPrivateMetadataIdsMiddleware = (
	metadataIdMappings: PseuplexIDRemappings,
	options: PlexAPIRequestHandlerOptions,
	replaceIdInPath: (req: express.Request, newMetadataIds: string) => string,
) => {
	return asyncRequestHandler(async (req: express.Request, res): Promise<boolean> => {
		const privateToPublicIds: {[key: string]: (number | string)} = {};
		const metadataIdsString = req.params.metadataId;
		if(metadataIdsString) {
			const metadataIdStrings = parsePseuplexMetadataIDStringsFromPathParam(metadataIdsString);
			let idsChanged = false;
			for(let i=0; i<metadataIdStrings.length; i++) {
				const metadataIdString = metadataIdStrings[i];
				const metadataId = parsePseuplexMetadataID(metadataIdString);
				if(!metadataId.source) {
					const privateId = metadataIdMappings.getPrivateIDFromPublicID(metadataId.id);
					if(privateId != null) {
						// id is a mapped ID, so we need to handle the request
						privateToPublicIds[privateId] = metadataId.id;
						const escapedPrivateId = qs.escape(privateId);
						metadataIdStrings[i] = escapedPrivateId;
						idsChanged = true;
						// TODO log remapping
					}
				}
			}
			if(idsChanged) {
				// we should assume req.url refers to the full url here, and not a sub url
				const queryIndex = req.url.indexOf('?');
				const queryString = (queryIndex != -1 ? req.url.slice(queryIndex) : '');
				const joinedMetadataIds = metadataIdStrings.join(',');
				const newUrl = replaceIdInPath(req, joinedMetadataIds) + queryString;
				req.params.metadataId = joinedMetadataIds;
				req.url = newUrl;
				// TODO log remapping
			}
		}
		(req as PseuplexRemappedMetadataIdsRequest).remappedPlexMetadataIds = privateToPublicIds;
		return false;
	});
};

export const pseuplexMetadataIdRequestMiddleware = <TResult>(
	options: PlexAPIRequestHandlerOptions,
	handler: (
		req: PseuplexRemappedMetadataIdsRequest,
		res: express.Response,
		metadataId: PseuplexMetadataIDParts,
	) => Promise<TResult>,
) => {
	return asyncRequestHandler(async (req: IncomingPlexAPIRequest, res: express.Response): Promise<boolean> => {
		let metadataId = req.params.metadataId;
		if(!metadataId) {
			// let plex handle the empty api request
			return false;
		}
		let metadataIdParts = parsePseuplexMetadataIDFromPathParam(metadataId);
		if(!metadataIdParts.source) {
			// id is a plex ID, so no need to handle this request
			return false;
		}
		await handlePlexAPIRequest(req, res, async (req: PseuplexRemappedMetadataIdsRequest, res): Promise<TResult> => {
			return await handler(req, res, metadataIdParts);
		}, options);
		return true;
	});
};

export const pseuplexMetadataIdsRequestMiddleware = <TResult>(
	options: PlexAPIRequestHandlerOptions,
	handler: (
		req: PseuplexRemappedMetadataIdsRequest,
		res: express.Response,
		metadataIds: PseuplexMetadataIDParts[],
	) => Promise<TResult>,
) => {
	return asyncRequestHandler(async (req: IncomingPlexAPIRequest, res: express.Response) => {
		// parse metadata IDs
		const metadataIdsString = req.params.metadataId;
		if(!metadataIdsString) {
			throw httpError(400, "No ID provided");
		}
		const metadataIds = parsePseuplexMetadataIDsFromPathParam(metadataIdsString);
		// check if any non-plex metadata IDs exist
		let anyNonPlexIds: boolean = false;
		for(let i=0; i<metadataIds.length; i++) {
			let metadataId = metadataIds[i];
			if(metadataId.source) {
				// id is not a plain plex ID, so we should handle it
				anyNonPlexIds = true;
				break;
			}
		}
		// if there are no non-plex providers, just continue on with proxying the request
		if(!anyNonPlexIds) {
			// continue
			return false;
		}
		// fetch from non-plex and plex providers
		await handlePlexAPIRequest(req, res, async (req: PseuplexRemappedMetadataIdsRequest, res): Promise<TResult> => {
			return await handler(req, res, metadataIds);
		}, options);
		return true;
	});
};
