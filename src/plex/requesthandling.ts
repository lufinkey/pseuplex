
import express from 'express';
import {
	HttpError,
	httpError
} from '../utils';
import * as plexTypes from './types';
import { serializeResponseContent } from './serialization';
import {
	PlexServerAccountInfo,
	PlexServerAccountsStore
} from './accounts';

export const handlePlexAPIRequest = async <TResult>(req: express.Request, res: express.Response, handler: (req: express.Request, res: express.Response) => Promise<TResult>): Promise<void> => {
	let serializedRes: {contentType:string, data:string};
	try {
		const result = await handler(req,res);
		serializedRes = serializeResponseContent(req, res, result);
	} catch(error) {
		console.error(error);
		if((error as HttpError).statusCode) {
			res.status(error.statusCode);
		} else {
			res.status(500);
		}
		if(req.headers.origin) {
			res.header('access-control-allow-origin', req.headers.origin);
		}
		res.send(); // TODO use error message format
		return;
	}
	// send result
	res.status(200);
	if(req.headers.origin) {
		res.header('access-control-allow-origin', req.headers.origin);
	}
	res.contentType(serializedRes.contentType)
	res.send(serializedRes.data);
};

export const plexAPIRequestHandler = <TResult>(handler: (req: express.Request, res: express.Response) => Promise<TResult>): ((req: express.Request, res: express.Response) => Promise<void>) => {
	return async (req, res) => {
		await handlePlexAPIRequest(req, res, handler);
	};
};

export type IncomingPlexAPIRequest = express.Request & {
	plex: {
		authContext: plexTypes.PlexAuthContext;
		userInfo: PlexServerAccountInfo
	}
};

export const createPlexAuthenticationMiddleware = (accountsStore: PlexServerAccountsStore) => {
	return async (req: express.Request, res: express.Response, next: (error?: Error) => void) => {
		try {
			const authContext = plexTypes.parseAuthContextFromRequest(req);
			const userInfo = await accountsStore.getTokenUserInfoOrNull(authContext['X-Plex-Token']);
			if(!userInfo) {
				throw httpError(401, "Not Authorized");
			}
			const plexReq = req as IncomingPlexAPIRequest;
			plexReq.plex = {
				authContext,
				userInfo
			};
		} catch(error) {
			next(error);
			return;
		}
		next();
	};
};

