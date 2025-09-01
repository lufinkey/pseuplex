import http from 'http';
import zlib from 'zlib';
import express from 'express';
import expressHttpProxy from 'express-http-proxy';
import httpProxy from 'http-proxy';
import {
	parseHttpContentType,
	parseHttpContentTypeFromHeader,
	plexXMLToJS,
	serializeResponseContent
} from './serialization';
import * as constants from '../constants';
import { Logger } from '../logging';
import {
	IPv4NormalizeMode,
	normalizeIPAddress
} from '../utils/ip';
import {
	getPortFromRequest,
	remoteAddressOfRequest,
	requestIsEncrypted
} from '../utils/requesthandling';
import { httpError } from '../utils/error';

export type PlexProxyOptions = {
	trustProxy: boolean;
	logger?: Logger;
	ipv4Mode?: (IPv4NormalizeMode | (() => IPv4NormalizeMode));
};

type ProxiedUserReq = express.Request & {
	___proxyReqOpts: http.RequestOptions;
};

type ProxiedResponse = http.IncomingMessage & {
	___proxyReq: http.ClientRequest;
};

type ProxyingUserResponse = express.Response & {
	___proxyReq: http.ClientRequest;
}

type XForwardedHeaders = {
	'X-Forwarded-For': string,
	'X-Forwarded-Port': string,
	'X-Forwarded-Proto': string,
	'X-Forwarded-Host': string | undefined,
	'X-Real-IP': string | undefined,
	'Forwarded': undefined,
};

const xForwardedHeaders = (req: http.IncomingMessage, options: {ipv4Mode: IPv4NormalizeMode, trustProxy: boolean}): XForwardedHeaders => {
	const headers: Partial<XForwardedHeaders> = {};
	const encrypted = requestIsEncrypted(req);
	const remoteAddress = remoteAddressOfRequest(req);
	const fwdHeaders = {
		For: remoteAddress ? normalizeIPAddress(remoteAddress, options.ipv4Mode) : remoteAddress,
		Port: getPortFromRequest(req),
		Proto: encrypted ? 'https' : 'http',
	};
	for(const headerSuffix of Object.keys(fwdHeaders)) {
		const headerName = `X-Forwarded-${headerSuffix}`;
		const lowercaseHeaderName = headerName.toLowerCase();
		let prevHeaderItems = req.headers[headerName] || req.headers[lowercaseHeaderName];
		prevHeaderItems = (prevHeaderItems instanceof Array) ? prevHeaderItems.flat(Infinity)[0] : prevHeaderItems;
		const newHeaderItem = fwdHeaders[headerSuffix];
		let headerValue: string | undefined;
		if(newHeaderItem) {
			// if the proxy is trusted, we can append the value. otherwise just set it.
			if(options.trustProxy) {
				headerValue = (prevHeaderItems ? `${prevHeaderItems}, ` : '') + newHeaderItem;
			} else {
				headerValue = newHeaderItem;
			}
		} else {
			let missingThing = headerSuffix.toLowerCase();
			if(missingThing == 'for') {
				missingThing = 'remote address';
			}
			throw httpError(400, `Missing ${missingThing} in request`);
		}
		headers[headerName] = headerValue;
	}
	// overwrite x-forwarded-host header
	let fwdHost;
	if(options.trustProxy) {
		fwdHost = (req.headers['x-forwarded-host'] || req.headers['host']);
	} else {
		fwdHost = req.headers['host'];
	}
	fwdHost = (fwdHost instanceof Array) ? fwdHost.flat(Infinity)[0] : fwdHost;
	headers['X-Forwarded-Host'] = fwdHost || undefined;
	// set x-real-ip header
	const incomingRealIPHeader = req.headers['x-real-ip'];
	let realIP = (options.trustProxy && incomingRealIPHeader) ? incomingRealIPHeader : fwdHeaders.For;
	realIP = (realIP instanceof Array) ? realIP.flat(Infinity)[0] : realIP;
	headers['X-Real-IP'] = realIP || undefined;
	headers['Forwarded'] = undefined; // just delete this header always for now
	return headers as XForwardedHeaders;
};

type HostOrHostGetter = (string | ((req: express.Request) => string));

export const plexThinProxy = (host: HostOrHostGetter, options: PlexProxyOptions, proxyFilters: expressHttpProxy.ProxyOptions = {}) => {
	proxyFilters = {
		...proxyFilters,
		preserveHostHdr: proxyFilters.preserveHostHdr ?? true,
		memoizeHost: proxyFilters.memoizeHost ?? false,
	};
	const innerProxyReqOptDecorator = proxyFilters.proxyReqOptDecorator;
	proxyFilters.proxyReqOptDecorator = async (reqOpts, userReq) => {
		const ipv4Mode = ((options.ipv4Mode instanceof Function) ? options.ipv4Mode() : options.ipv4Mode)
			?? IPv4NormalizeMode.DontChange;
		reqOpts.headers ??= {};
		// add x-forwarded headers
		const xFwdHeaders = xForwardedHeaders(userReq, {
			ipv4Mode,
			trustProxy:options.trustProxy
		});
		for(const headerName of Object.keys(xFwdHeaders)) {
			delete reqOpts.headers[headerName];
			delete reqOpts.headers[headerName.toLowerCase()];
			const headerVal = xFwdHeaders[headerName];
			if(headerVal) {
				reqOpts.headers[headerName] = headerVal;
			}
		}
		// call passed-in modifier
		if(innerProxyReqOptDecorator) {
			reqOpts = await innerProxyReqOptDecorator(reqOpts, userReq);
		}
		(userReq as ProxiedUserReq).___proxyReqOpts = reqOpts;
		return reqOpts;
	};
	const innerProxyReqPathResolver = proxyFilters.proxyReqPathResolver;
	proxyFilters.proxyReqPathResolver = async (userReq) => {
		let url: string;
		if(innerProxyReqPathResolver) {
			url = await innerProxyReqPathResolver(userReq);
		} else {
			url = userReq.url;
		}
		// log proxy request
		const proxyReqOpts = (userReq as ProxiedUserReq).___proxyReqOpts;
		delete (userReq as Partial<ProxiedUserReq>).___proxyReqOpts;
		options?.logger?.logProxyingRequest(userReq, proxyReqOpts, url);
		return url;
	};
	return expressHttpProxy(host, proxyFilters);
};

export const plexProxy = (host: HostOrHostGetter, options: PlexProxyOptions, proxyFilters: expressHttpProxy.ProxyOptions = {}) => {
	return plexThinProxy(host, options, {
		...proxyFilters,
		userResHeaderDecorator: (headers, userReq, userRes, proxyReq, proxyRes) => {
			// add a custom header to the response to check if we went through pseuplex
			headers[constants.APP_CUSTOM_HEADER] = 'yes';
			// call other modifier if needed
			if(proxyFilters.userResHeaderDecorator) {
				return proxyFilters.userResHeaderDecorator(headers, userReq, userRes, proxyReq, proxyRes);
			}
			return headers;
		}
	});
};

export type PlexAPIProxyFilters = {
	filter?: (req: express.Request, res: express.Response) => (boolean | Promise<boolean>),
	requestOptionsModifier?: (proxyReqOpts: http.RequestOptions, userReq: express.Request) => http.RequestOptions,
	requestPathModifier?: (req: express.Request) => string | Promise<string>,
	requestBodyModifier?: (bodyContent: string, userReq: express.Request) => string | Promise<string>,
	responseHeadersModifier?: (
		headers: http.OutgoingHttpHeaders,
		userReq: express.Request,
		userRes: express.Response,
		proxyReq: http.ClientRequest,
		proxyRes: http.IncomingMessage
	) => http.OutgoingHttpHeaders;
	responseModifier?: (proxyRes: http.IncomingMessage, proxyResData: any, userReq: express.Request, userRes: express.Response) => any,
};

export const plexApiProxy = (host: HostOrHostGetter, options: PlexProxyOptions, proxyFilters: PlexAPIProxyFilters)=> {
	return plexProxy(host, options, {
		filter: proxyFilters.filter,
		parseReqBody: proxyFilters.requestBodyModifier ? true : undefined,
		proxyReqOptDecorator: async (proxyReqOpts, userReq) => {
			// transform xml request to json
			const acceptTypes = parseHttpContentTypeFromHeader(userReq, 'accept').contentTypes;
			const xmlAcceptType = acceptTypes.find((item) => item.endsWith('/xml'));
			let acceptType: string | undefined = undefined;
			let isApiRequest = false;
			if(acceptTypes.indexOf('application/json') != -1) {
				isApiRequest = true;
				acceptType = 'application/json';
			} else if(xmlAcceptType) {
				acceptType = xmlAcceptType;
				if(proxyFilters.responseModifier) {
					// since we're modifying the response, it's easier to parse as json
					if(!proxyReqOpts.headers) {
						proxyReqOpts.headers = {};
					}
					proxyReqOpts.headers['accept'] = 'application/json';
				}
				isApiRequest = true;
			} else {
				console.warn(`Unknown content type for Accept header: ${userReq.headers['accept']} ( url is ${userReq.path} )`);
			}
			// modify request destination
			/*if(userReq.protocol) {
				proxyReqOpts.protocol = userReq.protocol;
				if(proxyReqOpts.protocol && !proxyReqOpts.protocol.endsWith(':')) {
					proxyReqOpts.protocol += ':';
				}
			}
			proxyReqOpts.servername = userReq.hostname;*/
			// modify if this is an API request
			if (isApiRequest) {
				if(proxyFilters.requestOptionsModifier) {
					proxyReqOpts = await proxyFilters.requestOptionsModifier(proxyReqOpts, userReq);
				}
			}
			return proxyReqOpts;
		},
		proxyReqPathResolver: proxyFilters.requestPathModifier,
		proxyReqBodyDecorator: proxyFilters.requestBodyModifier,
		userResHeaderDecorator: (headers: http.OutgoingHttpHeaders, userReq, userRes, proxyReq, proxyRes) => {
			if(proxyFilters.responseHeadersModifier) {
				headers = proxyFilters.responseHeadersModifier(headers, userReq, userRes, proxyReq, proxyRes);
			}
			if(proxyFilters.responseModifier) {
				// set the accepted content type if we're going to change back from json to xml
				const acceptTypes = parseHttpContentTypeFromHeader(userReq, 'accept').contentTypes;
				if(acceptTypes.indexOf('application/json') == -1) {
					// response does not need to be json, so transform back into xml
					const xmlAcceptType = acceptTypes.find((item) => item.endsWith('/xml'));
					headers['content-type'] = xmlAcceptType || 'application/xml';
				}
				(proxyRes as ProxiedResponse).___proxyReq = proxyReq;
			} else {
				const logHeaders = (options.logger?.options.logProxyResponseHeaders || options.logger?.options.logUserResponseHeaders);
				options?.logger?.logProxyResponse(userReq, userRes, proxyReq, proxyRes, undefined);
				if(logHeaders) { // don't make separate logs unless we're logging response headers
					options?.logger?.logIncomingUserRequestResponse(userReq, userRes, undefined);
				} else {
					options?.logger?.logProxyAndUserResponse(userReq, userRes, proxyRes, headers, undefined);
				}
			}
			return headers;
		},
		userResDecorator: proxyFilters.responseModifier ? async (proxyRes, proxyResData, userReq, userRes) => {
			const proxyReq = (proxyRes as ProxiedResponse).___proxyReq;
			delete (proxyRes as Partial<ProxiedResponse>).___proxyReq;
			const logHeaders = (options.logger?.options.logProxyResponseHeaders || options.logger?.options.logUserResponseHeaders);
			// decode proxy response string
			let proxyResString: string;
			try {
				proxyResString = proxyResData?.toString('utf8');
			} catch(error) {
				// log proxy response
				options?.logger?.logProxyAndUserResponse(userReq, userRes, proxyRes, undefined, undefined);
				console.error(`Failed to decode proxy response data to utf8:`);
				console.error(error);
				return proxyResData;
			}
			// check content type
			const contentType = parseHttpContentType(proxyRes.headers['content-type']).contentTypes[0];
			let isXml: boolean;
			let assumed = false;
			if(contentType?.endsWith('/xml')) {
				isXml = true;
			}
			else if(contentType == 'application/json') {
				isXml = false;
			}
			else if(proxyResString?.startsWith('{')) {
				isXml = false;
				assumed = true;
			}
			else if(proxyResString?.startsWith('<?xml')) {
				isXml = true;
				assumed = true;
			}
			else {
				// log user response if needed
				options.logger?.logProxyAndUserResponse(userReq, userRes, proxyRes, undefined, proxyResString);
				return proxyResData;
			}
			// remove any compression headers, since we're modifying it
			if(userRes.headersSent) {
				console.error("Too late to remove headers");
			} else {
				userRes.removeHeader('content-encoding');
				userRes.removeHeader('x-plex-content-original-length');
				userRes.removeHeader('x-plex-content-compressed-length');
				userRes.removeHeader('content-length');
			}
			// log proxy response
			options?.logger?.logProxyResponse(userReq, userRes, proxyReq, proxyRes, (logHeaders ? proxyResString : undefined));
			if(assumed) {
				console.warn(`No content type was specified in response, but detected ${isXml ? 'xml' : 'json'}`);
			}
			// parse response content
			let resData;
			if(isXml) {
				// parse xml
				console.warn(`Expected json response, but got xml`);
				resData = await plexXMLToJS(proxyResString);
			} else {
				// parse json
				resData = await JSON.parse(proxyResString);
			}
			// don't modify errors
			if(proxyRes.statusCode && proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
				// modify response
				if(proxyFilters.responseModifier) {
					resData = await proxyFilters.responseModifier(proxyRes, resData, userReq, userRes);
				}
			}
			// serialize response
			const serializedRes = await serializeResponseContent(userReq, userRes, resData);
			let encodedResData = serializedRes.data;
			// encode user response
			if(proxyRes.headers['content-encoding']) {
				const encoding = proxyRes.headers['content-encoding'];
				// need to do this so this proxy library doesn't encode the content later
				delete proxyRes.headers['content-encoding'];
				// encode
				if(encoding == 'gzip') {
					encodedResData = await new Promise((resolve, reject) => {
						zlib.gzip(serializedRes.data, (error, result) => {
							if(error) {
								reject(error);
							} else {
								resolve(result);
							}
						});
					});
					userRes.setHeader('Content-Encoding', encoding);
					userRes.setHeader('X-Plex-Content-Original-Length', serializedRes.data.length);
					userRes.setHeader('X-Plex-Content-Compressed-Length', encodedResData.length);
				}
			}
			userRes.setHeader('Content-Length', encodedResData.length);
			// log user response if needed
			options.logger?.logIncomingUserRequestResponse(userReq, userRes, serializedRes.dataString);
			return encodedResData;
		} : undefined
	});
};



export type PlexHttpProxyEvents = {
	onProxyResponse?: (proxyReq: http.ClientRequest, proxyRes: http.IncomingMessage, userReq: express.Request, userRes: express.Response) => void,
};

export const plexHttpProxy = (serverURL: string, options: PlexProxyOptions, events?: PlexHttpProxyEvents) => {
	const plexGeneralProxy = httpProxy.createProxyServer({
		target: serverURL,
		ws: true,
		xfwd: false, // we'll set this later
		preserveHeaderKeyCase: true,
		//changeOrigin: false,
		//autoRewrite: true,
	});
	const shouldHandleProxyResponse = (events?.onProxyResponse || options.logger?.options.logProxyResponses || options.logger?.options.logUserResponses || options.logger?.options.logProxyErrorResponseBody);
	// handle proxy request
	plexGeneralProxy.on('proxyReq', (proxyReq, userReq: express.Request, userRes: express.Response) => {
		const ipv4Mode = ((options.ipv4Mode instanceof Function) ? options.ipv4Mode() : options.ipv4Mode)
			?? IPv4NormalizeMode.DontChange;
		// add x-forwarded headers
		const xFwdHeaders = xForwardedHeaders(userReq, {
			ipv4Mode,
			trustProxy:options.trustProxy
		});
		for(const headerName of Object.keys(xFwdHeaders)) {
			proxyReq.removeHeader(headerName);
			proxyReq.removeHeader(headerName.toLowerCase());
			const headerVal = xFwdHeaders[headerName];
			if(headerVal) {
				proxyReq.setHeader(headerName, headerVal);
			}
		}
		// log proxy request if needed
		options.logger?.logProxyRequest(userReq, proxyReq);
		if(shouldHandleProxyResponse) {
			(userRes as ProxyingUserResponse).___proxyReq = proxyReq;
		}
	});
	// handle websocket proxy request
	plexGeneralProxy.on('proxyReqWs', (proxyReq, userReq, socket, reqOpts, head) => {
		const ipv4Mode = ((options.ipv4Mode instanceof Function) ? options.ipv4Mode() : options.ipv4Mode)
			?? IPv4NormalizeMode.DontChange;
		// add x-forwarded headers
		const xFwdHeaders = xForwardedHeaders(userReq, {
			ipv4Mode,
			trustProxy:options.trustProxy
		});
		for(const headerName of Object.keys(xFwdHeaders)) {
			proxyReq.removeHeader(headerName);
			proxyReq.removeHeader(headerName.toLowerCase());
			const headerVal = xFwdHeaders[headerName];
			if(headerVal) {
				proxyReq.setHeader(headerName, headerVal);
			}
		}
		// TODO log proxied websocket request if needed?
	});
	// handle proxy response if needed
	if(shouldHandleProxyResponse) {
		plexGeneralProxy.on('proxyRes', (proxyRes, userReq: express.Request, userRes: express.Response) => {
			const encoding = proxyRes.headers['content-encoding'];
			const proxyReq = (userRes as ProxyingUserResponse).___proxyReq;
			delete (userRes as Partial<ProxyingUserResponse>).___proxyReq;
			// log if needed
			const logOpts = options.logger?.options;
			if(logOpts && (logOpts.logProxyResponses || logOpts.logProxyErrorResponseBody || logOpts.logUserResponses)) {
				const logHeaders = logOpts.logProxyResponseHeaders || logOpts.logUserResponseHeaders;
				const logProxyResponseBody = (callback?: () => void) => {
					// log proxy response body
					const datas: Buffer[] = [];
					proxyRes.on('data', (chunk) => {
						datas.push(chunk);
					});
					proxyRes.once('end', () => {
						// TODO decode gzip encoding?
						const fullData = Buffer.concat(datas);
						if(encoding == 'gzip') {
							zlib.gunzip(fullData, (error, decodedFullData) => {
								if(error) {
									console.error(`Error calling gunzip for response:`);
									console.error(error);
								}
								if(decodedFullData) {
									const fullDataString = decodedFullData.toString('utf8');
									if(fullDataString) {
										console.log(fullDataString);
									}
								}
								callback?.();
							});
							return;
						}
						const fullDataString = fullData.toString('utf8');
						if(fullDataString) {
							console.log(fullDataString);
						}
						callback?.();
					});
				};
				const isProxyResError = (!proxyRes.statusCode || proxyRes.statusCode < 200 || proxyRes.statusCode >= 300);
				if(logHeaders || events?.onProxyResponse || proxyReq.path != userReq.originalUrl) {
					// log proxy response if needed
					if(options.logger?.logProxyResponse(userReq, userRes, proxyReq, proxyRes, undefined)) {
						if(options.logger.options?.logProxyErrorResponseBody && isProxyResError) {
							logProxyResponseBody(() => {
								console.log();
							});
						}
					}
					// handle proxy response
					events?.onProxyResponse?.(proxyReq, proxyRes, userReq, userRes);
					// log user response when finished
					if(options.logger?.options.logUserResponses) {
						userRes.once('close', () => {
							options?.logger?.logIncomingUserRequestResponse(userReq, userRes, undefined);
						});
					}
				} else {
					// log response if needed
					if(options.logger?.logProxyAndUserResponse(userReq, userRes, proxyRes, undefined, undefined)) {
						if(options.logger?.options.logProxyErrorResponseBody && isProxyResError) {
							logProxyResponseBody(() => {
								console.log();
							});
						} else {
							console.log();
						}
					}
				}
			} else {
				// handle proxy response
				events?.onProxyResponse?.(proxyReq, proxyRes, userReq, userRes);
			}
		});
	}
	return plexGeneralProxy;
};
