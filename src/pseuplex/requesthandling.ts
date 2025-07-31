import qs from 'querystring';
import express from 'express';
import {
	handlePlexAPIRequest,
	IncomingPlexAPIRequest,
	PlexAPIRequestHandlerOptions
} from '../plex/requesthandling';
import {
	parseMetadataID,
	PseuplexMetadataIDParts
} from './metadataidentifier';
import { IDMappings } from './idmappings';
import {
	asyncRequestHandler,
} from '../utils/requesthandling';
import {
	httpError,
} from '../utils/error';

export const parseMetadataIdsFromPathParam = (metadataIdsString: string): PseuplexMetadataIDParts[] => {
	if(!metadataIdsString) {
		return [];
	}
	return metadataIdsString.split(',').map((metadataId) => {
		if(metadataId.indexOf(':') == -1 && metadataId.indexOf('%') != -1) {
			metadataId = qs.unescape(metadataId);
		}
		return parseMetadataID(metadataId);
	});
};

export const parseMetadataIdFromPathParam = (metadataIdString: string): PseuplexMetadataIDParts => {
	if(metadataIdString.indexOf(':') == -1 && metadataIdString.indexOf('%') != -1) {
		metadataIdString = qs.unescape(metadataIdString);
	}
	return parseMetadataID(metadataIdString);
};

export const pseuplexMetadataIdRequestMiddleware = <TResult>(
	options: PlexAPIRequestHandlerOptions & {metadataIdMappings?: IDMappings | null},
	handler: (
		req: express.Request,
		res: express.Response,
		metadataId: PseuplexMetadataIDParts,
		keysToIdsMap: {[key: string]: (number | string)}) => Promise<TResult>,
) => {
	return asyncRequestHandler(async (req: express.Request, res): Promise<boolean> => {
		let metadataId = req.params.metadataId;
		if(!metadataId) {
			// let plex handle the empty api request
			return false;
		}
		const keysToIdsMap: {[key: string]: (number | string)} = {};
		let metadataIdParts = parseMetadataIdFromPathParam(metadataId);
		if(!metadataIdParts.source) {
			const privateId = options.metadataIdMappings?.getPrivateIDFromPublicID(metadataIdParts.id);
			if(privateId != null) {
				// id is a mapped ID, so we need to handle the request
				keysToIdsMap[privateId] = metadataIdParts.id;
				metadataIdParts = parseMetadataID(privateId);
			} else {
				// id is a plex ID, so no need to handle this request
				return false;
			}
		}
		await handlePlexAPIRequest(req, res, async (req: IncomingPlexAPIRequest, res): Promise<TResult> => {
			return await handler(req, res, metadataIdParts, keysToIdsMap);
		}, options);
		return true;
	});
};

export const pseuplexMetadataIdsRequestMiddleware = <TResult>(
	options: PlexAPIRequestHandlerOptions & {metadataIdMappings?: IDMappings | null},
	handler: (
		req: IncomingPlexAPIRequest,
		res: express.Response,
		metadataIds: PseuplexMetadataIDParts[],
		keysToIdsMap: {[key: string]: (number | string)}) => Promise<TResult>,
) => {
	return asyncRequestHandler(async (req: IncomingPlexAPIRequest, res: express.Response) => {
		// parse metadata IDs
		const metadataIdsString = req.params.metadataId;
		if(!metadataIdsString) {
			throw httpError(400, "No ID provided");
		}
		const metadataIds = parseMetadataIdsFromPathParam(metadataIdsString);
		// check if any non-plex metadata IDs exist
		let anyNonPlexIds: boolean = false;
		const keysToIdsMap: {[key: string]: (number | string)} = {};
		for(let i=0; i<metadataIds.length; i++) {
			let metadataId = metadataIds[i];
			if(metadataId.source) {
				// id is not a plain plex ID, so we should handle it
				anyNonPlexIds = true;
			} else {
				const privateId = options.metadataIdMappings?.getPrivateIDFromPublicID(metadataId.id);
				if(privateId != null) {
					// id is a mapped ID, so we need to handle the request
					keysToIdsMap[privateId] = metadataId.id;
					metadataId = parseMetadataID(privateId);
					metadataIds[i] = metadataId;
					anyNonPlexIds = true;
				}
			}
		}
		// if there are no non-plex providers, just continue on with proxying the request
		if(!anyNonPlexIds) {
			// continue
			return false;
		}
		// fetch from non-plex and plex providers
		await handlePlexAPIRequest(req, res, async (req: IncomingPlexAPIRequest, res): Promise<TResult> => {
			return await handler(req, res, metadataIds, keysToIdsMap);
		}, options);
		return true;
	});
};
