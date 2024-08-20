
import qs from 'querystring';

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

export const stringArrayParam = (value: any): string[] | undefined => {
	const str = stringParam(value);
	if(str == undefined) {
		return undefined;
	}
	return str.split(',');
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
};

export const booleanParam = (value: any): boolean | undefined => {
	if(typeof value === 'boolean') {
		return value;
	} else if(value == undefined) {
		return value;
	}
	if(value == 1 || value == 'true') {
		return true;
	} else if(value == 0 || value == 'false') {
		return false;
	}
	throw httpError(400, `${value} is not a boolean`);
}

export const mapObject = <TNewValue,TValue>(obj: object, mapper: (key: string, value: TValue) => TNewValue) => {
	const mappedObject = {};
	for(const key in obj) {
		mappedObject[key] = mapper(key, obj[key]);
	}
	return mappedObject;
};

export const nameOf = (obj: {[key:string]: any}): string => {
	for(const key in obj) {
		return key;
	}
	return undefined;
};

export const combinePathSegments = (part1: string, part2: string) => {
	if(!part2) {
		return part1;
	}
	if(!part2) {
		return part1;
	}
	if(part1.endsWith('/')) {
		return part1 + part2;
	}
	return `${part1}/${part2}`;
};

export type URLPathParts = {
	path: string;
	query?: string;
	hash?: string;
};

export type URLPath = {
	path: string;
	query?: qs.ParsedUrlQuery;
	hash?: string;
};

export const parseURLPathParts = (urlPath: string): URLPathParts => {
	const queryIndex = urlPath.indexOf('?');
	const hashIndex = urlPath.indexOf('#');
	if(queryIndex != -1) {
		if(hashIndex != -1) {
			if(hashIndex < queryIndex) {
				return {
					path: urlPath.substring(0, hashIndex),
					hash: urlPath.substring(hashIndex+1)
				};
			} else {
				return {
					path: urlPath.substring(0, queryIndex),
					query: urlPath.substring(queryIndex+1, hashIndex),
					hash: urlPath.substring(hashIndex+1)
				};
			}
		} else {
			return {
				path: urlPath.substring(0, queryIndex),
				query: urlPath.substring(queryIndex+1)
			};
		}
	}
	else if(hashIndex != -1) {
		return {
			path: urlPath.substring(0, hashIndex),
			hash: urlPath.substring(hashIndex+1)
		};
	} else {
		return {
			path: urlPath
		};
	}
};

export const stringifyURLPathParts = (urlPathObj: URLPathParts): string => {
	let urlPath = urlPathObj.path;
	if(urlPathObj.query != null) {
		urlPath += `?${urlPathObj.query}`;
	}
	if(urlPathObj.hash != null) {
		urlPath += `#${urlPathObj.hash}`;
	}
	return urlPath;
};

export const parseURLPath = (urlPath: string): URLPath => {
	const parts = parseURLPathParts(urlPath);
	const newParts: URLPath = (parts as any);
	if(parts.query != null) {
		newParts.query = qs.parse(parts.query);
	}
	return newParts;
};

export const stringifyURLPath = (urlPathObj: URLPath): string => {
	let urlPath = urlPathObj.path;
	if(urlPathObj.query != null) {
		urlPath += `?${qs.stringify(urlPathObj.query)}`;
	}
	if(urlPathObj.hash != null) {
		urlPath += `#${urlPathObj.hash}`;
	}
	return urlPath;
};

export const addQueryArgumentToURLPath = (urlPath: string, queryEntry: string) => {
	const parts = parseURLPathParts(urlPath);
	if(!parts.query) {
		parts.query = queryEntry;
	} else {
		parts.query += `&${queryEntry}`;
	}
	return stringifyURLPathParts(parts);
};

export const unleakString = (str: string) => {
	return (' '+str).substr(1);
};

export const fixStringLeaks = (obj: object) => {
	if(obj == null) {
		return;
	}
	if(obj instanceof Array) {
		for(let i=0; i<obj.length; i++) {
			const element = obj[i];
			if(typeof element === 'string') {
				obj[i] = unleakString(element);
			} else if(typeof element === 'object') {
				if(element != null) {
					fixStringLeaks(element);
				}
			}
		}
	} else {
		for(const key in obj) {
			const element = obj[key];
			if(typeof element === 'string') {
				obj[key] = unleakString(element);
			} else if(typeof element === 'object') {
				if(element != null) {
					fixStringLeaks(element);
				}
			}
		}
	}
};
