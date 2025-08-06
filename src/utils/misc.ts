
import qs from 'querystring';
import express from 'express';
import {
	httpError,
} from './error';

export type WithOptionalProps<T> = {
	[key in keyof T]?: T[key]
};

export type WithOptionalPropsRecursive<T> = T extends Array<infer U> ? Array<WithOptionalPropsRecursive<U>> : {
	[key in keyof T]?: WithOptionalPropsRecursive<T[key]>
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
	if(value instanceof Array) {
		return value.flatMap((dir) => (typeof dir === 'string' ? dir.split(',') : dir));
	}
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

export const intArrayParam = (value: any): number[] | undefined => {
	if(typeof value === 'number') {
		return [value];
	}
	if(value instanceof Array) {
		return value.map((val) => {
			return intParam(val)!;
		});
	}
	if(typeof value === 'string') {
		return value.split(',').map((val) => {
			return intParam(val)!;
		});
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
};

export type URLPath = {
	path: string;
	queryItems?: qs.ParsedUrlQuery;
};

export const parseURLPathParts = (urlPath: string): URLPathParts => {
	const queryIndex = urlPath.indexOf('?');
	if(queryIndex != -1) {
		return {
			path: urlPath.substring(0, queryIndex),
			query: urlPath.substring(queryIndex+1)
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
	return urlPath;
};

export const parseURLPath = (urlPath: string): URLPath => {
	const parts = parseURLPathParts(urlPath);
	const newParts = (parts as URLPath);
	if(parts.query != null) {
		newParts.queryItems = qs.parse(parts.query);
		delete parts.query;
	}
	return newParts;
};

export const stringifyURLPath = (urlPathObj: URLPath): string => {
	let urlPath = urlPathObj.path;
	if(urlPathObj.queryItems != null) {
		urlPath += `?${qs.stringify(urlPathObj.queryItems)}`;
	}
	return urlPath;
};

export const parseQueryParams = (req: express.Request, includeParam: (key:string) => boolean): {[key:string]: any} => {
	const params: {[key:string]: any} = {};
	for(const key in req.query) {
		if(includeParam(key)) {
			params[key] = req.query[key];
		}
	}
	return params;
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

export const forArrayOrSingle = <T>(item: T | T[], callback: (item: T) => void) => {
	if(item) {
		if(item instanceof Array) {
			for(const element of item) {
				callback(element);
			}
		} else {
			callback(item);
		}
	}
};

export const transformArrayOrSingle = <T,U>(item: T | T[] | undefined, callback: (item: T) => U): (U | U[]) => {
	if(item) {
		if(item instanceof Array) {
			return item.map(callback);
		} else {
			return callback(item);
		}
	} else {
		return item as any;
	}
};

export const forArrayOrSingleAsyncParallel = async <T>(item: T | T[], callback: (item: T) => Promise<void>): Promise<void> => {
	if(item) {
		if(item instanceof Array) {
			await Promise.all(item.map(callback));
		} else {
			await callback(item);
		}
	}
};

export const transformArrayOrSingleAsyncParallel = async <T,U>(item: T | T[] | undefined, callback: (item: T) => Promise<U>): Promise<U | U[] | undefined> => {
	if(item) {
		if(item instanceof Array) {
			return await Promise.all(item.map(callback));
		} else {
			return await callback(item);
		}
	} else {
		return item as any;
	}
};

export const pushToArray = <T>(arrayOrSingle: (T | T[] | undefined), item: T): T[] => {
	if(arrayOrSingle instanceof Array) {
		arrayOrSingle.push(item);
		return arrayOrSingle;
	} else if(arrayOrSingle) {
		return [arrayOrSingle, item];
	} else {
		return [item];
	}
};

export const findInArrayOrSingle = <T>(arrayOrSingle: (T | T[] | undefined), predicate: (item: T) => boolean) => {
	if(arrayOrSingle instanceof Array) {
		return arrayOrSingle.find(predicate);
	} else if(arrayOrSingle) {
		if(predicate(arrayOrSingle)) {
			return arrayOrSingle;
		}
	}
	return undefined;
};

export const firstOrSingle = <T>(arrayOrSingle: (T | T[] | undefined)): T | undefined => {
	if(arrayOrSingle instanceof Array) {
		return arrayOrSingle[0];
	} else if(arrayOrSingle) {
		return arrayOrSingle;
	}
	return undefined;
};

export const isNullOrEmpty = (obj: any) => {
	return (!obj || (obj instanceof Array && obj.length === 0));
};

export const mergeObjects = <T1 extends {[key: (string | number)]: any}, T2 extends {[key: (string | number)]: any}>(obj1: T1, obj2: T2 | null | undefined): (T1 & T2) => {
	const newObj: any = {...obj1};
	if(obj2) {
		for(const key in obj2) {
			const val = obj2[key];
			if(val !== undefined || newObj[key] === undefined) {
				newObj[key] = val;
			}
		}
	}
	return newObj;
}
