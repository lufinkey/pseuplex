
import qs from 'querystring';
import { PlexAuthContext } from '../types';
import { parseHttpContentType, plexXMLToJS } from '../serialization';
import { httpError } from '../../utils';

export const plexServerFetch = async <TResult>(options: {
	serverURL: string,
	method?: 'GET' | 'POST' | 'PUT' | 'DELETE',
	endpoint: string,
	params?: {[key: string]: any} | null,
	authContext?: PlexAuthContext | null
}): Promise<TResult> => {
	// build URL
	let serverURL = options.serverURL;
	if(serverURL.indexOf('://') == -1) {
		serverURL = 'https://'+serverURL;
	}
	let url = `${serverURL}/${options.endpoint}`;
	if(options.params != null || options.authContext != null) {
		url += '?';
		let hasQuery = false;
		if(options.params != null) {
			const paramsQs = qs.stringify(options.params);
			if(paramsQs.length > 0) {
				url += paramsQs;
				hasQuery = true;
			}
		}
		if(options.authContext != null) {
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
	const res = await fetch(url, {
		method: options.method ?? 'GET',
		headers: {
			'accept': 'application/json'
		}
	});
	if(!res.ok) {
		res.body?.cancel();
		throw httpError(res.status, res.statusText);
	}
	// parse response
	const responseText = await res.text();
	if(!responseText) {
		return undefined;
	}
	const contentTypeInfo = parseHttpContentType(res.headers['content-type']);
	if(contentTypeInfo.contentType == 'application/json') {
		return JSON.parse(responseText);
	} else if(contentTypeInfo.contentType == 'text/xml' || responseText.startsWith('<')) {
		return plexXMLToJS(responseText);
	} else {
		return JSON.parse(responseText);
	}
};
