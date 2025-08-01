
import express from 'express';
import * as plexTypes from './types';
import { serializeResponseContent } from './serialization';
import {
	PlexServerAccountInfo,
	PlexServerAccountsStore
} from './accounts';
import { urlLogString } from '../utils/logging';
import {
	HttpError,
	httpError,
	HttpResponseError,
} from '../utils/error';
import { parseQueryParams } from '../utils/misc';

export const handlePlexAPIRequest = async <TResult>(req: express.Request, res: express.Response, handler: (req: express.Request, res: express.Response) => Promise<TResult>, options?: PlexAPIRequestHandlerOptions): Promise<void> => {
	let serializedRes: {contentType:string, data:string};
	try {
		const result = await handler(req,res);
		serializedRes = serializeResponseContent(req, res, result);
	} catch(error) {
		console.error("Plex request handler failed:");
		console.error(error);
		let statusCode =
			(error as HttpError).statusCode
			?? (error as HttpResponseError).httpResponse?.status;
		if(!statusCode) {
			statusCode = 500;
		}
		// log response
		if(options?.logResponses) {
			console.log(`\nUser response ${statusCode} for ${req.method} ${urlLogString(options, req.originalUrl)}`);
			// no response body
		}
		// send response
		res.status(statusCode);
		if(req.headers.origin) {
			res.header('access-control-allow-origin', req.headers.origin);
		}
		res.send(); // TODO use error message format
		return;
	}
	// log response
	if(options?.logResponses) {
		console.log(`\nUser response 200 for ${req.method} ${urlLogString(options, req.originalUrl)}`);
		if(options?.logResponseBody) {
			console.log(serializedRes.data);
		}
	}
	// send response
	res.status(200);
	if(req.headers.origin) {
		res.header('access-control-allow-origin', req.headers.origin);
	}
	res.contentType(serializedRes.contentType)
	res.send(serializedRes.data);
};

export type PlexAPIRequestHandlerOptions = {
	logResponses?: boolean;
	logResponseBody?: boolean;
	logFullURLs?: boolean;
};
export type PlexAPIRequestHandler<TResult> = (req: express.Request, res: express.Response) => Promise<TResult>;
export type PlexAPIRequestHandlerMiddleware<TResult> = (handler: PlexAPIRequestHandler<TResult>, options?: PlexAPIRequestHandlerOptions) => ((req: express.Request, res: express.Response) => Promise<void>);
export const plexAPIRequestHandler = <TResult>(handler: PlexAPIRequestHandler<TResult>, options?: PlexAPIRequestHandlerOptions) => {
	return async (req: IncomingPlexAPIRequest, res: express.Response) => {
		await handlePlexAPIRequest(req, res, handler, options);
	};
};

export type IncomingPlexAPIRequest = express.Request & {
	plex: {
		authContext: plexTypes.PlexAuthContext;
		userInfo: PlexServerAccountInfo;
		requestParams: {[key: string]: any}
	}
};

export const createPlexAuthenticationMiddleware = (accountsStore: PlexServerAccountsStore) => {
	return async (req: express.Request, res: express.Response, next: (error?: Error) => void) => {
		try {
			const authContext = plexTypes.parseAuthContextFromRequest(req);
			const userInfo = await accountsStore.getUserInfoOrNull(authContext);
			if(!userInfo) {
				throw httpError(401, "Not Authorized");
			}
			const plexReq = req as IncomingPlexAPIRequest;
			plexReq.plex = {
				authContext,
				userInfo,
				requestParams: parseQueryParams(req, (key) => !(key in authContext))
			};
		} catch(error) {
			next(error);
			return;
		}
		next();
	};
};

export type PlexAuthedRequestHandler =
	((req: IncomingPlexAPIRequest, res: express.Response) => (void | Promise<void>))
	| ((req: IncomingPlexAPIRequest, res: express.Response, next: (error?: Error) => void) => (void | Promise<void>));



export const doesRequestIncludeFirstPinnedContentDirectory = (params: {
	contentDirectoryID?: string | string[],
	pinnedContentDirectoryID?: string | string[],
}, options: {
	plexAuthContext: plexTypes.PlexAuthContext,
	assumedTopSectionID?: string | number,
}): boolean => {
	// parse pinned content dir ids
	const pinnedContentDirectoryID = params.pinnedContentDirectoryID;
	const pinnedContentDirIds = (typeof pinnedContentDirectoryID == 'string') ?
		pinnedContentDirectoryID.split(',')
		: (pinnedContentDirectoryID instanceof Array) ?
			pinnedContentDirectoryID?.flatMap((dir) => (typeof dir === 'string' ? dir.split(',') : dir))
			: pinnedContentDirectoryID;
	// parse content dir ids
	const contentDirectoryID = params.contentDirectoryID;
	const contentDirIds = (typeof contentDirectoryID == 'string') ? contentDirectoryID.split(',') : contentDirectoryID;
	// make sure we're not on plex for mobile, otherwise we'll need special behavior
	if (plexTypes.plexUserIsReactNativeMobileAppPost2025(options.plexAuthContext)) {
		if(!contentDirIds || contentDirIds.length == 0) {
			return true;
		} else if(contentDirIds.length == 1) {
			if(!pinnedContentDirIds || pinnedContentDirIds.length == 0
				|| (pinnedContentDirIds.length == 1 && contentDirIds[0] == pinnedContentDirIds[0])) {
				// the newer plex for mobile doesn't properly specify the pinnedContentDirectoryID array, so we need to figured out what the first section is
				return contentDirIds[0] == options.assumedTopSectionID;
			}
		}
	}
	return (!pinnedContentDirIds || pinnedContentDirIds.length == 0 || !contentDirIds || contentDirIds.length == 0
		|| contentDirIds[0] == pinnedContentDirIds[0]);
}
