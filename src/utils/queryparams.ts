import http from 'http';
import express from 'express';
import { httpError } from './error';
import { parseURLPath } from './url';

export const parseStringQueryParam = (value: any): string | undefined => {
	if(typeof value === 'string') {
		return value;
	} else if(value) {
		throw httpError(400, `Invalid parameter ${value}`);
	}
	return undefined;
};

export const parseStringArrayQueryParam = (value: any): string[] | undefined => {
	if(value instanceof Array) {
		return value.flatMap((dir) => (typeof dir === 'string' ? dir.split(',') : dir));
	}
	const str = parseStringQueryParam(value);
	if(str == undefined) {
		return undefined;
	}
	return str.split(',');
};

export const parseIntQueryParam = (value: any): number | undefined => {
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

export const parseIntArrayQueryParam = (value: any): number[] | undefined => {
	if(typeof value === 'number') {
		return [value];
	}
	if(value instanceof Array) {
		return value.map((val) => {
			return parseIntQueryParam(val)!;
		});
	}
	if(typeof value === 'string') {
		return value.split(',').map((val) => {
			return parseIntQueryParam(val)!;
		});
	}
	return undefined;
};

export const parseBooleanQueryParam = (value: any): boolean | undefined => {
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
};

export const parseQueryParams = (req: http.IncomingMessage | express.Request, includeParam: (key:string) => boolean): {[key:string]: any} => {
	const params: {[key:string]: any} = {};
	let query: {[key: string]: any} | undefined = (req as express.Request).query;
	if(!query) {
		query = parseURLPath(req.url!).queryItems;
	}
	if(query) {
		for(const key of Object.keys(query)) {
			if(includeParam(key)) {
				params[key] = query[key];
			}
		}
	}
	return params;
};



export type BooleanQueryParam = '1' | '0' | 1 | 0 | boolean;

export const createBooleanQueryParam = (param: BooleanQueryParam | undefined): (1 | 0 | undefined) => {
	if(param == null) {
		return undefined;
	}
	return (param == 1) ? 1 : 0;
};



export const addQueryArgumentToURLPath = (urlPath: string, queryEntry: string) => {
	const queryIndex = urlPath.indexOf('?');
	if(queryIndex == -1) {
		return urlPath + '?' + queryEntry;
	} else if(queryIndex == urlPath.length-1) {
		return urlPath + queryEntry;
	} else {
		return urlPath + '&' + queryEntry;
	}
};
