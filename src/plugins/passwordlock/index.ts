
import express from 'express';
import * as plexTypes from '../../plex/types';
import { authenticatePlexRequest, IncomingPlexAPIRequest } from '../../plex/requesthandling';
import {
	PseuplexApp,
	PseuplexMetadataProvider,
	PseuplexPlugin,
	PseuplexPluginClass,
	PseuplexReadOnlyResponseFilters
} from '../../pseuplex';
import { PasswordLockMetadataProvider } from './metadata';
import { PasswordLockPluginConfig } from './config';
import { PasswordLockPluginDef } from './plugindef';
import { PasswordLockAuthenticationCache } from './authcache';
import { asyncRequestHandler, remoteAddressOfRequest } from '../../utils/requesthandling';
import { httpError } from '../../utils/error';
import { PasswordLockedSection } from './lockedSection';

export default (class PasswordLockPlugin implements PasswordLockPluginDef, PseuplexPlugin {
	static slug = 'passwordlock';
	readonly slug = PasswordLockPlugin.slug;
	readonly app: PseuplexApp;
	readonly metadata: PasswordLockMetadataProvider;
	readonly section: PasswordLockedSection;
	readonly authCache: PasswordLockAuthenticationCache;
	
	constructor(app: PseuplexApp) {
		this.app = app;

		const authCachePath = this.config.passwordLock?.authCachePath;
		this.authCache = new PasswordLockAuthenticationCache(authCachePath);
		if(authCachePath) {
			this.authCache.load().then((loaded) => {
				if(loaded) {
					console.log(`Loaded ${this.slug} auth cache from ${authCachePath}`);
				} else {
					console.log(`No auth cache at ${authCachePath} to load`);
				}
			}, (error) => {
				console.error(`Error loading auth cache for ${this.slug} plugin:`);
				console.error(error);
			});
		}

		this.metadata = new PasswordLockMetadataProvider();

		this.section = new PasswordLockedSection(this, {
			id: `${this.slug}`,
			uuid: this.config.passwordLock?.sectionUUID ?? "b332948b-9bf1-44a2-8637-15324bac8222",
			path: `${this.basePath}`,
			hubsPath: `${this.basePath}/hubs`,
			title: "Introduction",
			type: plexTypes.PlexMediaItemType.Mixed,
			allowSync: false,
		});
	}
	
	get config(): PasswordLockPluginConfig {
		return this.app.config as PasswordLockPluginConfig;
	}

	get basePath() {
		return `/${this.app.slug}/${this.slug}`;
	}
	
	responseFilters?: PseuplexReadOnlyResponseFilters = {
		// TODO define any functions to modify plex server responses
	}
	
	defineRoutes(router: express.Express) {

		// define unauthenticated router
		const unauthRouter = express.Router();

		unauthRouter.get('/media/providers', [
			this.app.middlewares.plexAPIProxy({
				responseModifier: async (proxyRes, resData: plexTypes.PlexServerMediaProvidersPage, userReq: IncomingPlexAPIRequest, userRes) => {
					const context = this.app.contextForRequest(userReq);
					// remove all non-home hubs
					for(const mediaProvider of resData.MediaContainer.MediaProvider) {
						for(const feature of mediaProvider.Feature) {
							if(feature.type == plexTypes.PlexFeatureType.Content) {
								// remove all sections except for "home"
								const contentFeature = feature as plexTypes.PlexContentFeature;
								contentFeature.Directory = contentFeature.Directory.filter((dir) => {
									return dir.hubKey === '/hubs';
								});
							}
						}
					}
					// add passwordlock section
					const contentFeature = resData.MediaContainer.MediaProvider[0]
						?.Feature.find((f) => f.type == plexTypes.PlexFeatureType.Content) as plexTypes.PlexContentFeature;
					if(contentFeature) {
						contentFeature.Directory.push(await this.section.getMediaProviderDirectory(context));
					}
					return resData;
				}
			}),
		]);

		unauthRouter.get(['/library/sections', '/library/sections/all'], [
			this.app.middlewares.plexAPIRequestHandler(async (req: IncomingPlexAPIRequest, res): Promise<plexTypes.PlexLibrarySectionsPage> => {
				const context = this.app.contextForRequest(req);
				const reqParams = req.plex.requestParams;
				// add sections
				return {
					MediaContainer: {
						title1: "Plex Library",
						size: 1,
						Directory: [
							await this.section.getLibrarySectionsEntry(reqParams, context)
						]
					}
				};
			}),
		]);

		unauthRouter.get('/hubs', [
			this.app.middlewares.plexAPIRequestHandler(async (req: IncomingPlexAPIRequest, res): Promise<plexTypes.PlexHubsPage> => {
				const context = this.app.contextForRequest(req);
				const reqParams = req.plex.requestParams;
				// get hubs for each section
				const hubsPage: plexTypes.PlexHubsPage = await this.section.getHubsPage(reqParams, context);
				delete hubsPage.MediaContainer.librarySectionID;
				delete hubsPage.MediaContainer.librarySectionTitle;
				delete hubsPage.MediaContainer.librarySectionUUID;
				delete (hubsPage.MediaContainer as any).librarySectionKey;
				return hubsPage;
			}),
		]);
		
		unauthRouter.get('/hubs/promoted', [
			this.app.middlewares.plexAPIRequestHandler(async (req: IncomingPlexAPIRequest, res): Promise<plexTypes.PlexHubsPage> => {
				const context = this.app.contextForRequest(req);
				const reqParams = req.plex.requestParams;
				// get hubs for each section
				const hubsPage: plexTypes.PlexHubsPage = await this.section.getPromotedHubsPage(reqParams, context);
				delete hubsPage.MediaContainer.librarySectionID;
				delete hubsPage.MediaContainer.librarySectionTitle;
				delete hubsPage.MediaContainer.librarySectionUUID;
				delete (hubsPage.MediaContainer as any).librarySectionKey;
				return hubsPage;
			}),
		]);

		unauthRouter.get('/status/sessions', [
			this.app.middlewares.plexAPIRequestHandler(async (req: IncomingPlexAPIRequest, res): Promise<{MediaContainer:plexTypes.PlexMediaContainer}> => {
				return {
					MediaContainer: {
						size: 0,
					}
				};
			}),
		]);

		unauthRouter.get('/activities', [
			this.app.middlewares.plexAPIRequestHandler(async (req: IncomingPlexAPIRequest, res): Promise<{MediaContainer:plexTypes.PlexMediaContainer}> => {
				return {
					MediaContainer: {
						size: 0,
					}
				};
			}),
		]);

		unauthRouter.get(this.section.path, [
			this.app.middlewares.plexAPIRequestHandler(async (req: IncomingPlexAPIRequest, res) => {
				const context = this.app.contextForRequest(req);
				return await this.section.getSectionPage(context);
			}),
		]);

		unauthRouter.get(this.section.hubsPath, [
			this.app.middlewares.plexAPIRequestHandler(async (req: IncomingPlexAPIRequest, res) => {
				const context = this.app.contextForRequest(req);
				const reqParams = req.plex.requestParams;
				return await this.section.getHubsPage(reqParams,context);
			}),
		]);

		const sensitivePrefs = new Set<string>([
			"customCertificatePath",
			"customCertificateKey",
			"LocalAppDataPath",
			"iTunesLibraryXmlPath",
			"ButlerDatabaseBackupPath",
			"CertificateUUID",
			"CertificateVersion",
		]);
		unauthRouter.get('/\\:/prefs', [
			this.app.middlewares.plexAPIProxy({
				responseModifier: (proxyRes, resData: plexTypes.PlexPrefsPage, userReq, userRes): plexTypes.PlexPrefsPage => {
					if(resData.MediaContainer.Setting) {
						resData.MediaContainer.Setting = resData.MediaContainer.Setting.filter((setting) => {
							if(!setting.id) {
								console.error(`wtf: ${JSON.stringify(setting)}`);
							}
							return !sensitivePrefs.has(setting.id);
						});
					}
					return resData;
				},
			}),
		]);

		// TODO figure out if/how we should protect these endpoints
		unauthRouter.use('/updater', [
			this.app.middlewares.plexProxy(),
		]);
		/*
		unauthRouter.get('/updater/status', [
			this.app.middlewares.plexAPIRequestHandler(async (req: IncomingPlexAPIRequest, res): Promise<plexTypes.PlexUpdaterStatusPage> => {
				return {
					MediaContainer: {
						size: 0,
						autoUpdateVersion: true,
						canInstall: false,
						checkedAt: (new Date()).getTime() / 1000,
						status: false,
					}
				};
			}),
		]);

		unauthRouter.options('/updater/check', [
			asyncRequestHandler(async (req: IncomingPlexAPIRequest, res): Promise<boolean> => {
				res.setHeader('Access-Control-Allow-Origin', 'https://app.plex.tv');
				res.setHeader('Access-Control-Allow-Methods', 'PUT');
				res.setHeader('Vary', 'Origin, X-Plex-Token');
				res.setHeader('X-Plex-Protocol', '1.0');
				res.status(200).send();
				this.app.logger?.logIncomingUserRequestResponse(req, res, undefined);
				return true;
			}),
		]);

		unauthRouter.put('/updater/check', [
			asyncRequestHandler(async (req: IncomingPlexAPIRequest, res): Promise<boolean> => {
				res.setHeader('Access-Control-Allow-Origin', 'https://app.plex.tv');
				res.setHeader('Vary', 'Origin, X-Plex-Token');
				res.setHeader('X-Plex-Protocol', '1.0');
				res.status(200).send();
				this.app.logger?.logIncomingUserRequestResponse(req, res, undefined);
				return true;
			}),
		]);
		*/
		
		unauthRouter.use((req, res, next) => {
			// all other requests should return a 403
			next(httpError(403, "Forbidden"));
		});
		
		// catch and authenticate all api requests
		router.use([
			async (req: IncomingPlexAPIRequest, res, next) => {
				try {
					// check if password lock is enabled
					if(!this.config?.passwordLock?.enabled) {
						next()
						return;
					}
					// ignore paths that don't need authentication
					if(req.path == '/identity' || req.path.startsWith('/web/') || req.path == 'web') {
						next()
						return;
					}
					// authenticate the request
					let allowedAccess: boolean;
					try {
						// authenticate request as plex user
						await authenticatePlexRequest(req, this.app.plexServerAccounts);
						// validate that we're allowed to continue
						allowedAccess = await this.isUserAllowedAccess(req);
					} catch(error) {
						next(error);
						return;
					}
					// continue if allowed access
					if(allowedAccess) {
						next();
						return;
					}
					// IP is not allowed access, so redirect to subrouter
					unauthRouter(req, res, next);
				} catch(error) {
					console.error(`Exception while handling route ${req.path}`);
					console.error(error);
				}
			}
		]);
	}
	
	async isUserAllowedAccess(req: IncomingPlexAPIRequest): Promise<boolean> {
		// check if source IP is confirmed
		await this.authCache.waitForLoad();
		const remoteAddress = remoteAddressOfRequest(req);
		if(!remoteAddress) {
			throw httpError(400, "No remote address");
		}
		const plexToken = req.plex.authContext['X-Plex-Token']!;
		return this.authCache.isIPWhitelistedForToken(plexToken, remoteAddress);
	}
	
} satisfies PseuplexPluginClass);
