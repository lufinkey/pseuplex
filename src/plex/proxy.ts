
import url from 'url';
import http from 'http';
import express from 'express';
import expressHttpProxy from 'express-http-proxy';
import httpProxy from 'http-proxy';
import * as constants from '../constants';
import { Config } from '../config';
import { CommandArguments } from '../cmdargs';
import { urlLogString } from '../logging';
import {
	parseHttpContentType,
	serializeResponseContent
} from './serialization';

export const plexThinProxy = (cfg: Config, args: CommandArguments, opts: expressHttpProxy.ProxyOptions = {}) => {
	const options = {...opts};
	const innerProxyReqPathResolver = options.proxyReqPathResolver;
	options.proxyReqPathResolver = async (req) => {
		let url: string;
		if(innerProxyReqPathResolver) {
			url = await innerProxyReqPathResolver(req);
		} else {
			url = req.originalUrl;
		}
		// log proxy request
		if(args.logProxyRequests) {
			// TODO use remapped method
			console.log(`\nProxy ${req.method} ${urlLogString(args, url)}`);
		}
		return url;
	};
	return expressHttpProxy(`${cfg.plex.host.indexOf('://') != -1 ? '' : 'http://'}${cfg.plex.host}:${cfg.plex.port}`, options);
};

export const plexProxy = (cfg: Config, args: CommandArguments, opts: expressHttpProxy.ProxyOptions = {}) => {
	return plexThinProxy(cfg, args, {
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

export const plexApiProxy = (cfg: Config, args: CommandArguments, opts: {
	requestOptionsModifier?: (proxyReqOpts: http.RequestOptions, userReq: express.Request) => http.RequestOptions,
	requestPathModifier?: (req: express.Request) => string | Promise<string>,
	requestBodyModifier?: (bodyContent: string, userReq: express.Request) => string | Promise<string>,
	responseModifier?: (proxyRes: http.IncomingMessage, proxyResData: any, userReq: express.Request, userRes: express.Response) => any
})=> {
	return plexProxy(cfg, args, {
		parseReqBody: opts.requestBodyModifier ? true : undefined,
		proxyReqOptDecorator: async (proxyReqOpts, userReq) => {
			// transform xml request to json
			const acceptType = parseHttpContentType(userReq.headers['accept']).contentType;
			let isApiRequest = false;
			if (acceptType == 'text/xml') {
				if(opts.responseModifier) {
					proxyReqOpts.headers['accept'] = 'application/json';
				}
				isApiRequest = true;
			} else if(acceptType == 'application/json') {
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
				const acceptType = parseHttpContentType(userReq.headers['accept']).contentType;
				if(acceptType == 'text/xml') {
					headers['content-type'] = acceptType;
				}
			} else {
				if(args.logProxyResponses || args.logUserResponses) {
					console.log(`\nResponse ${proxyRes.statusCode} for ${userReq.method} ${urlLogString(args, userReq.originalUrl)}`);
				}
			}
			return headers;
		},
		userResDecorator: opts.responseModifier ? async (proxyRes, proxyResData, userReq, userRes) => {
			// get response content type
			const contentType = parseHttpContentType(proxyRes.headers['content-type']).contentType;
			if(contentType != 'application/json') {
				if(args.logProxyResponses || args.logUserResponses) {
					console.log(`\nResponse ${proxyRes.statusCode} for ${userReq.method} ${urlLogString(args, userReq.originalUrl)}`);
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
			let resData = await JSON.parse(proxyResString);
			if(proxyRes.statusCode < 200 || proxyRes.statusCode >= 300) {
				// don't modify errors
				resData = (await serializeResponseContent(userReq, userRes, resData)).data;
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
			if(opts.responseModifier) {
				resData = await opts.responseModifier(proxyRes, resData, userReq, userRes);
			}
			// serialize response
			resData = (await serializeResponseContent(userReq, userRes, resData)).data;
			// log user response
			if(args.logUserResponses) {
				console.log(`\nUser response ${userRes.statusCode} for ${userReq.method} ${urlLogString(args, userReq.originalUrl)}`);
				if(args.logUserResponseBody) {
					console.log(resData);
				}
				console.log();
			}
			return resData;
		} : undefined
	});
};

export const plexHttpProxy = (cfg: Config, args: CommandArguments) => {
	let host = cfg.plex.host;
	const protocolIndex = host.indexOf('://');
	if(protocolIndex != -1) {
		host = host.substring(protocolIndex+3);
	}
	return httpProxy.createProxyServer({
		target: {
			host: host,
			port: cfg.plex.port
		},
		ws: true,
		xfwd: true
	});
};
