import http from 'http';
import crypto from 'crypto';
import express from 'express';
import IPCIDR from 'ip-cidr';
import ws from 'ws';
import * as plexTypes from '../../plex/types';
import {
	authenticatePlexRequest,
	IncomingPlexAPIRequest,
	IncomingPlexAPIRequestMixin,
	PlexRequestInfo
} from '../../plex/requesthandling';
import {
	PseuplexApp,
	PseuplexMetadataProvider,
	PseuplexPlugin,
	PseuplexPluginClass,
	PseuplexReadOnlyResponseFilters,
	PseuplexRelatedHubsSource,
	PseuplexRequestContext,
	PseuplexRouterApp,
	UpgradeRequest,
	UpgradeResponse,
	createUpgradeRouter,
	parseMetadataID,
	parseMetadataIdFromPathParam,
	parseMetadataIdsFromPathParam,
	stringifyPartialMetadataID,
} from '../../pseuplex';
import { PasswordLockMetadataID, PasswordLockMetadataProvider } from './metadata';
import { PasswordLockPluginConfig } from './config';
import { PasswordLockPluginDef } from './plugindef';
import { PasswordLockAuthenticationCache } from './authcache';
import { PasswordLockSection } from './lockedSection';
import { asyncRequestHandler, remoteAddressOfRequest } from '../../utils/requesthandling';
import { httpError } from '../../utils/error';
import { getModuleRootPath } from '../../utils/compat';
import { parseIntQueryParam } from '../../utils/queryparams';
import { parseURLPath } from '../../utils/url';
import { parseMetadataIDFromKey } from '../../plex/metadataidentifier';
import { delay } from '../../utils/timing';
import { firstOrSingle } from '../../utils/misc';

const videoTranscodePathPrefix = '/video/:/transcode/universal/session/';
const passthroughVideoTranscodeMethods = ['GET','OPTIONS','HEAD'];

const lockInstructionsThumbFilepath = `${getModuleRootPath()}/images/lockedSectionInstructions.png`;
const SectionTitle = "Login";

type PlexClientWebsocket = ws.WebSocket & {
	plex: PlexRequestInfo
};

export default (class PasswordLockPlugin implements PasswordLockPluginDef, PseuplexPlugin {
	static slug = 'passwordlock';
	readonly slug = PasswordLockPlugin.slug;
	readonly app: PseuplexApp;
	readonly metadata: PasswordLockMetadataProvider;
	readonly section: PasswordLockSection;
	readonly authCache: PasswordLockAuthenticationCache;
	readonly autoWhitelistedNetmasks?: IPCIDR[];

	readonly notificationWebsocketServer: ws.Server;
	
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

		const autoWhitelistedNetmaskString = this.config.passwordLock?.autoWhitelistedNetmask;
		this.autoWhitelistedNetmasks = autoWhitelistedNetmaskString
			? autoWhitelistedNetmaskString.split(',').map((maskString) => new IPCIDR(maskString))
			: undefined;
		
		this.notificationWebsocketServer = new ws.Server({
			noServer: true,
		});
		this.notificationWebsocketServer.on('connection', (client, req) => {
			client.on('error', (error) => {
				console.error(`Websocket client error:`);
				console.error(error);
			});
			client.on('close', (code, reason) => {
				console.log(`Client websocket closed: ${code} ${reason?.toString('utf8')}`);
			});
		});
		
		this.metadata = new PasswordLockMetadataProvider({
			lockInstructionsThumbEndpoint: `${this.basePath}/images/thumb/instructions`,
			loginSuccessEndpoint: `${this.basePath}/${PasswordLockMetadataID.LoginSuccess}`,
			lockInstructionsItemTitle: this.config.passwordLock?.instructionsItemTitle,
			lockInstructionsItemSummary: this.config.passwordLock?.instructionsItemSummary,
			loginSuccessItemUUID: this.config.passwordLock?.loginSuccessItemUUID ?? crypto.randomUUID(),
		});

		this.section = new PasswordLockSection(this, {
			id: this.config.passwordLock?.sectionID ?? -24,
			uuid: this.config.passwordLock?.sectionUUID ?? crypto.randomUUID(),
			path: `${this.basePath}`,
			hubsPath: `${this.basePath}/hubs`,
			title: this.config.passwordLock?.sectionTitle ?? SectionTitle,
			type: plexTypes.PlexMediaItemType.Movie,
			allowSync: false,
			hubsPivotTitle: this.config.passwordLock?.hubsPivotTitle,
			introHubTitle: this.config.passwordLock?.introHubTitle,
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
	
	defineRoutes(router: PseuplexRouterApp) {
		
		// define unauthenticated router
		const unauthRouterOptions: express.RouterOptions = {
			caseSensitive: router.enabled('case sensitive routing'),
			strict: router.enabled('strict routing'),
		};
		const unauthRouter = express.Router(unauthRouterOptions);
		const unauthUpgradeRouter = createUpgradeRouter(unauthRouterOptions);

		unauthRouter.get('/', [
			this.app.middlewares.plexProxy(),
		]);

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

		unauthRouter.get(this.section.introHub.path, [
			this.app.middlewares.plexAPIRequestHandler(async (req: IncomingPlexAPIRequest, res) => {
				const context = this.app.contextForRequest(req);
				const reqParams = req.plex.requestParams;
				return await this.section.introHub.getHubPage(reqParams,context);
			}),
		])

		unauthRouter.get('/hubs', [
			this.app.middlewares.plexAPIRequestHandler(async (req: IncomingPlexAPIRequest, res): Promise<plexTypes.PlexHubsPage> => {
				const context = this.app.contextForRequest(req);
				const reqParams = req.plex.requestParams;
				// ensure the section is included
				const contentDirectoryID = reqParams.contentDirectoryID;
				const contentDirIds = (typeof contentDirectoryID == 'string') ? contentDirectoryID.split(',') : contentDirectoryID;
				if(contentDirIds && contentDirIds.length > 0) {
					if(contentDirIds.findIndex(id => (id == this.section.id)) == -1) {
						return {
							MediaContainer: {
								size: 0,
								allowSync: false,
							}
						};
					}
				}
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
				// ensure the section is included
				const contentDirectoryID = reqParams.contentDirectoryID;
				const contentDirIds = (typeof contentDirectoryID == 'string') ? contentDirectoryID.split(',') : contentDirectoryID;
				if(contentDirIds && contentDirIds.length > 0) {
					if(contentDirIds.findIndex(id => (id == this.section.id)) == -1) {
						return {
							MediaContainer: {
								size: 0,
								allowSync: false,
							}
						};
					}
				}
				// get hubs for each section
				const hubsPage: plexTypes.PlexHubsPage = await this.section.getPromotedHubsPage(reqParams, context);
				delete hubsPage.MediaContainer.librarySectionID;
				delete hubsPage.MediaContainer.librarySectionTitle;
				delete hubsPage.MediaContainer.librarySectionUUID;
				delete (hubsPage.MediaContainer as any).librarySectionKey;
				return hubsPage;
			}),
		]);

		unauthRouter.get('/library/metadata/:metadataId', [
			this.app.middlewares.plexAPIRequestHandler(async (req: IncomingPlexAPIRequest, res): Promise<plexTypes.PlexMetadataPage> => {
				const context = this.app.contextForRequest(req);
				const reqParams = req.plex.requestParams;
				// get metadata ids
				const metadataIds = parseMetadataIdsFromPathParam(req.params.metadataId);
				for(const metadataIdParts of metadataIds) {
					if(metadataIdParts.source != this.metadata.sourceSlug) {
						throw httpError(403, `Metadata is locked`);
					}
					if(!metadataIdParts.directory) {
						if(metadataIdParts.id == PasswordLockMetadataID.LoginSuccess) {
							throw httpError(403, "Success metadata is locked (nice try)");
						}
					}
				}
				const partialMetadataIds = metadataIds.map((idParts) => stringifyPartialMetadataID(idParts));
				return await this.metadata.get(partialMetadataIds, {
					context,
					includeMetadataUnavailability: true,
					plexParams: reqParams,
					includeUnmatched: true,
				});
			}),
		]);

		for(const hubsSource of Object.values(PseuplexRelatedHubsSource)) {
			unauthRouter.get(`/${hubsSource}/metadata/:metadataId/related`, [
				this.app.middlewares.plexAPIRequestHandler(async (req: IncomingPlexAPIRequest, res): Promise<plexTypes.PlexHubsPage> => {
					const context = this.app.contextForRequest(req);
					const reqParams = req.plex.requestParams;
					// get metadata ids
					const metadataIdParts = parseMetadataIdFromPathParam(req.params.metadataId);
					if(metadataIdParts.source != this.metadata.sourceSlug) {
						throw httpError(403, `Metadata is locked`);
					}
					const partialMetadataId = stringifyPartialMetadataID(metadataIdParts);
					return await this.metadata.getRelatedHubs(partialMetadataId, {
						context,
						plexParams: reqParams,
						from: hubsSource,
					});
				}),
			]);
		}

		unauthRouter.get([ '/hubs/continueWatching', '/hubs/home/continueWatching' ], [
			this.app.middlewares.plexAPIRequestHandler(async (req: IncomingPlexAPIRequest, res): Promise<plexTypes.PlexHubsPage> => {
				return {
					MediaContainer: {
						size: 0,
						allowSync: false,
						identifier: plexTypes.PlexPluginIdentifier.PlexAppLibrary,
					}
				};
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

		unauthRouter.get('/playlists', [
			this.app.middlewares.plexAPIRequestHandler(async (req: IncomingPlexAPIRequest, res): Promise<{MediaContainer:plexTypes.PlexMediaContainer}> => {
				return {
					MediaContainer: {
						size: 0,
						totalSize: 0,
						offset: 0,
					}
				};
			}),
		]);

		unauthRouter.post('/playlists', [
			this.app.middlewares.plexAPIRequestHandler(async (req: IncomingPlexAPIRequest, res): Promise<plexTypes.PlexPlaylistsPage> => {
				const context = this.app.contextForRequest(req);
				// get the uri of the metadata being added
				const metadataItemURIString = req.query['uri'];
				if(metadataItemURIString && (typeof metadataItemURIString === 'string')) {
					// split the item into parts
					const metadataItemURIParts = plexTypes.parsePlexServerItemURI(metadataItemURIString);
					// validate that the item is for this server
					const plexServerIdentifier = await this.app.plexServerProperties.getMachineIdentifier();
					if(metadataItemURIParts.path && (metadataItemURIParts.machineIdentifier == plexServerIdentifier || metadataItemURIParts.machineIdentifier == "x")) {
						// get the key of the item
						const metadataKeyParts = parseMetadataIDFromKey(metadataItemURIParts.path, '/library/metadata');
						if(metadataKeyParts) {
							// split the item key into parts
							const metadataIdParts = parseMetadataID(metadataKeyParts.id);
							if(metadataIdParts.source == this.metadata.sourceSlug) {
								// check the type of item
								if(!metadataIdParts.directory && metadataIdParts.id == PasswordLockMetadataID.Instructions) {
									// item is the instructions item, so treat this as password input
									let inputPassword = req.query['title'] || "";
									if(typeof inputPassword !== 'string') {
										throw httpError(400, "Invalid input password");
									}
									await this.login(req, inputPassword);
									// return successfully
									const successItem = firstOrSingle((await this.metadata.get([PasswordLockMetadataID.LoginSuccess], {
										context,
										includeUnmatched: true,
										includeMetadataUnavailability: true,
									})).MediaContainer.Metadata);
									return {
										MediaContainer: {
											size: 1,
											Metadata: [
												successItem as any as plexTypes.PlexPlaylist
											]
										}
									};
								}
							}
						}
					}
				}
				throw httpError(403, "Library is locked");
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
							return !sensitivePrefs.has(setting.id);
						});
					}
					return resData;
				},
			}),
		]);
		
		unauthRouter.get('/updater/status', [
			this.app.middlewares.plexProxy(),
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

		unauthRouter.get(this.metadata.options.lockInstructionsThumbEndpoint, [
			asyncRequestHandler(async (req, res) => {
				// parse width and height
				const width = parseIntQueryParam(req.query.width);
				const height = parseIntQueryParam(req.query.height);
				// send image response
				await this.app.sendImageResponse({
					origin: req.headers['origin'],
					filepath: lockInstructionsThumbFilepath,
					width,
					height,
				}, res);
				return true;
			}),
		]);

		unauthRouter.get('/photo/\\:/transcode', [
			asyncRequestHandler(async (req: IncomingPlexAPIRequest, res) => {
				try {
					const urlParts = parseURLPath(req.url);
					let photoUrl = urlParts.queryItems?.['url'];
					if(!photoUrl || typeof photoUrl !== 'string') {
						// continue
						return false;
					}
					const rewrittenPhotoUrl = this.app.rewritePhotoEndpointLocalhostURL(photoUrl);
					photoUrl = rewrittenPhotoUrl.url;
					if(!photoUrl.startsWith('/')) {
						// continue
						return false;
					}
					const photoUrlParts = parseURLPath(photoUrl);
					switch(photoUrlParts.path) {
						case this.metadata.options.lockInstructionsThumbEndpoint: {
							// parse width and height
							const width = parseIntQueryParam(req.query.width);
							const height = parseIntQueryParam(req.query.height);
							// send image response
							await this.app.sendImageResponse({
								origin: req.headers['origin'],
								filepath: lockInstructionsThumbFilepath,
								width,
								height,
							}, res);
							return true;
						}
					}
					// continue
					return false;
				} catch(error) {
					console.error(`Error rewriting plex photo url:`);
					console.error(error);
				}
				return false;
			}),
		]);
		
		unauthRouter.use((req, res, next) => {
			// all other requests should return a 403
			next(httpError(403, "Library is locked"));
		});

		unauthUpgradeRouter.get('/\\:/websockets/notifications', [
			asyncRequestHandler(async (req: UpgradeRequest & IncomingPlexAPIRequestMixin, res: UpgradeResponse) => {
				if(req.headers['upgrade']?.toLowerCase().trim() != 'websocket') {
					// continue
					return false;
				}
				const { socket, head } = res;
				this.notificationWebsocketServer.handleUpgrade(req, socket, head, (client: PlexClientWebsocket, req: UpgradeRequest & IncomingPlexAPIRequestMixin) => {
					client.plex = req.plex;
					this.notificationWebsocketServer.emit('connection', client, req);
				});
				// handled
				return true;
			}),
		]);

		unauthUpgradeRouter.use((req: UpgradeRequest, res: UpgradeResponse, next) => {
			req.destroy();
			res.socket.destroy();
		});

		router.upgradeRouter.use([
			async (req, res, next) => {
				// check if password lock is enabled
				if(!this.config?.passwordLock?.enabled) {
					// continue
					next();
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
				// forward to unauthed router
				unauthUpgradeRouter(req, res, next);
			},
		]);
		
		// catch and authenticate all api requests
		router.use([
			async (req: IncomingPlexAPIRequest, res, next) => {
				try {
					// check if password lock is enabled
					if(!this.config?.passwordLock?.enabled) {
						next();
						return;
					}
					// ignore paths that don't need authentication
					const reqPath = req.path;
					if(req.method === 'OPTIONS' || reqPath == '/identity' || reqPath.startsWith('/web/') || reqPath == '/web'
						|| (reqPath.startsWith(videoTranscodePathPrefix) && reqPath.length > videoTranscodePathPrefix.length && passthroughVideoTranscodeMethods.indexOf(req.method) != -1)
						|| ((reqPath.endsWith('.png') || reqPath.endsWith('.ico')) && reqPath.indexOf('/', 1) == -1)
					) {
						next();
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
	
	async isUserAllowedAccess(req: (http.IncomingMessage & IncomingPlexAPIRequestMixin)): Promise<boolean> {
		// check if source IP is confirmed
		await this.authCache.waitForLoad();
		const remoteAddress = remoteAddressOfRequest(req);
		if(!remoteAddress) {
			throw httpError(400, "No remote address");
		}
		// check if we're on an auto-whitelisted network
		// TODO make this per-user
		if(this.autoWhitelistedNetmasks && this.autoWhitelistedNetmasks.findIndex((n: IPCIDR) => n.contains(remoteAddress)) != -1) {
			return true;
		}
		const plexToken = req.plex.authContext['X-Plex-Token']!;
		return this.authCache.isIPWhitelistedForToken(plexToken, remoteAddress);
	}

	async login(req: IncomingPlexAPIRequest, inputPassword: string) {
		const password = this.config.perUser?.[req.plex.userInfo.email]?.passwordLock?.password
			?? this.config.passwordLock?.password
			?? "";
		if(password != inputPassword) {
			// failure, delay atleast 5 seconds to prevent brute force
			await delay(6000);
			throw httpError(401, "Wrong password");
		}
		// success
		// whitelist the IP
		const plexToken = req.plex.authContext['X-Plex-Token']!;
		const remoteAddress = remoteAddressOfRequest(req);
		if(!remoteAddress) {
			throw httpError(400, "No remote address for some reason");
		}
		this.authCache.whitelistIPForPlexToken(plexToken, remoteAddress);
		if(!this.authCache.isSaveQueued) {
			this.authCache.save().catch((error) => {
				console.error("Error saving auth cache:");
				console.error(error);
			});
		}
	}
	
} satisfies PseuplexPluginClass);
