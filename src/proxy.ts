
import url from 'url';
import http from 'http';
import express from 'express';
import expressHttpProxy from 'express-http-proxy';
import { Config } from './config';
import { CommandArguments } from './cmdargs';
import {
	parseHttpContentType,
	parseXMLStringToJson,
	serializeResponseContent
} from './serialization';

const urlLogString = (args: CommandArguments, urlString: string) => {
	if(args.logFullURLs) {
		return urlString;
	}
	const queryIndex = urlString.indexOf('?');
	if(queryIndex != -1) {
		return urlString.substring(0, queryIndex);
	}
	return urlString;
};

export const plexThinProxy = (cfg: Config, args: CommandArguments, opts: expressHttpProxy.ProxyOptions = {}) => {
	return expressHttpProxy(`${cfg.plex.host}:${cfg.plex.port}`, {
		proxyReqPathResolver(req) {
			return req.originalUrl;
		},
		...opts
	});
};

export const plexProxy = (cfg: Config, args: CommandArguments, opts: expressHttpProxy.ProxyOptions = {}) => {
	return plexThinProxy(cfg, args, {
		...opts,
		userResHeaderDecorator: (headers, userReq, userRes, proxyReq, proxyRes) => {
			// add a custom header to the response to check if we went through pseuplex
			headers['x-pseuplex'] = 'yes';
			// call other modifier if needed
			if(opts.userResHeaderDecorator) {
				return opts.userResHeaderDecorator(headers, userReq, userRes, proxyReq, proxyRes);
			}
			return headers;
		}
	});
};

export const plexApiProxy = (cfg: Config, args: CommandArguments, opts: {
	requestModifier?: (proxyReqOpts: http.RequestOptions, userReq: express.Request) => http.RequestOptions,
	responseModifier: (proxyRes: http.IncomingMessage, proxyResData: any, userReq: express.Request, userRes: express.Response) => any
})=> {
	return plexProxy(cfg, args, {
			proxyReqOptDecorator: async (proxyReqOpts, userReq) => {
				// log request if needed
				if(args.logUserRequests) {
					console.log(`\nUser ${userReq.method} ${urlLogString(args, userReq.originalUrl)}`);
				}
				// transform json request to xml
				const acceptType = parseHttpContentType(userReq.headers['accept']).contentType;
				let isApiRequest = false;
				if (acceptType == 'application/json') {
					proxyReqOpts.headers['accept'] = 'text/xml';
					isApiRequest = true;
				} else if(acceptType == 'text/xml') {
					isApiRequest = true;
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
					if(opts.requestModifier) {
						proxyReqOpts = await opts.requestModifier(proxyReqOpts, userReq);
					}
				}
				// log proxy request
				if(args.logProxyRequests) {
					console.log(`\nProxy ${proxyReqOpts.method} ${urlLogString(args, userReq.originalUrl)}`);
				}
				return proxyReqOpts;
			},
			userResHeaderDecorator: (headers, userReq, userRes, proxyReq, proxyRes) => {
				// set the accepted content type if we're changing from json to xml
				const acceptType = parseHttpContentType(userReq.headers['accept']).contentType;
				if(acceptType == 'application/json') {
					headers['content-type'] = acceptType;
				}
				return headers;
			},
			userResDecorator: async (proxyRes, proxyResData, userReq, userRes) => {
				// get response content type
				const contentType = parseHttpContentType(proxyRes.headers['content-type']).contentType;
				if(contentType != 'text/xml') {
					if(args.logProxyResponses || args.logUserResponses) {
						console.log(`\nResponse ${proxyRes.statusCode} for ${proxyRes.method} ${urlLogString(args, userReq.originalUrl)}`);
					}
					return proxyResData;
				}
				const proxyResString = proxyResData?.toString('utf8');
				// log proxy response
				if(args.logProxyResponses) {
					console.log(`\nProxy response ${proxyRes.statusCode} for ${userReq.method} ${urlLogString(args, userReq.originalUrl)}`);
					if(args.logProxyResponseBody) {
						console.log(proxyResString);
					}
				}
				// parse response
				let resData = await parseXMLStringToJson(proxyResString);
				if(proxyRes.statusCode < 200 || proxyRes.statusCode >= 300) {
					// don't modify errors
					resData = await serializeResponseContent(userReq, userRes, resData);
					// log user response
					if(args.logUserResponses) {
						console.log(`\nUser response ${userRes.statusCode} for ${userReq.method} ${urlLogString(args, userReq.originalUrl)}`);
						if(args.logUserResponseBody) {
							console.log(resData);
						}
					}
					return resData;
				}
				// modify response
				resData = await opts.responseModifier(proxyRes, resData, userReq, userRes);
				// serialize response
				resData = await serializeResponseContent(userReq, userRes, resData);
				// log user response
				if(args.logUserResponses) {
					console.log(`\nUser response ${userRes.statusCode} for ${userReq.method} ${urlLogString(args, userReq.originalUrl)}`);
					if(args.logUserResponseBody) {
						console.log(resData);
					}
					console.log();
				}
				return resData;
			}
		});
};
