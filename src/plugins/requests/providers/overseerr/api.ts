
import qs from 'querystring';
import {
	ResultsPage,
	UsersSortType,
	User,
	MediaType,
	MediaRequestItem,
	Language,
	Movie,
	TVShow
} from './apitypes';
import { httpResponseError } from '../../../../utils/error';

export type OverseerrAPIRequestOptions = {
	serverURL: string,
	apiKey?: string,
	verbose?: boolean,
};

const overseerrFetch = async (options: {
	serverURL: string,
	method?: 'GET' | 'POST' | 'PUT' | 'DELETE',
	endpoint: string,
	params?: { [key: string]: any } | null,
	headers?: { [key: string]: string },
	apiKey?: string | null,
	verbose?: boolean,
}) => {
	// build URL
	let url: string;
	if (options.serverURL.endsWith('/') || options.endpoint.startsWith('/')) {
		url = options.serverURL + options.endpoint;
	} else {
		url = `${options.serverURL}/${options.endpoint}`;
	}
	// build parameters
	const method = options.method ?? 'GET';
	if (method === 'GET' && options.params) {
		const paramsQs = qs.stringify(options.params);
		if (paramsQs.length > 0) {
			if (url.indexOf('?') == -1) {
				url += '?';
			} else if (!url.endsWith('?')) {
				url += '&';
			}
			url += paramsQs;
		}
	}
	const headers = {};
	let reqBody: string | undefined = undefined;
	if (options.apiKey) {
		headers['X-Api-Key'] = options.apiKey;
	}
	if (method != 'GET' && options.params) {
		headers['Content-Type'] = 'application/json';
		reqBody = JSON.stringify(options.params);
	}
	// send request
	if(options.verbose) {
		console.log(`Sending request ${method} ${url}`);
		if(reqBody) {
			console.log(reqBody);
		}
	}
	// send request
	const res = await fetch(url, {
		method,
		headers,
		body: reqBody
	});
	if (!res.ok) {
		if(options.verbose) {
			console.error(`Got response ${res.status} for ${method} ${url}: ${res.statusText}`);
		}
		res.body?.cancel();
		throw httpResponseError(url, res);
	}
	// parse response
	const resBody = await res.text();
	if (!resBody) {
		return undefined;
	}
	const resData = JSON.parse(resBody);
	if(res.status != 200 && resData.message && Object.keys(resData).length == 1) {
		throw httpResponseError(url, res, resData.message);
	}
	return resData;
};



export const getUsers = async (params: {
	take?: number,
	skip?: number,
	sort?: UsersSortType
}, options: OverseerrAPIRequestOptions): Promise<ResultsPage<User>> => {
	return await overseerrFetch({
		...options,
		method: 'GET',
		endpoint: 'api/v1/user',
		params,
	});
};



export type CreateRequestItem = {
	mediaType: MediaType;
	mediaId?: number;
	tvdbId?: number;
	seasons?: number[];
	is4k?: boolean;
	serverId?: number;
	profileId?: number;
	rootFolder?: string;
	languageProfileId?: number;
	userId?: number;
};

export const createRequest = async (params: CreateRequestItem, options: OverseerrAPIRequestOptions): Promise<MediaRequestItem> => {
	return await overseerrFetch({
		...options,
		method: 'POST',
		endpoint: 'api/v1/request',
		params,
	});
};



export const getMovie = async (movieId: string | number, params: {
	language?: Language
} | null, options: OverseerrAPIRequestOptions): Promise<Movie> => {
	return await overseerrFetch({
		...options,
		serverURL: options.serverURL,
		method: 'GET',
		endpoint: `api/v1/movie/${movieId}`,
		params,
	});
};

export const getTV = async (tvId: string | number, params: {
	language?: Language
} | null, options: OverseerrAPIRequestOptions): Promise<TVShow> => {
	return await overseerrFetch({
		...options,
		method: 'GET',
		endpoint: `api/v1/tv/${tvId}`,
		params,
	});
};
