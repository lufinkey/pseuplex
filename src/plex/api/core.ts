import qs from 'querystring';
import { PlexAuthContext } from '../types';
import { parseHttpContentType, plexXMLToJS } from '../serialization';
import { Logger } from '../../logging';
import { httpResponseError } from '../../utils/error';

export type PlexAPIRequestOptions = {
	serverURL: string,
	authContext?: PlexAuthContext | null,
	logger?: Logger,
};

export type PlexServerFetchOptions = PlexAPIRequestOptions & {
	method?: 'GET' | 'POST' | 'PUT' | 'DELETE',
	endpoint: string,
	params?: {[key: string]: string | number | boolean | string[] | number[]} | null,
	headers?: {[key: string]: string},
};

export const plexServerFetch = async <TResult>(options: PlexServerFetchOptions): Promise<TResult> => {
	// build URL
	let serverURL = options.serverURL;
	if(serverURL.indexOf('://') == -1) {
		serverURL = 'https://'+serverURL;
	}
	let url: string;
	if(serverURL.endsWith('/') || options.endpoint.startsWith('/')) {
		url = serverURL + options.endpoint;
	} else {
		url = `${serverURL}/${options.endpoint}`;
	}
	// perform http request
	return await plexHttpRequest(url, {
		method: options.method,
		params: options.params,
		headers: {
			'Accept': 'application/json',
			...options.headers,
		},
		authContext: options.authContext,
		logger: options.logger,
	});
};



export type PlexHttpRequestOptions = {
	method?: 'GET' | 'POST' | 'PUT' | 'DELETE',
	params?: {[key: string]: string | number | boolean | string[] | number[]} | null,
	headers?: {[key: string]: string},
	authContext?: PlexAuthContext | null,
	logger?: Logger,
};

export const plexHttpRequest = async <TResult>(url: string, options: PlexHttpRequestOptions) => {
	const method = options.method || 'GET';
	// process params
	let params = options.params;
	if(params) {
		const serializedParams: {[key: string]: any} = {};
		for(const paramName in params) {
			const paramVal = params[paramName];
			if(typeof paramVal == 'boolean') {
				serializedParams[paramName] = paramVal ? 1 : 0;
			} else if(paramVal instanceof Array) {
				serializedParams[paramName] = paramVal.join(',');
			} else if(paramVal !== undefined) {
				serializedParams[paramName] = paramVal;
			}
		}
		params = serializedParams;
	}
	// add parameters
	if(params || options.authContext) {
		url += '?';
		let hasQuery = false;
		if(params) {
			const paramsQs = qs.stringify(params);
			if(paramsQs.length > 0) {
				url += paramsQs;
				hasQuery = true;
			}
		}
		if(options.authContext) {
			const contextQs = qs.stringify(options.authContext);
			if(contextQs.length > 0) {
				if(hasQuery) {
					url += '&';
				}
				url += contextQs;
			}
		}
	}
	// send request
	const reqOpts: RequestInit = {
		method,
		headers: options.headers,
	};
	options.logger?.logOutgoingRequest(url, reqOpts);
	const res = await fetch(url, reqOpts);
	// handle failure
	if(!res.ok) {
		const resText = await res.text(); // we need to dequeue the response text to prevent a possible memory leak
		options?.logger?.logOutgoingRequestResponse(res, reqOpts, resText);
		throw httpResponseError(url, res, resText);
	}
	// get response data
	const contentType = parseHttpContentType(res.headers.get('content-type')).contentTypes[0];
	let resData: TResult;
	if(res.status == 204) {
		// no content response
		await res.text(); // clear the response data to avoid any potential memory leaks
		resData = undefined!;
	}
	else if(contentType == 'application/json') {
		// json response
		resData = (await res.json()) as any;
	}
	else {
		const resText = await res.text();
		if(!resText) {
			// empty response
			resData = undefined!;
		} else if(contentType == 'application/xml' || contentType == 'text/xml' || resText.startsWith('<')) {
			// xml response
			resData = await plexXMLToJS(resText);
		} else {
			// fallback on json response
			resData = JSON.parse(resText);
		}
	}
	options.logger?.logOutgoingRequestResponse(res, reqOpts, resData);
	return resData;
};
