
import url from 'url';
import http from 'http';
import zlib from 'zlib';
import express from 'express';
import expressHttpProxy from 'express-http-proxy';
import httpProxy from 'http-proxy';
import {
	parseHttpContentType,
	parseHttpContentTypeFromHeader,
	serializeResponseContent
} from './serialization';
import * as constants from '../constants';
import {
	urlLogString,
	URLLogStringArgs
} from '../utils/logging';
import {
	IPv4NormalizeMode,
	normalizeIPAddress
} from '../utils/ip';

export type PlexProxyLoggingOptions = {
	logProxyRequests?: boolean;
	logProxyRequestHeaders?: boolean;
	logProxyResponses?: boolean;
	logProxyResponseHeaders?: boolean;
	logProxyResponseBody?: boolean;
	logProxyErrorResponseBody?: boolean;
	logUserResponses?: boolean;
	logUserResponseHeaders?: boolean;
	logUserResponseBody?: boolean;
} & URLLogStringArgs;

export type PlexProxyOptions = PlexProxyLoggingOptions & {
	ipv4Mode?: (IPv4NormalizeMode | (() => IPv4NormalizeMode))
};

function requestIsEncrypted(req: express.Request) {
	const connection = ((req.connection || req.socket) as {encrypted?: boolean; pair?: boolean;})
	const encrypted = (connection?.encrypted || connection?.pair);
	return encrypted ? true : false;
}

function getPortFromRequest(req: express.Request) {
  const port = req.headers.host?.match(/:(\d+)/)?.[1];
  return port ?
	port
    : requestIsEncrypted(req) ? '443' : '80';
};

export const plexThinProxy = (serverURL: string, args: PlexProxyOptions, proxyOptions: expressHttpProxy.ProxyOptions = {}) => {
	proxyOptions = {
		preserveHostHdr: true,
		...proxyOptions
	};
	const innerProxyReqPathResolver = proxyOptions.proxyReqPathResolver;
	proxyOptions.proxyReqPathResolver = async (req) => {
		let url: string;
		if(innerProxyReqPathResolver) {
			url = await innerProxyReqPathResolver(req);
		} else {
			url = req.url;
		}
		// log proxy request
		if(args.logProxyRequests) {
			// TODO use remapped method
			console.log(`\nProxy ${req.method} ${urlLogString(args, url)}`);
			if(args.logProxyRequestHeaders) {
				const reqHeaderList = req.rawHeaders;
				for(let i=0; i<reqHeaderList.length; i++) {
					const headerKey = reqHeaderList[i];
					i++;
					const headerVal = reqHeaderList[i];
					console.log(`\t${headerKey}: ${headerVal}`);
				}
			}
		}
		return url;
	};
	return expressHttpProxy(serverURL, proxyOptions);
};

export const plexProxy = (serverURL: string, args: PlexProxyOptions, opts: expressHttpProxy.ProxyOptions = {}) => {
	return plexThinProxy(serverURL, args, {
		...opts,
		userResHeaderDecorator: (headers, userReq, userRes, proxyReq, proxyRes) => {
			const ipv4Mode = ((args.ipv4Mode instanceof Function) ? args.ipv4Mode() : args.ipv4Mode)
				?? IPv4NormalizeMode.DontChange;
			// add a custom header to the response to check if we went through pseuplex
			headers[constants.APP_CUSTOM_HEADER] = 'yes';
			// add x-forwarded headers
			const encrypted = requestIsEncrypted(userReq);
			const remoteAddress = userReq.connection?.remoteAddress || userReq.socket?.remoteAddress;
			const fwdHeaders = {
				For: normalizeIPAddress(remoteAddress, ipv4Mode),
				Port: getPortFromRequest(userReq),
				Proto: encrypted ? 'https' : 'http'
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
					delete headers[lowercaseHeaderName];
					headers[headerName] = headerVal;
				}
			}
			const fwdHost = userReq.headers['x-forwarded-host'] || userReq.headers['host'];
			if(fwdHost) {
				delete headers['x-forwarded-host'];
				headers['X-Forwarded-Host'] = fwdHost;
			}
			const realIP = userReq.headers['x-real-ip'] || fwdHeaders.For;
			delete headers['x-real-ip'];
			headers['X-Real-IP'] = realIP;
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
			const logHeaders = (args.logProxyResponseHeaders || args.logUserResponseHeaders);
			if(logHeaders) { // don't make separate logs unless we're logging response headers
				if(args.logProxyResponses) {
					console.log(`\nProxy Response ${proxyRes.statusCode} for ${userReq.method} ${urlLogString(args, userReq.originalUrl)}`);
					if(args.logProxyResponseHeaders) {
						const proxyResHeaderList = proxyRes.rawHeaders;
						for(let i=0; i<proxyResHeaderList.length; i++) {
							const headerKey = proxyResHeaderList[i];
							i++;
							const headerVal = proxyResHeaderList[i];
							console.log(`\t${headerKey}: ${headerVal}`);
						}
					}
				}
			}
			if(opts.responseModifier) {
				// set the accepted content type if we're going to change back from json to xml
				const acceptTypes = parseHttpContentTypeFromHeader(userReq, 'accept').contentTypes;
				if(acceptTypes.indexOf('application/json') == -1) {
					// response does not need to be json, so transform back into xml
					const xmlAcceptType = acceptTypes.find((item) => item.endsWith('/xml'));
					headers['content-type'] = xmlAcceptType || 'application/xml';
				}
			} else if(logHeaders ? args.logUserResponses : (args.logUserResponses || args.logProxyResponses)) {
				console.log(`\n${logHeaders ? "User " : ""}Response ${userRes.statusCode} for ${userReq.method} ${urlLogString(args, userReq.originalUrl)}`);
				if(args.logUserResponseHeaders) {
					const userResHeaders = userRes.getHeaders();
					for(const headerKey in userResHeaders) {
						console.log(`\t${headerKey}: ${userResHeaders[headerKey]}`);
					}
					for(const headerKey in headers) {
						console.log(`\t${headerKey}: ${headers[headerKey]}`);
					}
				}
			}
			return headers;
		},
		userResDecorator: opts.responseModifier ? async (proxyRes, proxyResData, userReq, userRes) => {
			const logHeaders = (args.logProxyResponseHeaders || args.logUserResponseHeaders);
			const isProxyResError = (!proxyRes.statusCode || proxyRes.statusCode < 200 || proxyRes.statusCode >= 300);
			const proxyResString = proxyResData?.toString('utf8');
			// log proxy response body if needed (under the previous log)
			if(logHeaders) {
				if(args.logProxyErrorResponseBody && isProxyResError) {
					console.log(proxyResString);
				}
			}
			// get response content type
			const contentType = parseHttpContentType(proxyRes.headers['content-type']).contentTypes[0];
			if(contentType != 'application/json') {
				// log user response if needed
				if(args.logUserResponses) {
					console.log(`\n${logHeaders ? "User " : ""}Response ${proxyRes.statusCode} (${contentType}) for ${userReq.method} ${urlLogString(args, userReq.originalUrl)}`);
					if(args.logUserResponseHeaders) {
						const userResHeaders = userRes.getHeaders();
						for(const headerKey in userResHeaders) {
							console.log(`\t${headerKey}: ${userResHeaders[headerKey]}`);
						}
					}
					if(!logHeaders && args.logProxyErrorResponseBody && isProxyResError) {
						console.log(proxyResString);
					}
				}
				return proxyResData;
			}
			// log proxy response if needed
			if(!logHeaders) {
				if(args.logProxyResponses) {
					console.log(`\nProxy response ${proxyRes.statusCode} for ${userReq.method} ${urlLogString(args, userReq.originalUrl)}`);
					if(args.logProxyResponseBody || (args.logProxyErrorResponseBody && isProxyResError)) {
						console.log(proxyResString);
					}
				}
			}
			// remove any compression headers, since we're modifying it
			if(userRes.headersSent) {
				console.error("Too late to remove headers");
			} else {
				userRes.removeHeader('x-plex-content-original-length');
				userRes.removeHeader('x-plex-content-compressed-length');
				userRes.removeHeader('content-length');
			}
			// parse response
			let resData = await JSON.parse(proxyResString);
			if(!proxyRes.statusCode || proxyRes.statusCode < 200 || proxyRes.statusCode >= 300) {
				// don't modify errors
				resData = (await serializeResponseContent(userReq, userRes, resData)).data;
				// log user response
				if(args.logUserResponses) {
					console.log(`\nUser response ${userRes.statusCode} for ${userReq.method} ${urlLogString(args, userReq.originalUrl)}`);
					if(args.logUserResponseHeaders) {
						const userResHeaders = userRes.getHeaders();
						for(const headerKey in userResHeaders) {
							console.log(`\t${headerKey}: ${userResHeaders[headerKey]}`);
						}
					}
					if(args.logUserResponseBody) {
						console.log(resData);
					}
				}
				return resData;
			}
			// modify response
			if(opts.responseModifier) {
				resData = await opts.responseModifier(proxyRes, resData, userReq, userRes);
			}
			// serialize response
			resData = (await serializeResponseContent(userReq, userRes, resData)).data;
			let encodedResData: (Buffer | string) = resData;
			// encode user response
			if(proxyRes.headers['content-encoding']) {
				const encoding = proxyRes.headers['content-encoding'];
				// need to do this so this proxy library doesn't encode the content later
				delete proxyRes.headers['content-encoding'];
				userRes.removeHeader('content-encoding');
				// encode
				if(encoding == 'gzip') {
					encodedResData = await new Promise((resolve, reject) => {
						zlib.gzip(resData, (error, result) => {
							if(error) {
								reject(error);
							} else {
								resolve(result);
							}
						});
					});
					userRes.setHeader('Content-Encoding', encoding);
					userRes.setHeader('X-Plex-Content-Original-Length', resData.length);
					userRes.setHeader('X-Plex-Content-Compressed-Length', encodedResData.length);
					userRes.setHeader('Content-Length', encodedResData.length);
				}
			}
			// log user response if needed
			if(args.logUserResponses) {
				console.log(`\nUser response ${userRes.statusCode} for ${userReq.method} ${urlLogString(args, userReq.originalUrl)}`);
				if(args.logUserResponseHeaders) {
					const userResHeaders = userRes.getHeaders();
					for(const headerKey in userResHeaders) {
						console.log(`\t${headerKey}: ${userResHeaders[headerKey]}`);
					}
				}
				if(args.logUserResponseBody) {
					console.log(resData);
				}
				console.log();
			}
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
	plexGeneralProxy.on('proxyReq', (proxyReq, userReq, userRes) => {
		const ipv4Mode = ((args.ipv4Mode instanceof Function) ? args.ipv4Mode() : args.ipv4Mode)
			?? IPv4NormalizeMode.DontChange;
		// add x-real-ip to proxy headers
		if (!userReq.headers['x-real-ip']) {
			const realIP = userReq.connection?.remoteAddress || userReq.socket?.remoteAddress;
			const normalizedIP = normalizeIPAddress(realIP, ipv4Mode);
			proxyReq.setHeader('X-Real-IP', normalizedIP);
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
		if(args.logProxyRequests) {
			console.log(`\nProxy ${proxyReq.method} ${urlLogString(args, proxyReq.path)}`);
			if(args.logProxyRequestHeaders) {
				const proxyReqHeaders = proxyReq.getHeaders();
				for(const headerKey in proxyReqHeaders) {
					console.log(`\t${headerKey}: ${proxyReqHeaders[headerKey]}`);
				}
			}
		}
	});
	if(args.logProxyResponses || args.logUserResponses || args.logProxyErrorResponseBody) {
		plexGeneralProxy.on('proxyRes', (proxyRes, userReq: express.Request, userRes: express.Response) => {
			const logHeaders = args.logProxyResponseHeaders || args.logUserResponseHeaders;
			const logProxyResponseBody = () => {
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
				});
			};
			const isProxyResError = (!proxyRes.statusCode || proxyRes.statusCode < 200 || proxyRes.statusCode >= 300);
			if(logHeaders || userReq.url != userReq.originalUrl) {
				// log proxy response if needed
				if(args.logProxyResponses || (args.logProxyErrorResponseBody && isProxyResError)) {
					console.log(`\nProxy Response ${proxyRes.statusCode} for ${userReq.method} ${urlLogString(args, userReq.url)}`);
					if(args.logProxyResponseHeaders) {
						const proxyResHeaderList = proxyRes.rawHeaders;
						for(let i=0; i<proxyResHeaderList.length; i++) {
							const headerKey = proxyResHeaderList[i];
							i++;
							const headerVal = proxyResHeaderList[i];
							console.log(`\t${headerKey}: ${headerVal}`);
						}
					}
					if(args.logProxyErrorResponseBody && isProxyResError) {
						logProxyResponseBody();
					}
				}
				// log user response when finished
				if(args.logUserResponses) {
					userRes.on('close', () => {
						console.log(`\nUser Response ${userRes.statusCode} for ${userReq.method} ${urlLogString(args, userReq.originalUrl)}`);
						if(args.logUserResponseHeaders) {
							const userResHeaders = userRes.getHeaders();
							for(const headerKey of Object.keys(userResHeaders)) {
								const headerVal = userResHeaders[headerKey];
								console.log(`\t${headerKey}: ${headerVal}`);
							}
						}
						console.log();
					});
				}
			} else {
				// log response if needed
				if(args.logProxyResponses || args.logUserResponses || (args.logProxyErrorResponseBody && isProxyResError)) {
					console.log(`\nResponse ${proxyRes.statusCode} for ${userReq.method} ${urlLogString(args, userReq.originalUrl)}`);
					if(args.logProxyErrorResponseBody && isProxyResError) {
						logProxyResponseBody();
					}
					console.log();
				}
			}
		});
	}
	return plexGeneralProxy;
};
