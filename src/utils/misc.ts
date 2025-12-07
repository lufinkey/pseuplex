
export type WithOptionalProps<T> = {
	[key in keyof T]?: T[key]
};

export type WithOptionalPropsRecursive<T> = T extends Array<infer U> ? Array<WithOptionalPropsRecursive<U>> : {
	[key in keyof T]?: WithOptionalPropsRecursive<T[key]>
};

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

export const forArrayOrSingle = <T>(item: T | T[] | undefined, callback: (item: T, index: number) => void) => {
	if(item) {
		if(item instanceof Array) {
			item.forEach(callback);
		} else {
			callback(item, 0);
		}
	}
};

export const transformArrayOrSingle = <T,U>(item: T | T[] | undefined, callback: (item: T, index: number) => U): (U | U[]) => {
	if(item) {
		if(item instanceof Array) {
			return item.map(callback);
		} else {
			return callback(item, 0);
		}
	} else {
		return item as any;
	}
};

export const forArrayOrSingleAsyncParallel = async <T>(item: T | T[], callback: (item: T, index: number) => Promise<void>): Promise<void> => {
	if(item) {
		if(item instanceof Array) {
			await Promise.all(item.map(callback));
		} else {
			await callback(item, 0);
		}
	}
};

export const transformArrayOrSingleAsyncParallel = async <T,U>(item: T | T[] | undefined, callback: (item: T, index: number) => Promise<U>): Promise<U | U[] | undefined> => {
	if(item) {
		if(item instanceof Array) {
			return await Promise.all(item.map(callback));
		} else {
			return await callback(item, 0);
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

export const arrayFromArrayOrSingle = <T>(arrayOrSingle: (T | T[] | undefined)): T[] => {
	if(arrayOrSingle instanceof Array) {
		return arrayOrSingle;
	} else if(arrayOrSingle) {
		return [arrayOrSingle];
	}
	return [];
};

export const isArrayNullOrEmpty = (obj: any) => {
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
};
