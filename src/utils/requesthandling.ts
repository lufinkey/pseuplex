import http from 'http';
import express from 'express';
import { httpError, HttpError, HttpResponseError } from './error';
import type { IncomingPlexAPIRequest } from '../plex/requesthandling';

export const asyncRequestHandler = <TRequest, TResponse>(
	handler: ((req: TRequest, res: TResponse) => (boolean | Promise<boolean>))
): ((req: TRequest, res: TResponse, next: (error?: Error) => void) => (void | Promise<void>)) => {
	return async (req: TRequest, res: TResponse, next: (error?: Error) => void) => {
		let done: boolean;
		try {
			const donePromise = handler(req,res);
			if(donePromise instanceof Promise) {
				done = await donePromise;
			} else {
				done = donePromise;
			}
		} catch(error) {
			next(error);
			return;
		}
		if(!done) {
			next();
		}
	};
};

export type RequestWithOriginalRemoteAddress = express.Request & {
	originalRemoteAddress: string;
};

export const addOriginalRemoteAddressToRequest = (req: express.Request) => {
	const reqWithAddr = (req as RequestWithOriginalRemoteAddress);
	if(reqWithAddr.originalRemoteAddress) {
		return;
	}
	reqWithAddr.originalRemoteAddress = remoteAddressOfRequest(req);
};

export const expressRequestDebugString = (req: express.Request) => {
	const reqHeaderList = req.rawHeaders;
		let reqHeaderLines: string[] = []
		for(let i=0; i<reqHeaderList.length; i++) {
			const headerKey = reqHeaderList[i];
			i++;
			const headerVal = reqHeaderList[i];
			reqHeaderLines.push(`\t\t${headerKey}: ${headerVal}`);
		}
	const plexUserReq = (req as IncomingPlexAPIRequest);
	const ip = remoteAddressOfRequestOrNull(req);
	const originalIP = (req as RequestWithOriginalRemoteAddress).originalRemoteAddress;
	return (plexUserReq.plex ? `\tplex.userInfo.email: ${plexUserReq.plex?.userInfo.email}\n` : '')
		+ `\ttimestamp: ${(new Date()).toString()}\n`
		+ `\tmethod: ${req.method}\n`
		+ `\turl: ${req.originalUrl}\n`
		+ `\tip: ${ip}\n`
		+ (originalIP != ip ? `\toriginal ip: ${originalIP}\n` : '')
		+ `\theaders:\n${reqHeaderLines.join('\n')}`;
};

export const expressErrorHandler = (error: Error, req: express.Request, res: express.Response, next) => {
	if(error) {
		console.error(`Got error while handling request:\n${expressRequestDebugString(req)}`);
		console.error(error);
		let statusCode =
			(error as HttpError).statusCode
			|| (error as HttpResponseError).httpResponse?.status
			|| 500;
		if (statusCode >= 200 && statusCode < 300) {
			statusCode = 500;
		}
		res.status(statusCode).send(error.message);
		console.log(`Sent error ${error.message}`);
	} else {
		next();
	}
};

export function remoteAddressOfRequest(req: http.IncomingMessage | express.Request): string {
	let remoteAddress = req.connection?.remoteAddress || req.socket?.remoteAddress;
	if(!remoteAddress) {
		throw httpError(400, "No remote address");
	}
	return remoteAddress;
};

export function remoteAddressOfRequestOrNull(req: http.IncomingMessage | express.Request): string | null {
	let remoteAddress = req.connection?.remoteAddress || req.socket?.remoteAddress;
	if(!remoteAddress) {
		return null;
	}
	return remoteAddress;
};

export function requestIsEncrypted(req: http.IncomingMessage) {
	const connection = ((req.connection || req.socket) as {encrypted?: boolean; pair?: boolean;})
	const encrypted = (connection?.encrypted || connection?.pair);
	return encrypted ? true : false;
}

export function getPortFromRequest(req: http.IncomingMessage) {
	const port = req.headers.host?.match(/:(\d+)/)?.[1];
	return port
		? port
		: (requestIsEncrypted(req) ? '443' : '80');
}
