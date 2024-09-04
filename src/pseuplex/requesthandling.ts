import qs from 'querystring';
import express from 'express';
import {
	asyncRequestHandler,
	httpError,
	parseQueryParams
} from '../utils';
import * as plexTypes from '../plex/types';
import {
	handlePlexAPIRequest,
	IncomingPlexAPIRequest
} from '../plex/requesthandling';
import {
	PseuplexMetadataSource,
	PseuplexMetadataPage
} from './types';
import {
	parseMetadataID,
	PseuplexMetadataIDParts,
	stringifyPartialMetadataID
} from './metadataidentifier';

export const pseuplexMetadataIdRequestMiddleware = <TResult>(handler: (
	req: IncomingPlexAPIRequest,
	res: express.Response,
	metadataId: PseuplexMetadataIDParts,
	params: {[key: string]: string}) => Promise<TResult>) => {
	return asyncRequestHandler(async (req: IncomingPlexAPIRequest, res): Promise<boolean> => {
		const metadataId = req.params.metadataId;
		if(!metadataId) {
			// let plex handle the empty api request
			return false;
		}
		const metadataIdParts = parseMetadataID(metadataId);
		if(!metadataIdParts.source || metadataIdParts.source == PseuplexMetadataSource.Plex) {
			// id is a plex ID, so no need to handle this request
			return false;
		}
		await handlePlexAPIRequest(req, res, async (req: IncomingPlexAPIRequest, res): Promise<TResult> => {
			const params = parseQueryParams(req, (key) => !(key in req.plex.authContext));
			return await handler(req, res, metadataIdParts, params);
		});
		return true;
	});
};

export const pseuplexMetadataIdsRequestMiddleware = <TResult>(handler: (
	req: IncomingPlexAPIRequest,
	res: express.Response,
	metadataIds: PseuplexMetadataIDParts[],
	params: {[key: string]: string}) => Promise<TResult>) => {
	return asyncRequestHandler(async (req: IncomingPlexAPIRequest, res: express.Response) => {
		// parse metadata IDs
		const metadataIdsString = req.params.metadataId;
		if(!metadataIdsString) {
			throw httpError(400, "No ID provided");
		}
		let metadataIds = metadataIdsString.split(',').map((metadataId) => {
			if(metadataId.indexOf(':') == -1 && metadataId.indexOf('%') != -1) {
				metadataId = qs.unescape(metadataId);
			}
			return parseMetadataID(metadataId);
		});
		// map IDs to their providers
		const metadataProviderIds: {[source in PseuplexMetadataSource]?: Set<string>} = {};
		let anyNonPlexIds: boolean = false;
		for(const metadataId of metadataIds) {
			if(!metadataId.id) {
				continue;
			}
			let source = metadataId.source;
			if (!source) {
				source = PseuplexMetadataSource.Plex;
			}
			let plexProviderIds = metadataProviderIds[source];
			if(!plexProviderIds) {
				plexProviderIds = new Set<string>();
				metadataProviderIds[source] = plexProviderIds;
			}
			const partialId = stringifyPartialMetadataID(metadataId);
			plexProviderIds.add(partialId);
			if(source != PseuplexMetadataSource.Plex) {
				anyNonPlexIds = true;
			}
		}
		// if there are no non-plex providers, just continue on with proxying the request
		if(!anyNonPlexIds) {
			// continue
			return false;
		}
		// fetch from non-plex and plex providers
		await handlePlexAPIRequest(req, res, async (req: IncomingPlexAPIRequest, res): Promise<TResult> => {
			const params = parseQueryParams(req, (key) => !(key in req.plex.authContext));
			return await handler(req, res, metadataIds, params);
		});
		return true;
	});
};
