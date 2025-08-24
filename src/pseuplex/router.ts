import http from 'http';
import stream from 'stream';
import express from 'express';
import Router from 'router';
import Layer from 'router/lib/layer';
import debug from 'debug';

export type UpgradeRequest = http.IncomingMessage;

export type UpgradeResponse = {
	head: Buffer;
	socket: stream.Duplex;
	locals: {[key: string]: any};
};

type UpgradeRequestHandler = (req: UpgradeRequest, res: UpgradeResponse, next: (error?: Error) => void) => void;
type UpgradeRequestErrorHandler = (error: Error, req: UpgradeRequest, res: UpgradeResponse, next: (error?: Error) => void) => void;
type UpgradeRequestHandlerParams = UpgradeRequestHandler | UpgradeRequestErrorHandler | Array<UpgradeRequestHandlerParams>;


export type UpgradeRequestRouter = ((req: UpgradeRequest, res: UpgradeResponse, next: (error?: Error) => void) => void) & {
	use: ((path: string, handler: UpgradeRequestHandlerParams) => UpgradeRequestRouter)
		& ((handler: UpgradeRequestHandlerParams) => UpgradeRequestRouter);
	get: (path: string, handler: UpgradeRequestHandlerParams) => UpgradeRequestRouter;
	post: (path: string, handler: UpgradeRequestHandlerParams) => UpgradeRequestRouter;
	put: (path: string, handler: UpgradeRequestHandlerParams) => UpgradeRequestRouter;
	patch: (path: string, handler: UpgradeRequestHandlerParams) => UpgradeRequestRouter;
	delete: (path: string, handler: UpgradeRequestHandlerParams) => UpgradeRequestRouter;
};

export const createUpgradeRouter = (options: express.RouterOptions) => {
	return new Router(options) as UpgradeRequestRouter;
};



export type PseuplexRouterApp = express.Express & {
	upgradeRouter: UpgradeRequestRouter;
	upgrade: (path: string, handler: UpgradeRequestHandlerParams) => void;
};

export const pseuplexRouterApp = (app: express.Express): PseuplexRouterApp => {
	const pseuApp = app as PseuplexRouterApp;
	let upgradeRouter: UpgradeRequestRouter | null = null;
	Object.defineProperty(app, 'upgradeRouter', {
		configurable: true,
		enumerable: true,
		get: function getUpgradeRouter() {
			if (upgradeRouter === null) {
				upgradeRouter = createUpgradeRouter({
					caseSensitive: app.enabled('case sensitive routing'),
					strict: app.enabled('strict routing')
				});
			}
			return upgradeRouter;
		}
	});
	return pseuApp;
};
