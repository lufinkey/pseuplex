
export type HttpError = Error & { statusCode: number };

export const httpError = (status: number, message: string): HttpError => {
	const error = new Error(message) as HttpError;
	error.statusCode = status;
	return error;
};

export const stringParam = (value: any): string | undefined => {
	if(typeof value === 'string') {
		return value;
	} else if(value) {
		throw httpError(400, `Invalid parameter ${value}`);
	}
	return undefined;
};

export const intParam = (value: any): number | undefined => {
	if(typeof value === 'number') {
		return value;
	}
	if(value) {
		if(typeof value !== 'string') {
			throw httpError(400, `Invalid integer ${value}`);
		}
		const intVal = Number.parseInt(value);
		if(Number.isNaN(intVal)) {
			throw httpError(400, `${value} is not an integer`);
		}
		return intVal;
	}
	return undefined;
}
