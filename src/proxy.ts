
import url from 'url';
import express from 'express';
import expressHttpProxy from 'express-http-proxy';
import { Config } from './config';

export const plexProxy = (cfg: Config, resHandler?: (proxyRes: Response, proxyResData: any, userReq: express.Request, userRes: express.Response) => any) => {
	return expressHttpProxy(`${cfg.plex_host}:${cfg.plex_port}`, {
		proxyReqPathResolver: (req: express.Request) => url.parse(req.originalUrl).path,
		userResDecorator: (proxyRes, proxyResData, userReq, userRes) => {
			if(resHandler == null || proxyRes.statusCode < 200 || proxyRes.statusCode >= 300) {
				return proxyResData;
			}
			return resHandler(proxyRes, proxyResData, userReq, userRes);
		}
	});
};

export const plexJsonProxy = (cfg: Config, resHandler: (proxyRes: Response, proxyResData: any, userReq: express.Request, userRes: express.Response) => any) => {
	return plexProxy(cfg, (proxyRes, proxyResData, userReq, userRes) => {
		const resDataStr = proxyResData?.toString('utf8');
		if(resDataStr == null || resDataStr.length == 0) {
			return proxyResData;
		}
		// TODO check if the response is json
		// if the response is json, modify it
		let data = JSON.parse(resDataStr);
		data = resHandler(proxyRes, data, userReq, userRes);
		return JSON.stringify(data);
	});
};
