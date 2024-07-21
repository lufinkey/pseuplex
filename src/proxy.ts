
import url from 'url';
import http from 'http';
import express from 'express';
import expressHttpProxy from 'express-http-proxy';
import { Config } from './config';
import { Arguments } from './cmdargs';
import {
	parseHttpContentType,
	parseXMLStringToJson,
	serializeResponseContent
} from './serialization';

const plexProxy = (cfg: Config, opts: expressHttpProxy.ProxyOptions = {}) => {
	return expressHttpProxy(`${cfg.plex_host}:${cfg.plex_port}`, {
		proxyReqPathResolver: (req) => url.parse(req.originalUrl).path,
		...opts
	});
};

export const plexApiProxy = (cfg: Config, args: Arguments, opts: {
	requestModifier?: (proxyReqOpts: http.RequestOptions, userReq: express.Request) => http.RequestOptions,
	responseModifier: (proxyRes: http.IncomingMessage, proxyResData: any, userReq: express.Request, userRes: express.Response) => any
})=> {
	return plexProxy(cfg, {
			proxyReqOptDecorator: async (proxyReqOpts, userReq) => {
				// transform json request to xml
				const acceptType = parseHttpContentType(userReq.headers['accept']).contentType;
				if (acceptType == 'application/json') {
					proxyReqOpts.headers['accept'] = 'text/xml';
				} else if(acceptType != 'text/xml') {
					return proxyReqOpts;
				}
				// log user request
				if(args.logUserRequests) {
					console.log(`User ${userReq.method} ${userReq.originalUrl}\n`);
				}
				// modify request if needed
				if(!proxyReqOpts.protocol) {
					proxyReqOpts.protocol = userReq.protocol;
					if(proxyReqOpts.protocol && !proxyReqOpts.protocol.endsWith(':')) {
						proxyReqOpts.protocol += ':';
					}
				}
				if(opts.requestModifier) {
					proxyReqOpts = await opts.requestModifier(proxyReqOpts, userReq);
				}
				// log proxy request
				if(args.logProxyRequests) {
					console.log(`Proxy ${proxyReqOpts.method} ${proxyReqOpts.protocol}://${proxyReqOpts.host}${proxyReqOpts.port ? ':'+proxyReqOpts.port : ''}${proxyReqOpts.path}\n`);
				}
				return proxyReqOpts;
			},
			userResHeaderDecorator: (headers, userReq, userRes, proxyReq, proxyRes) => {
				const acceptType = parseHttpContentType(userReq.headers['accept']).contentType;
				if(acceptType == 'application/json') {
					headers['content-type'] = acceptType;
				}
				return headers;
			},
			userResDecorator: async (proxyRes, proxyResData, userReq, userRes) => {
				// handle request
				const contentType = parseHttpContentType(proxyRes.headers['content-type']).contentType;
				if(contentType != 'text/xml') {
					return proxyResData;
				}
				const proxyResString = proxyResData?.toString('utf8');
				// log proxy response
				if(args.logProxyResponses) {
					console.log(`Proxy response ${proxyRes.statusCode} for ${proxyRes.method} ${proxyRes.url}`);
					console.log(proxyResString);
					console.log();
				}
				// parse response
				let resData = await parseXMLStringToJson(proxyResString);
				if(proxyRes.statusCode < 200 || proxyRes.statusCode >= 300) {
					// don't modify errors
					resData = await serializeResponseContent(userReq, userRes, resData);
					// log user response
					if(args.logUserResponses) {
						console.log(`User response ${userRes.statusCode} for ${userReq.method} ${userReq.originalUrl}`);
						console.log(resData);
						console.log();
					}
					return resData;
				}
				// modify response
				resData = await opts.responseModifier(proxyRes, resData, userReq, userRes);
				// serialize response
				resData = await serializeResponseContent(userReq, userRes, resData);
				// log user response
				if(args.logUserResponses) {
					console.log(`User response ${userRes.statusCode} for ${userReq.method} ${userReq.originalUrl}`);
					console.log(resData);
					console.log();
				}
				return resData;
			}
		});
};
