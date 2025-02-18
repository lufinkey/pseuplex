
export type HttpError = Error & {
	statusCode: number;
};

export const httpError = (status: number, message: string, props?: {[key: string]: any}): HttpError => {
	const error = new Error(message) as HttpError;
	error.statusCode = status;
	Object.assign(error, props);
	return error;
};

export type HttpResponseError = Error & {
	code: string;
	url: string;
	httpResponse: Response;
};

export const httpResponseError = (url: string, res: Response, message?: string) => {
	const error = new Error(message || res.statusText) as HttpResponseError;
	error.code = `HTTP${res.status}`;
	error.url = url;
	error.httpResponse = res;
	return error;
};
