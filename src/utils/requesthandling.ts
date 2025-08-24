import http from 'http';
import express from 'express';
import { HttpError, HttpResponseError } from './error';

export const asyncRequestHandler = <TRequest extends http.IncomingMessage = express.Request, TResponse = express.Response>(
	handler: (req: TRequest, res: TResponse) => boolean | Promise<boolean>
) => {
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

export const expressErrorHandler = (error: Error, req: express.Request, res: express.Response, next) => {
	if(error) {
		const reqHeaderList = req.rawHeaders;
		let reqHeaderLines: string[] = []
		for(let i=0; i<reqHeaderList.length; i++) {
			const headerKey = reqHeaderList[i];
			i++;
			const headerVal = reqHeaderList[i];
			reqHeaderLines.push(`\t\t${headerKey}: ${headerVal}`);
		}
		console.error('Got error while handling request:\n'
			+ `\ttimestamp: ${(new Date()).toString()}\n`
			+ `\turl: ${req.originalUrl}\n`
			+ `\tip: ${remoteAddressOfRequest(req)}\n`
			+ `\theaders:\n${reqHeaderLines.join('\n')}`);
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

export function remoteAddressOfRequest(req: http.IncomingMessage) {
	let remoteAddress = req.connection?.remoteAddress || req.socket?.remoteAddress;
	if(!remoteAddress) {
		console.error(`Remote address was undefined for some reason:`);
		console.dir(req);
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
