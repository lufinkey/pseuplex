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

export type RouteWithUpgrade = express.IRoute & {
	upgrade: (handler: UpgradeRequestHandlerParams) => void;
};

function RouteWithUpgrade_upgrade(this: RouteWithUpgrade, handler: UpgradeRequestHandlerParams) {
	const method = 'upgrade';
	const callbacks: (UpgradeRequestHandler | UpgradeRequestErrorHandler)[] = (handler instanceof Array) ? (handler as Array<any>).flat(Infinity) : [handler];

    if (callbacks.length === 0) {
		throw new TypeError('argument handler is required')
    }

    for (let i = 0; i < callbacks.length; i++) {
		const fn = callbacks[i]

		if (typeof fn !== 'function') {
			throw new TypeError('argument handler must be a function');
		}

		debug('%s %s', method, this.path);

		const layer = Layer('/', {}, fn);
		layer.method = method;

		(this as any).methods[method] = true;
		this.stack.push(layer)
    }

    return this
}



export type UpgradeRequestRouter = ((req: UpgradeRequest, res: UpgradeResponse, next: (error?: Error) => void) => void) & {
	route: (path: string) => RouteWithUpgrade;
	use: ((path: string, handler: UpgradeRequestHandlerParams) => UpgradeRequestRouter)
		& ((handler: UpgradeRequestHandlerParams) => UpgradeRequestRouter);
	get: (path: string, handler: UpgradeRequestHandlerParams) => UpgradeRequestRouter;
	post: (path: string, handler: UpgradeRequestHandlerParams) => UpgradeRequestRouter;
	put: (path: string, handler: UpgradeRequestHandlerParams) => UpgradeRequestRouter;
	patch: (path: string, handler: UpgradeRequestHandlerParams) => UpgradeRequestRouter;
	delete: (path: string, handler: UpgradeRequestHandlerParams) => UpgradeRequestRouter;
};

export function UpgradeRouter_upgrade(this: UpgradeRequestRouter, path: string, handler: UpgradeRequestHandlerParams) {
	const route = this.route(path);
    route.upgrade(handler);
    return this;
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
