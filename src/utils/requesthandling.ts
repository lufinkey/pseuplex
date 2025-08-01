import express from 'express';
import { HttpError, HttpResponseError } from './error';

export const asyncRequestHandler = <TRequest extends express.Request = express.Request>(
	handler: (req: TRequest, res: express.Response) => Promise<boolean>
) => {
	return async (req: TRequest, res: express.Response, next: (error?: Error) => void) => {
		let done: boolean;
		try {
			done = await handler(req,res);
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
		console.error(`Got error while handling request:`);
		console.error(`\turl: ${req.originalUrl}`);
		console.error(`\theaders:\n`);
		const reqHeaderList = req.rawHeaders;
		for(let i=0; i<reqHeaderList.length; i++) {
			const headerKey = reqHeaderList[i];
			i++;
			const headerVal = reqHeaderList[i];
			console.error(`\t\t${headerKey}: ${headerVal}`);
		}
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
