import qs from 'querystring';

export const addProtocolToUrlIfMissing = (url: string, protocol: string) => {
	if(url.indexOf('://') === -1) {
		url = `${protocol}://${url}`;
	}
	return url;
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

export const parseURLQueryItems = (urlPath: string): (qs.ParsedUrlQuery | undefined) => {
	const queryIndex = urlPath.indexOf('?');
	if(queryIndex == -1) {
		return undefined;
	}
	const query = urlPath.substring(queryIndex+1);
	return qs.parse(query);
};
