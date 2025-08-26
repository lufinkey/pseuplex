import http from 'http';
import express from 'express';
import * as plexTypes from './types';
import {
	encodeResponseContentIfAble,
	SerializedPlexAPIResponse,
	serializeResponseContent
} from './serialization';
import {
	PlexServerAccountInfo,
	PlexServerAccountsStore
} from './accounts';
import { Logger } from '../logging';
import {
	HttpError,
	httpError,
	HttpResponseError,
} from '../utils/error';
import { parseQueryParams } from '../utils/queryparams';
import { asyncRequestHandler } from '../utils/requesthandling';

export type PlexAPIRequestHandler<TResult> = (req: express.Request, res: express.Response) => Promise<TResult>;
export type PlexAPIRequestHandlerOptions = {
	logger?: Logger;
};

export type PlexAPIRequestHandlerMiddleware<TResult> = (handler: PlexAPIRequestHandler<TResult>, options?: PlexAPIRequestHandlerOptions) => ((req: express.Request, res: express.Response) => Promise<void>);

export const handlePlexAPIRequest = async <TResult>(req: express.Request, res: express.Response, handler: PlexAPIRequestHandler<TResult>, options: PlexAPIRequestHandlerOptions): Promise<void> => {
	let serializedRes: SerializedPlexAPIResponse;
	try {
		const result = await handler(req,res);
		serializedRes = serializeResponseContent(req, res, result);
	} catch(error) {
		if(!options?.logger?.logPlexRequestHandlerFailed(req, res, error)) {
			console.error("Plex request handler failed:");
			console.error(error);
		}
		let statusCode =
			(error as HttpError).statusCode
			?? (error as HttpResponseError).httpResponse?.status;
		if(!statusCode || (statusCode >= 200 && statusCode < 300)) {
			statusCode = 500;
		}
		// send response
		if(!res.hasHeader('x-plex-protocol')) {
			res.setHeader('x-plex-protocol', '1.0');
		}
		if(req.headers.origin && !res.hasHeader('Access-Control-Allow-Origin')) {
			res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
		}
		res.status(statusCode);
		res.send(); // TODO use error message format
		// log response
		options?.logger?.logIncomingUserRequestResponse(req, res, undefined);
		return;
	}
	// send response
	if(!res.hasHeader('X-Plex-Protocol')) {
		res.setHeader('X-Plex-Protocol', '1.0');
	}
	if(!res.hasHeader('Vary')) {
		res.setHeader('Vary', 'Origin, X-Plex-Token');
	}
	if(!res.hasHeader('Cache-Control')) {
		res.setHeader('Cache-Control', 'no-cache');
	}
	if(!res.hasHeader('Date')) {
		res.setHeader('Date', (new Date()).toUTCString());
	}
	if(req.headers.origin && !res.hasHeader('Access-Control-Allow-Origin')) {
		res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
	}
	if(req.headers.origin) {
		if(!res.hasHeader('Access-Control-Expose-Headers')) {
			res.setHeader('Access-Control-Expose-Headers', 'Location, Date');
		}
	}
	let encodedResData: Buffer | null | undefined;
	try {
		encodedResData = await encodeResponseContentIfAble(req, res, serializedRes.data);
	} catch(error) {
		console.error('Error encoding response data:');
		console.error(error);
	}
	if(!encodedResData) {
		encodedResData = serializedRes.data;
	}
	res.setHeader('Content-Length', encodedResData.length);
	res.contentType(serializedRes.contentType);
	res.status(200);
	res.send(encodedResData);
	// log response
	options?.logger?.logIncomingUserRequestResponse(req, res, serializedRes.dataString);
};

export type PlexRequestInfo = {
	authContext: plexTypes.PlexAuthContext;
	userInfo: PlexServerAccountInfo;
	requestParams: {[key: string]: any}
};

export type IncomingPlexAPIRequestMixin = {
	plex: PlexRequestInfo;
};

export type IncomingPlexAPIRequest = express.Request & IncomingPlexAPIRequestMixin;
export type IncomingPlexHttpRequest = http.IncomingMessage & IncomingPlexAPIRequestMixin;

export const authenticatePlexRequest = async <TRequest extends http.IncomingMessage,TResponse>(req: TRequest, accountsStore: PlexServerAccountsStore) => {
	const authContext = plexTypes.parseAuthContextFromRequest(req);
	const userInfo = await accountsStore.getUserInfoOrNull(authContext);
	if(!userInfo) {
		throw httpError(401, "Not Authorized");
	}
	const plexReq = req as any as IncomingPlexAPIRequestMixin;
	plexReq.plex = {
		authContext,
		userInfo,
		requestParams: parseQueryParams(req, (key) => !(key in authContext))
	};
};

export const createPlexAuthenticationMiddleware = <TRequest extends http.IncomingMessage,TResponse>(accountsStore: PlexServerAccountsStore) => {
	return asyncRequestHandler(async (req: TRequest, res: TResponse) => {
		const plexReq = (req as any as IncomingPlexAPIRequestMixin);
		if(plexReq.plex && plexReq.plex.authContext['X-Plex-Token'] == plexTypes.parsePlexTokenFromRequest(req)) {
			return false;
		}
		await authenticatePlexRequest(req, accountsStore);
		return false;
	});
};

export type PlexAuthedRequestHandler =
	((req: IncomingPlexAPIRequest, res: express.Response) => (void | Promise<void>))
	| ((req: IncomingPlexAPIRequest, res: express.Response, next: (error?: Error) => void) => (void | Promise<void>));

export const createPlexServerOwnerOnlyMiddleware = () => {
	return (req: IncomingPlexAPIRequest, res: http.ServerResponse, next) => {
		if(!req.plex) {
			next(httpError(500, "Cannot access endpoint without plex authentication"));
			return;
		}
		if (!req.plex.userInfo.isServerOwner) {
			next(httpError(403, "Get out of here you sussy baka"));
			return;
		}
		next();
	};
};



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
};
