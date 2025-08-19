
import express from 'express';
import * as plexTypes from '../../plex/types';
import { authenticatePlexRequest, IncomingPlexAPIRequest } from '../../plex/requesthandling';
import {
	PseuplexApp,
	PseuplexMetadataProvider,
	PseuplexPlugin,
	PseuplexPluginClass,
	PseuplexReadOnlyResponseFilters,
	PseuplexRelatedHubsSource,
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

const lockInstructionsThumbFilepath = `${getModuleRootPath()}/images/lockedSectionInstructions.png`;
const SectionTitle = "Login";

export default (class PasswordLockPlugin implements PasswordLockPluginDef, PseuplexPlugin {
	static slug = 'passwordlock';
	readonly slug = PasswordLockPlugin.slug;
	readonly app: PseuplexApp;
	readonly metadata: PasswordLockMetadataProvider;
	readonly section: PasswordLockSection;
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

		this.metadata = new PasswordLockMetadataProvider({
			lockInstructionsThumbEndpoint: `${this.basePath}/images/thumb/instructions`,
			loginSuccessEndpoint: `${this.basePath}/${PasswordLockMetadataID.LoginSuccess}`,
			lockInstructionsItemTitle: this.config.passwordLock?.instructionsItemTitle,
			lockInstructionsItemSummary: this.config.passwordLock?.instructionsItemSummary,
			loginSuccessItemUUID: this.config.passwordLock?.loginSuccessItemUUID ?? "47ebccd2-3324-4ad6-8497-5e478e0641ef"
		});

		this.section = new PasswordLockSection(this, {
			id: `${this.slug}`,
			uuid: this.config.passwordLock?.sectionUUID ?? "b332948b-9bf1-44a2-8637-15324bac8222",
			path: `${this.basePath}`,
			hubsPath: `${this.basePath}/hubs`,
			title: this.config.passwordLock?.sectionTitle ?? SectionTitle,
			type: plexTypes.PlexMediaItemType.Mixed,
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
				const metadataItemURIString = req.query['uri'];
				if(metadataItemURIString && (typeof metadataItemURIString === 'string')) {
					const metadataItemURIParts = plexTypes.parsePlexServerItemURI(metadataItemURIString);
					const plexServerIdentifier = await this.app.plexServerProperties.getMachineIdentifier();
					if(metadataItemURIParts.path && (metadataItemURIParts.machineIdentifier == plexServerIdentifier || metadataItemURIParts.machineIdentifier == "x")) {
						const metadataKeyParts = parseMetadataIDFromKey(metadataItemURIParts.path, '/library/metadata');
						if(metadataKeyParts) {
							const metadataIdParts = parseMetadataID(metadataKeyParts.id);
							if(metadataIdParts.source == this.metadata.sourceSlug) {
								if(!metadataIdParts.directory && metadataIdParts.id == PasswordLockMetadataID.Instructions) {
									const inputPassword = req.query['title'];
									const password = this.config.perUser?.[req.plex.userInfo.email]?.passwordLock?.password
										?? this.config.passwordLock?.password
										?? "";
									if(password == inputPassword) {
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
									} else {
										// failure, delay atleast 5 seconds to prevent brute force
										await delay(6000);
										throw httpError(401, "Wrong password");
									}
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
		
		unauthRouter.options('/updater/check', [
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
