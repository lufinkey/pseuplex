
import express from 'express';
import { HttpError } from '../utils';
import { serializeResponseContent } from './serialization';

export const handlePlexAPIRequest = async <ResultType>(req: express.Request, res: express.Response, handler: () => Promise<ResultType>) => {
	try {
		const result = await handler();
		const serializedRes = serializeResponseContent(req, res, result);
		res.status(200);
		if(req.headers.origin) {
			res.header('access-control-allow-origin', req.headers.origin);
		}
		res.contentType(serializedRes.contentType)
		res.send(serializedRes.data);
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
	}
};
