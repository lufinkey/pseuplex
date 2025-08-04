
import url from 'url';
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
	requestIsEncrypted
} from '../utils/requesthandling';

export type PlexProxyOptions = {
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

export const plexThinProxy = (serverURL: string, options: PlexProxyOptions, proxyOptions: expressHttpProxy.ProxyOptions = {}) => {
	proxyOptions = {
		preserveHostHdr: true,
		...proxyOptions
	};
	const innerProxyReqOptDecorator = proxyOptions.proxyReqOptDecorator;
	proxyOptions.proxyReqOptDecorator = async (reqOpts, userReq) => {
		const ipv4Mode = ((options.ipv4Mode instanceof Function) ? options.ipv4Mode() : options.ipv4Mode)
			?? IPv4NormalizeMode.DontChange;
		reqOpts.headers ??= {};
		// add x-forwarded headers
		const encrypted = requestIsEncrypted(userReq);
		const remoteAddress = userReq.connection?.remoteAddress || userReq.socket?.remoteAddress;
		const fwdHeaders = {
			For: remoteAddress ? normalizeIPAddress(remoteAddress, ipv4Mode) : remoteAddress,
			Port: getPortFromRequest(userReq),
			Proto: encrypted ? 'https' : 'http',
		};
		for(const headerSuffix in fwdHeaders) {
			if(headerSuffix == null) {
				continue;
			}
			const headerName = 'X-Forwarded-' + headerSuffix;
			const lowercaseHeaderName = headerName.toLowerCase();
			const prevHeaderVal = userReq.headers[headerName] || userReq.headers[lowercaseHeaderName];
			const newHeaderVal = fwdHeaders[headerSuffix];
			if(newHeaderVal) {
				const headerVal = (prevHeaderVal ? `${prevHeaderVal},` : '') + newHeaderVal;
				delete reqOpts.headers[lowercaseHeaderName];
				reqOpts.headers[headerName] = headerVal;
			}
		}
		const fwdHost = userReq.headers['x-forwarded-host'] || userReq.headers['host'];
		if(fwdHost) {
			delete reqOpts.headers['x-forwarded-host'];
			reqOpts.headers['X-Forwarded-Host'] = fwdHost;
		}
		const realIP = userReq.headers['x-real-ip'] || fwdHeaders.For;
		if(realIP) {
			delete reqOpts.headers['x-real-ip'];
			reqOpts.headers['X-Real-IP'] = realIP;
		}
		if(innerProxyReqOptDecorator) {
			reqOpts = await innerProxyReqOptDecorator(reqOpts, userReq);
		}
		(userReq as ProxiedUserReq).___proxyReqOpts = reqOpts;
		return reqOpts;
	};
	const innerProxyReqPathResolver = proxyOptions.proxyReqPathResolver;
	proxyOptions.proxyReqPathResolver = async (userReq) => {
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
	return expressHttpProxy(serverURL, proxyOptions);
};

export const plexProxy = (serverURL: string, args: PlexProxyOptions, opts: expressHttpProxy.ProxyOptions = {}) => {
	return plexThinProxy(serverURL, args, {
		...opts,
		userResHeaderDecorator: (headers, userReq, userRes, proxyReq, proxyRes) => {
			// add a custom header to the response to check if we went through pseuplex
			headers[constants.APP_CUSTOM_HEADER] = 'yes';
			// call other modifier if needed
			if(opts.userResHeaderDecorator) {
				return opts.userResHeaderDecorator(headers, userReq, userRes, proxyReq, proxyRes);
			}
			return headers;
		}
	});
};

export const plexApiProxy = (serverURL: string, args: PlexProxyOptions, opts: {
	filter?: (req: express.Request, res: express.Response) => (boolean | Promise<boolean>),
	requestOptionsModifier?: (proxyReqOpts: http.RequestOptions, userReq: express.Request) => http.RequestOptions,
	requestPathModifier?: (req: express.Request) => string | Promise<string>,
	requestBodyModifier?: (bodyContent: string, userReq: express.Request) => string | Promise<string>,
	responseModifier?: (proxyRes: http.IncomingMessage, proxyResData: any, userReq: express.Request, userRes: express.Response) => any
})=> {
	return plexProxy(serverURL, args, {
		filter: opts.filter,
		parseReqBody: opts.requestBodyModifier ? true : undefined,
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
				if(opts.responseModifier) {
					// since we're modifying the response, it's easier to parse as json
					if(!proxyReqOpts.headers) {
						proxyReqOpts.headers = {};
					}
					proxyReqOpts.headers['accept'] = 'application/json';
				}
				isApiRequest = true;
			} else {
				console.warn(`Unknown content type for Accept header: ${userReq.headers['accept']}`);
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
				if(opts.requestOptionsModifier) {
					proxyReqOpts = await opts.requestOptionsModifier(proxyReqOpts, userReq);
				}
			}
			return proxyReqOpts;
		},
		proxyReqPathResolver: opts.requestPathModifier,
		proxyReqBodyDecorator: opts.requestBodyModifier,
		userResHeaderDecorator: (headers, userReq, userRes, proxyReq, proxyRes) => {
			if(opts.responseModifier) {
				// set the accepted content type if we're going to change back from json to xml
				const acceptTypes = parseHttpContentTypeFromHeader(userReq, 'accept').contentTypes;
				if(acceptTypes.indexOf('application/json') == -1) {
					// response does not need to be json, so transform back into xml
					const xmlAcceptType = acceptTypes.find((item) => item.endsWith('/xml'));
					headers['content-type'] = xmlAcceptType || 'application/xml';
				}
				(proxyRes as ProxiedResponse).___proxyReq = proxyReq;
			} else {
				const logHeaders = (args.logger?.options.logProxyResponseHeaders || args.logger?.options.logUserResponseHeaders);
				args?.logger?.logProxyResponse(userReq, userRes, proxyReq, proxyRes, undefined);
				if(logHeaders) { // don't make separate logs unless we're logging response headers
					args?.logger?.logIncomingUserRequestResponse(userReq, userRes, undefined);
				} else {
					args?.logger?.logProxyAndUserResponse(userReq, userRes, proxyRes, headers, undefined);
				}
			}
			return headers;
		},
		userResDecorator: opts.responseModifier ? async (proxyRes, proxyResData, userReq, userRes) => {
			const proxyReq = (proxyRes as ProxiedResponse).___proxyReq;
			delete (proxyRes as Partial<ProxiedResponse>).___proxyReq;
			const logHeaders = (args.logger?.options.logProxyResponseHeaders || args.logger?.options.logUserResponseHeaders);
			// decode proxy response string
			let proxyResString: string;
			try {
				proxyResString = proxyResData?.toString('utf8');
			} catch(error) {
				// log proxy response
				args?.logger?.logProxyAndUserResponse(userReq, userRes, proxyRes, undefined, undefined);
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
				args.logger?.logProxyAndUserResponse(userReq, userRes, proxyRes, undefined, proxyResString);
				return proxyResData;
			}
			// remove any compression headers, since we're modifying it
			if(userRes.headersSent) {
				console.error("Too late to remove headers");
			} else {
				userRes.removeHeader('x-plex-content-original-length');
				userRes.removeHeader('x-plex-content-compressed-length');
				userRes.removeHeader('content-length');
			}
			// log proxy response
			args?.logger?.logProxyResponse(userReq, userRes, proxyReq, proxyRes, (logHeaders ? proxyResString : undefined));
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
				if(opts.responseModifier) {
					resData = await opts.responseModifier(proxyRes, resData, userReq, userRes);
				}
			}
			// serialize response
			const resDataString = (await serializeResponseContent(userReq, userRes, resData)).data;
			let encodedResData: (Buffer | string) = resDataString;
			// encode user response
			if(proxyRes.headers['content-encoding']) {
				const encoding = proxyRes.headers['content-encoding'];
				// need to do this so this proxy library doesn't encode the content later
				delete proxyRes.headers['content-encoding'];
				userRes.removeHeader('content-encoding');
				// encode
				if(encoding == 'gzip') {
					encodedResData = await new Promise((resolve, reject) => {
						zlib.gzip(resDataString, (error, result) => {
							if(error) {
								reject(error);
							} else {
								resolve(result);
							}
						});
					});
					userRes.setHeader('Content-Encoding', encoding);
					userRes.setHeader('X-Plex-Content-Original-Length', resDataString.length);
					userRes.setHeader('X-Plex-Content-Compressed-Length', encodedResData.length);
					userRes.setHeader('Content-Length', encodedResData.length);
				}
			}
			// log user response if needed
			args.logger?.logIncomingUserRequestResponse(userReq, userRes, resDataString);
			return encodedResData;
		} : undefined
	});
};




export const plexHttpProxy = (serverURL: string, args: PlexProxyOptions) => {
	const plexGeneralProxy = httpProxy.createProxyServer({
		target: serverURL,
		ws: true,
		xfwd: true,
		preserveHeaderKeyCase: true,
		//changeOrigin: false,
		//autoRewrite: true,
	});
	const shouldHandleProxyResponse = (args.logger?.options.logProxyResponses || args.logger?.options.logUserResponses || args.logger?.options.logProxyErrorResponseBody);
	plexGeneralProxy.on('proxyReq', (proxyReq, userReq: express.Request, userRes: express.Response) => {
		const ipv4Mode = ((args.ipv4Mode instanceof Function) ? args.ipv4Mode() : args.ipv4Mode)
			?? IPv4NormalizeMode.DontChange;
		// add x-real-ip to proxy headers
		if (!userReq.headers['x-real-ip']) {
			const realIP = userReq.connection?.remoteAddress || userReq.socket?.remoteAddress;
			const normalizedIP = realIP ? normalizeIPAddress(realIP, ipv4Mode) : realIP;
			if(normalizedIP) {
				proxyReq.setHeader('X-Real-IP', normalizedIP);
			}
			// fix forwarded header if needed
			if(normalizedIP != realIP) {
				const forwardedFor = proxyReq.getHeader('X-Forwarded-For');
				if(forwardedFor && typeof forwardedFor === 'string') {
					const newForwardedFor = forwardedFor.split(',').map((part) => {
						const trimmedPart = part.trim();
						return normalizeIPAddress(trimmedPart, ipv4Mode);
					}).join(',');
					proxyReq.setHeader('X-Forwarded-For', newForwardedFor);
				}
			}
		}
		// log proxy request if needed
		args.logger?.logProxyRequest(userReq, proxyReq);
		if(shouldHandleProxyResponse) {
			(userRes as ProxyingUserResponse).___proxyReq = proxyReq;
		}
	});
	if(shouldHandleProxyResponse) {
		plexGeneralProxy.on('proxyRes', (proxyRes, userReq: express.Request, userRes: express.Response) => {
			const proxyReq = (userRes as ProxyingUserResponse).___proxyReq;
			delete (userRes as Partial<ProxyingUserResponse>).___proxyReq;
			const logHeaders = args.logger?.options.logProxyResponseHeaders || args.logger?.options.logUserResponseHeaders;
			const logProxyResponseBody = (callback?: () => void) => {
				// log proxy response body
				const datas: Buffer[] = [];
				proxyRes.on('data', (chunk) => {
					datas.push(chunk);
				});
				proxyRes.on('end', () => {
					console.log("end");
					const fullData = Buffer.concat(datas);
					const fullDataString = fullData?.toString('utf8');
					if(fullDataString) {
						console.log(fullDataString);
					}
					callback?.();
				});
			};
			const isProxyResError = (!proxyRes.statusCode || proxyRes.statusCode < 200 || proxyRes.statusCode >= 300);
			if(logHeaders || proxyReq.path != userReq.originalUrl) {
				// log proxy response if needed
				if(args.logger?.logProxyResponse(userReq, userRes, proxyReq, proxyRes, undefined)) {
					if(args.logger.options?.logProxyErrorResponseBody && isProxyResError) {
						logProxyResponseBody();
					}
				}
				// log user response when finished
				if(args.logger?.options.logUserResponses) {
					userRes.on('close', () => {
						args?.logger?.logIncomingUserRequestResponse(userReq, userRes, undefined);
					});
				}
			} else {
				// log response if needed
				if(args.logger?.logProxyAndUserResponse(userReq, userRes, proxyRes, undefined, undefined)) {
					if(args.logger?.options.logProxyErrorResponseBody && isProxyResError) {
						logProxyResponseBody(() => {
							console.log();
						});
					} else {
						console.log();
					}
				}
			}
		});
	}
	return plexGeneralProxy;
};
