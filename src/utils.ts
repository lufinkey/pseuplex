
export type HttpError = Error & { statusCode: number };

export const httpError = (status: number, message: string): HttpError => {
	const error = new Error(message) as HttpError;
	error.statusCode = status;
	return error;
};
