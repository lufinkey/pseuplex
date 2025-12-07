import http from 'http';
import stream from 'stream';
import express from 'express';
import Router from 'router';
import * as plexTypes from '../plex/types';
import type { PseuplexApp } from './app';
import {
	HubStartTokenQueryParam,
	parsePseuplexHubPageParams,
	PseuplexHubPage,
	PseuplexHubPageParams,
	PseuplexHubProvider
} from './hub';
import type { IncomingPlexAPIRequest } from '../plex/requesthandling';
import { httpError } from '../utils/error';
import { parseStringQueryParam } from '../utils/queryparams';

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


export type PseuplexPluginMetadataRouters = {[sourceSlug: string]: express.Router};
export type PseuplexHubAsyncRequestHandler = (req: express.Request, res: express.Response) => Promise<PseuplexHubPage>;
export type PseuplexRouterGetHubOptions = {
	auth?: boolean,
	hubArgParam?: string,
};


export type PseuplexRouterApp = express.Express & {
	get upgradeRouter(): UpgradeRequestRouter;

	provideHub(route: string, hubProvider: PseuplexHubProvider, options?: PseuplexRouterGetHubOptions);

	/*get pluginLibraryMetadataRouters(): PseuplexPluginMetadataRouters;
	pluginLibraryMetadataRouter(sourceSlug: string): Router;

	get pluginHubsMetadataRouters(): PseuplexPluginMetadataRouters;
	pluginHubsMetadataRouter(sourceSlug: string): Router;

	metadataRoutersForPlugin(sourceSlug: string): Router[];*/
};

export const pseuplexRouterApp = (appRouter: express.Express, app: PseuplexApp): PseuplexRouterApp => {

	let upgradeRouter: UpgradeRequestRouter | null = null;
	function getUpgradeRouter() {
		if (upgradeRouter == null) {
			upgradeRouter = createUpgradeRouter({
				caseSensitive: appRouter.enabled('case sensitive routing'),
				strict: appRouter.enabled('strict routing'),
			});
		}
		return upgradeRouter;
	}

	function provideHub(this: PseuplexRouterApp, route: string, hubProvider: PseuplexHubProvider, options?: PseuplexRouterGetHubOptions) {
		const hubArgParam = options?.hubArgParam ?? 'hubArg';
		return this.get(route, [
			...((options?.auth ?? true) ? [app.middlewares.plexAuthentication()] : []),
			app.middlewares.plexAPIRequestHandler(async (req: IncomingPlexAPIRequest, res): Promise<plexTypes.PlexHubPage> => {
				const arg = req.params[hubArgParam];
				if(!arg) {
					throw httpError(400, "No hub argument provided");
				}
				const context = app.contextForRequest(req);
				const hubParams = parsePseuplexHubPageParams(req, {fromListPage:false});
				const hub = await hubProvider.get(arg);
				const hubPage = await hub.getHubPage(hubParams, context);
				// TODO remap private metadata IDs to public ones
				return hubPage;
			}),
		]);
	}

	/*let pluginLibraryMetadataRouters: PseuplexPluginMetadataRouters = {};
	function getOrCreatePluginLibraryMetadataRouter(source: string) {
		let router = pluginLibraryMetadataRouters[source];
		if(!router) {
			router = new Router({
				caseSensitive: appRouter.enabled('case sensitive routing'),
				strict: appRouter.enabled('strict routing'),
				mergeParams: true,
			});
			pluginLibraryMetadataRouters[source] = router;
		}
		return router;
	}

	let pluginHubsMetadataRouters: PseuplexPluginMetadataRouters = {};
	function getOrCreatePluginHubsMetadataRouter(source: string) {
		let router = pluginHubsMetadataRouters[source];
		if(!router) {
			router = new Router({
				caseSensitive: appRouter.enabled('case sensitive routing'),
				strict: appRouter.enabled('strict routing'),
				mergeParams: true,
			});
			pluginHubsMetadataRouters[source] = router;
		}
		return router;
	}

	function getOrCreatePluginMetadataRouters(source: string) {
		const libraryRouter = getOrCreatePluginLibraryMetadataRouter(source);
		const hubsRouter = getOrCreatePluginHubsMetadataRouter(source);
		return [libraryRouter, hubsRouter];
	}*/

	return Object.defineProperties(appRouter, {
		upgradeRouter: {
			configurable: true,
			enumerable: true,
			get: getUpgradeRouter,
		},
		provideHub: {
			configurable: true,
			enumerable: true,
			get: function() {
				return provideHub;
			}
		},
		/*pluginLibraryMetadataRouter: {
			configurable: true,
			enumerable: true,
			get: function() {
				return getOrCreatePluginLibraryMetadataRouter;
			}
		},
		pluginLibraryMetadataRouters: {
			configurable: true,
			enumerable: true,
			get: function() {
				return pluginLibraryMetadataRouters;
			}
		},
		pluginHubsMetadataRouter: {
			configurable: true,
			enumerable: true,
			get: function() {
				return getOrCreatePluginHubsMetadataRouter;
			}
		},
		pluginHubsMetadataRouters: {
			configurable: true,
			enumerable: true,
			get: function() {
				return pluginHubsMetadataRouters;
			}
		},
		metadataRoutersForPlugin: {
			configurable: true,
			enumerable: true,
			get: function() {
				return getOrCreatePluginMetadataRouters;
			}
		}*/
	}) as PseuplexRouterApp;
};
