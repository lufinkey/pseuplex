import http from 'http';
import crypto from 'crypto';
import express from 'express';
import IPCIDR from 'ip-cidr';
import ws from 'ws';
import * as plexServerAPI from '../../plex/api';
import * as plexTypes from '../../plex/types';
import {
	authenticatePlexRequest,
	IncomingPlexAPIRequest,
	IncomingPlexHttpRequest,
	PlexRequestInfo,
} from '../../plex/requesthandling';
import {
	PseuplexAllSectionsSource,
	PseuplexApp,
	PseuplexMetadataIDParts,
	PseuplexPlugin,
	PseuplexPluginClass,
	PseuplexReadOnlyResponseFilters,
	PseuplexRelatedHubsSource,
	PseuplexRequestContext,
	PseuplexRouterApp,
	UpgradeRequest,
	UpgradeResponse,
	createUpgradeRouter,
	endpointForPseuplexSectionsSource,
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
import { httpError, HttpResponseError } from '../../utils/error';
import { getModuleRootPath } from '../../utils/compat';
import { parseIntQueryParam } from '../../utils/queryparams';
import { parseURLPath, stringifyURLPath } from '../../utils/url';
import { parseMetadataIDFromKey } from '../../plex/metadataidentifier';
import { delay } from '../../utils/timing';
import { arrayFromArrayOrSingle, firstOrSingle, pushToArray } from '../../utils/misc';
import { IPv4NormalizeMode, normalizeIPAddress } from '../../utils/ip';
import { LibraryIsLockedError } from './errors';

const transcodeSessionsPrefix = '/transcode/sessions/';
const videoTranscodePathPrefix = '/video/:/transcode/universal/session/';
const musicTranscodePathPrefix = '/music/:/transcode/universal/session/';
const subtitlesTranscodePathPrefix = '/subtitles/:/transcode/universal/session';
const passthroughTranscodeMethods = ['GET','OPTIONS','HEAD'];

const protectedOptionsEndpoints = ['/security'];

const lockInstructionsThumbFilepath = `${getModuleRootPath()}/images/lockedSectionInstructions.png`;
const lockIconFilepath = `${getModuleRootPath()}/images/icons/lock.png`;

const plexTVAvatarPathRegex = /\/users\/([a-zA-Z0-9]+)\/avatar(?:\/|$)/;

const SectionTitle = "Login";

type PlexClientWebsocketMixin = {
	remoteAddress: string;
	identityIP: string;
	plex: PlexRequestInfo;
};

export default (class PasswordLockPlugin implements PasswordLockPluginDef, PseuplexPlugin {
	static slug = 'passwordlock';
	readonly slug = PasswordLockPlugin.slug;
	readonly app: PseuplexApp;
	readonly metadata: PasswordLockMetadataProvider;
	readonly section: PasswordLockSection;
	readonly authCache: PasswordLockAuthenticationCache;
	readonly autoWhitelistNetmasks?: IPCIDR[];
	readonly userAutoWhitelistNetmasks?: {
		[email: string]: {
			override: boolean;
			netmasks?: IPCIDR[];
		}
	};

	readonly notificationWebsocketServer: ws.Server<(typeof ws.WebSocket) & PlexClientWebsocketMixin>;
	readonly notificationEventsourceSubscribers: Set<{req: IncomingPlexAPIRequest, res: express.Response}> = new Set();

	readonly loginFailureDelayPromises: {
		[ipAddress: string]: (Promise<void> | undefined)
	} = {};

	readonly cachedVideoMedia: {
		[id: string | number]: {Media: (plexTypes.PlexMedia[] | undefined)} | Promise<{Media: (plexTypes.PlexMedia[] | undefined)}> | undefined
	} = {};
	
	constructor(app: PseuplexApp) {
		this.app = app;

		const authCachePath = this.config.passwordLock?.authCachePath;
		this.authCache = new PasswordLockAuthenticationCache(authCachePath, {
			plexAccountsStore: this.app.plexServerAccounts,
			saveReadableJson: this.config.passwordLock?.readableAuthCacheJson,
		});
		if(authCachePath) {
			this.authCache.load().then((loaded) => {
				if(loaded) {
					console.log(`Loaded ${this.slug} auth cache from ${authCachePath}`);
				} else {
					console.log(`No auth cache at ${authCachePath} to load`);
				}
				if(this.authCache.hasPendingUnsavedChanges && !this.authCache.isSaveQueued) {
					this.saveAuthCache();
				}
			}, (error) => {
				console.error(`Error loading auth cache for ${this.slug} plugin:`);
				console.error(error);
			});
		}

		this.autoWhitelistNetmasks = parseAutoWhitelistedNetmasks(this.config.passwordLock?.autoWhitelistNetmask);
		this.userAutoWhitelistNetmasks = {};
		const perUserConfigs = this.config.perUser;
		if(perUserConfigs) {
			for(const email of Object.keys(perUserConfigs)) {
				const userConfig = perUserConfigs[email];
				const userPwLockCfg = userConfig.passwordLock;
				if(userPwLockCfg?.autoWhitelistNetmask || userPwLockCfg?.overrideAutoWhitelistNetmask) {
					const whitelistedNetmasks = parseAutoWhitelistedNetmasks(userPwLockCfg.autoWhitelistNetmask);
					this.userAutoWhitelistNetmasks[email] = {
						override: userPwLockCfg.overrideAutoWhitelistNetmask ?? false,
						netmasks: whitelistedNetmasks,
					};
				}
			}
		}
		
		this.notificationWebsocketServer = new ws.Server({
			noServer: true,
		});
		this.notificationWebsocketServer.on('connection', (client, req) => {
			client.on('error', (error) => {
				console.error(`Websocket client error:`);
				console.error(error);
			});
		});
		
		this.metadata = new PasswordLockMetadataProvider({
			lockInstructionsThumbEndpoint: `${this.basePath}/images/thumb/instructions`,
			loginSuccessEndpoint: `${this.basePath}/${PasswordLockMetadataID.LoginSuccess}`,
			lockInstructionsItemTitle: this.config.passwordLock?.instructionsItemTitle,
			lockInstructionsItemSummary: this.config.passwordLock?.instructionsItemSummary,
			getLockInstructionsItemMedia: async (context) => {
				return await this.getInstructionsItemMedia(context);
			},
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
		const plexProxyMiddleware = this.app.middlewares.plexProxy();

		unauthRouter.get('/', [
			plexProxyMiddleware,
		]);

		unauthRouter.get('/media/providers', [
			this.app.middlewares.plexAPIProxy({
				responseModifier: async (proxyRes, resData: plexTypes.PlexServerMediaProvidersPage, userReq: IncomingPlexAPIRequest, userRes) => {
					const context = this.app.contextForRequest(userReq);
					// remove all non-home sections
					for(const mediaProvider of resData.MediaContainer.MediaProvider) {
						for(const feature of mediaProvider.Feature) {
							if(feature.type == plexTypes.PlexFeatureType.Content) {
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

		for(const sectionsSource of Object.values(PseuplexAllSectionsSource)) {
			unauthRouter.get(endpointForPseuplexSectionsSource(sectionsSource), [
				this.app.middlewares.plexAPIRequestHandler(async (req: IncomingPlexAPIRequest, res): Promise<plexTypes.PlexLibrarySectionsPage> => {
					const context = {
						...this.app.contextForRequest(req),
						from: sectionsSource,
					};
					const reqParams: plexTypes.PlexLibrarySectionsPageParams = req.plex.requestParams;
					// return singular section
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
		}

		unauthRouter.get([ this.section.path, `/library/sections/${this.section.id}` ], [
			this.app.middlewares.plexAPIRequestHandler(async (req: IncomingPlexAPIRequest, res) => {
				const context = this.app.contextForRequest(req);
				return await this.section.getSectionPage(context);
			}),
		]);

		unauthRouter.get([ `${this.section.path}/prefs`, `/library/sections/${this.section.id}/prefs` ], [
			this.app.middlewares.plexAPIRequestHandler(async (req: IncomingPlexAPIRequest, res) => {
				const context = this.app.contextForRequest(req);
				return await this.section.getPrefsPage(context);
			}),
		]);

		unauthRouter.get([ `${this.section.path}/collections`, `/library/sections/${this.section.id}/collections` ], [
			this.app.middlewares.plexAPIRequestHandler(async (req: IncomingPlexAPIRequest, res) => {
				const context = this.app.contextForRequest(req);
				const plexParams = plexTypes.parsePlexCollectionsPageParams(req);
				return await this.section.getCollectionsPage(plexParams, context);
			}),
		]);

		unauthRouter.get([ `${this.section.path}/all`, `/library/sections/${this.section.id}/all` ], [
			this.app.middlewares.plexAPIRequestHandler(async (req: IncomingPlexAPIRequest, res) => {
				const context = this.app.contextForRequest(req);
				const plexParams = plexTypes.parsePlexSectionAllItemsPageParams(req);
				return await this.section.getAllItemsPage(plexParams, context);
			}),
		]);

		unauthRouter.get([ this.section.hubsPath, `/hubs/section/${this.section.id}` ], [
			this.app.middlewares.plexAPIRequestHandler(async (req: IncomingPlexAPIRequest, res) => {
				const context = this.app.contextForRequest(req);
				const reqParams = plexTypes.parsePlexHubListPageParams(req);
				return await this.section.getHubsPage(reqParams,context);
			}),
		]);

		unauthRouter.get(this.section.introHub.path, [
			this.app.middlewares.plexAPIRequestHandler(async (req: IncomingPlexAPIRequest, res) => {
				const context = this.app.contextForRequest(req);
				const reqParams = plexTypes.parsePlexHubPageParams(req, {fromListPage:false});
				return await this.section.introHub.getHubPage(reqParams,context);
			}),
		]);

		unauthRouter.get('/hubs', [
			this.app.middlewares.plexAPIRequestHandler(async (req: IncomingPlexAPIRequest, res): Promise<plexTypes.PlexHubsPage> => {
				const context = this.app.contextForRequest(req);
				const reqParams = plexTypes.parsePlexHubListPageParams(req);
				// ensure the section is included
				if(reqParams.contentDirectoryID && reqParams.contentDirectoryID.length > 0) {
					if(reqParams.contentDirectoryID.findIndex(id => (id == this.section.id)) == -1) {
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
				const reqParams = plexTypes.parsePlexHubListPageParams(req);
				// ensure the section is included
				if(reqParams.contentDirectoryID && reqParams.contentDirectoryID.length > 0) {
					if(reqParams.contentDirectoryID.findIndex(id => (id == this.section.id)) == -1) {
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
		
		// proxy if whitelisted metadata is being fetched
		unauthRouter.get('/library/metadata/:metadataId', [
			asyncRequestHandler((req: IncomingPlexAPIRequest, res, next) => {
				if(req.method === 'GET' || req.method === 'OPTIONS') {
					const context = this.app.contextForRequest(req);
					if(this.isMetadataIdWhitelisted(req.params.metadataId, context)) {
						// delete any included hubs
						const urlParts = parseURLPath(req.url);
						if(urlParts.queryItems?.['includeRelated']) {
							delete urlParts.queryItems['includeRelated'];
							req.url = stringifyURLPath(urlParts);
						}
						// proxy request
						plexProxyMiddleware(req,res,next);
						return true;
					}
				}
				return false;
			})
		]);
		// handle metadata endpoint
		unauthRouter.get('/library/metadata/:metadataId', [
			this.app.middlewares.plexAPIRequestHandler(async (req: IncomingPlexAPIRequest, res): Promise<plexTypes.PlexMetadataPage> => {
				const context = this.app.contextForRequest(req);
				const reqParams: plexTypes.PlexMetadataPageParams = req.plex.requestParams;
				// get metadata ids
				const metadataIds = parseMetadataIdsFromPathParam(req.params.metadataId);
				for(const metadataIdParts of metadataIds) {
					// ensure metadata is a "passwordlock" metadata
					if(metadataIdParts.source != this.metadata.sourceSlug) {
						throw httpError(403, `Metadata is locked`);
					}
					// validate disallowed passwordlock items
					if(!metadataIdParts.directory) {
						if(metadataIdParts.id == PasswordLockMetadataID.LoginSuccess) {
							throw httpError(403, "Success metadata is locked (nice try)");
						}
					}
				}
				// fetch metadatas
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
					const reqParams = plexTypes.parsePlexHubListPageParams(req);
					// get metadata id
					const metadataIdParts = parseMetadataIdFromPathParam(req.params.metadataId);
					// ensure that only "passwordlock" metadata can be fetched
					if(metadataIdParts.source != this.metadata.sourceSlug) {
						throw httpError(403, `Metadata is locked`);
					}
					// get related hubs for metadata id
					const partialMetadataId = stringifyPartialMetadataID(metadataIdParts);
					return await this.metadata.getRelatedHubs(partialMetadataId, {
						context,
						plexParams: reqParams,
						from: hubsSource,
					});
				}),
			]);
		}

		unauthRouter.get(`/library/all`, [
			this.app.middlewares.plexAPIRequestHandler(async (req: IncomingPlexAPIRequest, res) => {
				const context = this.app.contextForRequest(req);
				const plexParams = plexTypes.parsePlexLibraryAllItemsPageParams(req);
				if(plexParams.guid || plexParams['show.guid']) {
					// show "unlock server" item
					const resData: plexTypes.PlexMetadataPage = {
						MediaContainer: {
							size: 0,
							Metadata: []
						}
					};
					const unlockMetadata = firstOrSingle((await this.metadata.get([PasswordLockMetadataID.Instructions], {
						context,
						includeUnmatched: true,
						includeMetadataUnavailability: true,
					})).MediaContainer.Metadata);
					if(unlockMetadata) {
						// add extra fields to metadata
						const actionTitle = "Unlock Server :";
						unlockMetadata.title = actionTitle;
						unlockMetadata.librarySectionTitle = actionTitle;
						unlockMetadata.librarySectionID = this.section.id;
						unlockMetadata.librarySectionKey = this.section.path;
						unlockMetadata.Media = [{
							id: 99999999999,
							videoResolution: actionTitle,
							Part: [
								{
									id: 99999999998,
								}
							]
						} as plexTypes.PlexMedia];
						// add password metadata to response
						resData.MediaContainer.Metadata = pushToArray(resData.MediaContainer.Metadata, unlockMetadata);
						resData.MediaContainer.size += 1;
						if(resData.MediaContainer.totalSize != null) {
							resData.MediaContainer.totalSize += 1;
						}
					}
					return resData;
				}
				// get all items
				const libraryPage = await this.section.getAllItemsPage(plexParams, context);
				delete libraryPage.MediaContainer.librarySectionID;
				delete libraryPage.MediaContainer.librarySectionTitle;
				delete libraryPage.MediaContainer.librarySectionUUID;
				delete (libraryPage.MediaContainer as any).librarySectionKey;
				return libraryPage;
			}),
		]);
		
		unauthRouter.get([
			'/hubs/continueWatching', '/hubs/continueWatching/items',
			'/hubs/home/continueWatching', '/hubs/home/continueWatching/items',
		], [
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

		unauthRouter.get([
			'/hubs/home/recentlyAdded',
		], [
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
			this.app.middlewares.plexServerOwnerOnly(),
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

		unauthRouter.get(['/playlists', '/playlists/all'], [
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
				throw new LibraryIsLockedError(this.app.logger?.options);
			}),
		]);
		
		// reroute instructions video
		unauthRouter.post('/playQueues', [
			async (req: IncomingPlexAPIRequest, res, next) => {
				try {
					const context = this.app.contextForRequest(req);
					const urlParts = parseURLPath(req.url);
					const uriString = urlParts.queryItems?.['uri'];
					if(!uriString || typeof uriString !== 'string') {
						next();
						return;
					}
					const uriParts = plexTypes.parsePlexServerItemURI(uriString);
					const plexMachineId = await this.app.plexServerProperties.getMachineIdentifier();
					if(!uriParts.path || (uriParts.machineIdentifier != plexMachineId && uriParts.machineIdentifier != "x")) {
						next();
						return;
					}
					const pathParts = parseMetadataIDFromKey(uriParts.path, '/library/metadata');
					if(!pathParts) {
						next();
						return;
					}
					// check if any of the video ids match
					let matchedVideoId = false;
					const metadataId = parseMetadataID(pathParts.id);
					if(!metadataId.source) {
						if(this.isMetadataIdWhitelisted(metadataId.id, context)) {
							matchedVideoId = true;
						}
					} else {
						const newMetadataId = this.rewriteAliasedMetadataId(metadataId, context);
						if(newMetadataId) {
							// replace id with the video ID
							matchedVideoId = true;
							uriParts.path = `/library/metadata/${newMetadataId}`;
							urlParts.queryItems!['uri'] = plexTypes.stringifyPlexServerItemURI(uriParts);
							if(urlParts.queryItems!['key']) {
								urlParts.queryItems!['key'] = uriParts.path;
							}
							req.url = stringifyURLPath(urlParts);
						}
					}
					if(!matchedVideoId) {
						next();
						return;
					}
					// video ID matches, so rewrite this request and proxy it
					plexProxyMiddleware(req, res, next);
				} catch(error) {
					console.error(`Error handling password locked playQueues POST`);
					next(error);
				}
			}
		]);
		// proxy and validate that whitelisted metadata is included
		unauthRouter.get('/playQueues/:playQueueId', [
			this.app.middlewares.plexAPIProxy({
				responseModifier: (proxyRes, resData: plexTypes.PlayQueueItemsPage, userReq: IncomingPlexAPIRequest, userRes) => {
					const context = this.app.contextForRequest(userReq);
					const metadatas = arrayFromArrayOrSingle(resData.MediaContainer.Metadata);
					if(metadatas) {
						// throw an error if any metadata item is disallowed
						for(const metadata of metadatas) {
							if(metadata.ratingKey) {
								if(!this.isMetadataIdWhitelisted(metadata.ratingKey, context)) {
									throw httpError(403, "PlayQueue contains unavailable items");
								}
							}
							else if(metadata.key) {
								if(!this.isMetadataKeyWhitelisted(metadata.key, context)) {
									throw httpError(403, "PlayQueue contains unavailable items");
								}
							}
							else {
								throw httpError(403, "PlayQueue contains unknown items");
							}
						}
					}
					return resData;
				}
			})
		]);
		// proxy if whitelisted metadata is being played
		for(const endpoint of [
			'/video/\\:/transcode/universal/decision',
			'/video/\\:/transcode/universal/start.m3u8',
			'/video/\\:/transcode/universal/stop',
			'/music/\\:/transcode/universal/decision',
			'/music/\\:/transcode/universal/start.m3u8',
			'/subtitles/\\:/transcode/universal/start',
		]) {
			unauthRouter.get(endpoint, [
				asyncRequestHandler((req: IncomingPlexAPIRequest, res, next) => {
					const context = this.app.contextForRequest(req);
					// rewrite path if needed
					let path = req.query['path'];
					if(typeof path === 'string' && path) {
						// rewrite metadata key if needed
						const pathParts = parseMetadataIDFromKey(path, '/library/metadata');
						if(pathParts) {
							const metadataIdParts = parseMetadataID(pathParts.id);
							const newMetadataId = this.rewriteAliasedMetadataId(metadataIdParts, context);
							if(newMetadataId) {
								path = `/library/metadata/${newMetadataId}${pathParts.relativePath ?? ''}`;
								const reqPathParts = parseURLPath(req.url);
								reqPathParts.queryItems!['path'] = path;
								req.url = stringifyURLPath(reqPathParts);
							}
						}
						// ignore if whitelisted metadata is being played
						if(this.isMetadataKeyWhitelisted(path, context)) {
							plexProxyMiddleware(req,res,next);
							return true;
						}
					}
					return false;
				})
			]);
		}
		// proxy if whitelisted part is being played
		unauthRouter.use([
			asyncRequestHandler((req: IncomingPlexAPIRequest, res: express.Response, next) => {
				const path = req.path;
				if(!path.startsWith('/library/parts/')) {
					return false;
				}
				if(req.method === 'GET' || req.method === 'OPTIONS' || req.method === 'HEAD') {
					const context = this.app.contextForRequest(req);
					// ignore if whitelisted metadata is being played
					if(this.isMetadataMediaPartKeyWhitelisted(path, context)) {
						plexProxyMiddleware(req,res,next);
						return true;
					}
				}
				return false;
			})
		]);
		// proxy if whitelisted metadata is being used
		unauthRouter.get('/\\:/timeline', [
			asyncRequestHandler((req: IncomingPlexAPIRequest, res, next) => {
				const context = this.app.contextForRequest(req);
				// ignore if whitelisted metadata is being played
				const urlPathParts = parseURLPath(req.url);
				let ratingKey = urlPathParts.queryItems?.['ratingKey'];
				let key = urlPathParts.queryItems?.['key'];
				// rewrite metadata id if needed
				if(ratingKey && typeof ratingKey === 'string') {
					// rewrite metadata id
					const newMetadataId = this.rewriteAliasedMetadataId(parseMetadataID(ratingKey), context);
					if(newMetadataId) {
						ratingKey = newMetadataId.toString();
						urlPathParts.queryItems!['ratingKey'] = ratingKey;
					}
				}
				if(key && typeof key === 'string') {
					const pathParts = parseMetadataIDFromKey(key, '/library/metadata');
					if(pathParts) {
						// rewrite metadata id
						const newMetadataId = this.rewriteAliasedMetadataId(parseMetadataID(pathParts.id), context);
						if(newMetadataId) {
							ratingKey = newMetadataId.toString();
							key = `/library/`
							urlPathParts.queryItems!['key'] = key;
						}
					}
				}
				// check if metadata is whitelisted
				if(ratingKey && typeof ratingKey === 'string') {
					if(this.isMetadataIdWhitelisted(ratingKey, context)) {
						plexProxyMiddleware(req,res,next);
						return true;
					}
				}
				else if(key && typeof key === 'string') {
					if(this.isMetadataKeyWhitelisted(key, context)) {
						plexProxyMiddleware(req,res,next);
						return true;
					}
				}
				return false;
			})
		]);
		
		unauthRouter.get('/\\:/prefs', [
			this.app.middlewares.plexServerOwnerOnly(),
			this.app.middlewares.plexAPIRequestHandler(async (req: IncomingPlexAPIRequest, res): Promise<plexTypes.PlexPrefsPage> => {
				return {
					MediaContainer: {
						size: 0,
						Setting: [],
					}
				};
			}),
		]);
		
		unauthRouter.get('/updater/status', [
			plexProxyMiddleware,
		]);
		
		unauthRouter.put('/updater/check', [
			this.app.middlewares.plexServerOwnerOnly(),
			asyncRequestHandler(async (req: IncomingPlexAPIRequest, res: express.Response): Promise<boolean> => {
				res.setHeader('Access-Control-Allow-Origin', 'https://app.plex.tv');
				res.setHeader('Vary', 'Origin, X-Plex-Token');
				res.setHeader('X-Plex-Protocol', '1.0');
				res.status(200).send();
				this.app.logger?.logIncomingUserRequestResponse(req, res, undefined);
				return true;
			}),
		]);

		unauthRouter.get(this.metadata.options.lockInstructionsThumbEndpoint, [
			asyncRequestHandler(async (req: IncomingPlexAPIRequest, res) => {
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
			asyncRequestHandler(async (req: IncomingPlexAPIRequest, res, next) => {
				try {
					const context = this.app.contextForRequest(req);
					const urlParts = parseURLPath(req.url);
					let photoUrl = urlParts.queryItems?.['url'];
					if(!photoUrl || typeof photoUrl !== 'string') {
						// continue
						return false;
					}
					// check if plex.tv avatar url
					const rewrittenPhotoUrl = this.app.rewritePhotoEndpointLocalhostURL(photoUrl);
					photoUrl = rewrittenPhotoUrl.url;
					if(!photoUrl.startsWith('/')) {
						const photoUrlParts = new URL(photoUrl);
						if(photoUrlParts.host == 'plex.tv') {
							if(plexTVAvatarPathRegex.test(photoUrlParts.pathname)) {
								// parse width and height
								const width = parseIntQueryParam(req.query.width);
								const height = parseIntQueryParam(req.query.height);
								// send image response
								await this.app.sendImageResponse({
									origin: req.headers['origin'],
									filepath: lockIconFilepath,
									width,
									height,
								}, res);
								return true;
							}
						}
						// continue
						return false;
					}
					// check if passwordlock metadata thumb
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
					// check if instructions video thumb
					const instructionsVideoId = this.getInstructionsItemVideoId(context);
					if(instructionsVideoId) {
						if(photoUrlParts.path.startsWith(`/library/metadata/${instructionsVideoId}/`)) {
							// proxy to plex
							plexProxyMiddleware(req,res,next);
							return true;
						}
					}
				} catch(error) {
					console.error(`Error rewriting plex photo url:`);
					console.error(error);
				}
				// continue
				return false;
			}),
		]);

		unauthRouter.get('/\\:/eventsource/notifications', [
			asyncRequestHandler(async (req, res) => {
				// add subscriber to set
				const subscriber = {req,res};
				this.notificationEventsourceSubscribers.add(subscriber);
				let done = false;
				const onDone = () => {
					if(done) {
						return;
					}
					done = true;
					this.notificationEventsourceSubscribers.delete(subscriber);
				};
				req.once('close', onDone);
				res.once('finish', onDone);
				res.once('close', onDone);
				// set response headers
				res.set({
					'Content-Type': 'text/event-stream',
					'Cache-Control': 'no-cache',
					'Connection': 'keep-alive'
				});
				res.flushHeaders();
				return true;
			}),
		]);
		
		unauthRouter.use((req, res, next) => {
			// all other requests should return a 403
			next(new LibraryIsLockedError(this.app.logger?.options));
		});
		
		unauthUpgradeRouter.get('/\\:/websockets/notifications', [
			asyncRequestHandler(async (req: IncomingPlexHttpRequest, res: UpgradeResponse) => {
				if(req.headers['upgrade']?.toLowerCase().trim() != 'websocket') {
					// continue
					return false;
				}
				const { socket, head } = res;
				this.notificationWebsocketServer.handleUpgrade(req, socket, head, (client: (ws & PlexClientWebsocketMixin), req: IncomingPlexHttpRequest) => {
					try {
						client.remoteAddress = remoteAddressOfRequest(req);
						client.identityIP = this.identityIPOfRequest(req);
						client.plex = req.plex;
					} catch(error) {
						console.error(`Error after connecting websocket:`);
						console.error(error);
						client.close();
						req.destroy();
						return;
					}
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

		// catch and authenticate all upgrade requests
		router.upgradeRouter.use([
			async (req: UpgradeRequest, res: UpgradeResponse, next) => {
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
					allowedAccess = await this.isUserAllowedAccess(req as IncomingPlexHttpRequest);
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
				// unauthUpgradeRouter has a catch-all that throws an error, so any non-matching routes will fail
				unauthUpgradeRouter(req, res, next);
			},
		]);
		
		// catch and authenticate all api requests
		router.use([
			async (req: express.Request, res: express.Response, next) => {
				try {
					// check if password lock is enabled
					if(!this.config?.passwordLock?.enabled) {
						next();
						return;
					}
					// get normalized path
					let reqPath = req.path;
					let oldReqPath: string;
					do {
						oldReqPath = reqPath;
						reqPath = reqPath.replaceAll('//', '/');
					} while(oldReqPath.length != reqPath.length);
					// ignore paths that don't need a plex token
					if((req.method === 'OPTIONS' && protectedOptionsEndpoints.findIndex((e) => reqPath.startsWith(e)) == -1)
						|| reqPath == '/identity' || reqPath.startsWith('/web/') || reqPath == '/web'
						|| (passthroughTranscodeMethods.indexOf(req.method) != -1 && (
							(reqPath.startsWith(videoTranscodePathPrefix) && reqPath.length > videoTranscodePathPrefix.length)
							|| (reqPath.startsWith(musicTranscodePathPrefix) && reqPath.length > musicTranscodePathPrefix.length)
							|| (reqPath.startsWith(subtitlesTranscodePathPrefix) && reqPath.length > subtitlesTranscodePathPrefix.length)
							|| (reqPath.startsWith(transcodeSessionsPrefix) && reqPath.length > transcodeSessionsPrefix.length)
						))
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
						allowedAccess = await this.isUserAllowedAccess(req as IncomingPlexAPIRequest);
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
					// unauthRouter has a catch-all that throws an error, so any non-matching routes will fail
					unauthRouter(req, res, next);
				} catch(error) {
					console.error(`Exception while handling route ${req.path}`);
					console.error(error);
					next(error);
				}
			}
		]);
	}

	isMetadataKeyWhitelisted(key: string, context: PseuplexRequestContext) {
		if(!key) {
			return false;
		}
		const metadataKeyParts = parseMetadataIDFromKey(key, '/library/metadata');
		if(!metadataKeyParts) {
			return false;
		}
		return this.isMetadataIdWhitelisted(metadataKeyParts.id, context);
	}

	isMetadataIdWhitelisted(id: string, context: PseuplexRequestContext) {
		const instructionsVideoId = this.getInstructionsItemVideoId(context);
		if(instructionsVideoId) {
			if(id == instructionsVideoId) {
				return true;
			}
		}
		return false;
	}

	isMetadataMediaPartKeyWhitelisted(key: string, context: PseuplexRequestContext) {
		const instructionsVideoId = this.getInstructionsItemVideoId(context);
		if(instructionsVideoId) {
			const instructionsMedia = this.cachedVideoMedia[instructionsVideoId];
			if(!(instructionsMedia instanceof Promise) && instructionsMedia?.Media) {
				for(const media of instructionsMedia.Media) {
					if(media.Part) {
						for(const part of media.Part) {
							if(part.key == key) {
								return true;
							}
						}
					}
				}
			}
		}
		return false;
	}

	rewriteAliasedMetadataId(metadataId: PseuplexMetadataIDParts, context: PseuplexRequestContext): string | number | null {
		if(metadataId.source == this.metadata.sourceSlug && !metadataId.directory) {
			if(metadataId.id == PasswordLockMetadataID.Instructions) {
				const instructionsVideoId = this.getInstructionsItemVideoId(context);
				if(instructionsVideoId) {
					return instructionsVideoId;
				}
			}
		}
		return null;
	}

	getInstructionsItemVideoId(context: PseuplexRequestContext): string | number | undefined {
		// TODO get per user
		return this.config.passwordLock?.instructionsItemVideoId;
	}

	async getInstructionsItemMedia(context: PseuplexRequestContext): Promise<plexTypes.PlexMedia[] | undefined> {
		const videoId = this.getInstructionsItemVideoId(context);
		if(!videoId) {
			return undefined;
		}
		let videoData = this.cachedVideoMedia[videoId];
		if(!videoData) {
			let done = false;
			videoData = plexServerAPI.getLibraryMetadata(videoId, {
				serverURL: context.plexServerURL,
				authContext: context.plexAuthContext,
				logger: this.app.logger,
			}).then((r) => {
				done = true;
				const result = {Media: firstOrSingle(r.MediaContainer.Metadata)?.Media};
				this.cachedVideoMedia[videoId] = result;
				return result;
			}, (e) => {
				done = true;
				delete this.cachedVideoMedia[videoId];
				if((e as HttpResponseError).httpResponse?.status == 404) {
					return {Media:undefined};
				}
				throw e;
			});
			if(!done) {
				this.cachedVideoMedia[videoId] = videoData;
			}
		}
		return (await videoData).Media;
	}

	get loginFailureDelay(): number {
		return this.config.passwordLock?.loginFailureDelay ?? 6000;
	}

	identityIPOfRequest(req: http.IncomingMessage) {
		const realIP = this.app.realIPOfRequest(req);
		return normalizeIPAddress(realIP, IPv4NormalizeMode.ToIPv4);
	}
	
	async isUserAllowedAccess(req: IncomingPlexHttpRequest): Promise<boolean> {
		const userEmail = req.plex.userInfo.email;
		// check if source IP is confirmed
		await this.authCache.waitForLoad();
		const identityIP = this.identityIPOfRequest(req);
		// check if we're on an auto-whitelisted network
		const userNetmasks = this.userAutoWhitelistNetmasks?.[userEmail];
		if(userNetmasks?.netmasks && userNetmasks.netmasks.findIndex((n: IPCIDR) => n.contains(identityIP)) != -1) {
			return true;
		}
		if(!userNetmasks?.override) {
			if(this.autoWhitelistNetmasks && this.autoWhitelistNetmasks.findIndex((n: IPCIDR) => n.contains(identityIP)) != -1) {
				return true;
			}
		}
		// validate the IP
		return this.authCache.isIPWhitelistedForUser(identityIP, req);
	}

	async login(req: IncomingPlexAPIRequest, inputPassword: string) {
		const identityIP = this.identityIPOfRequest(req);
		// if user has a pending login failure, throw a 429 to prevent spam
		if(this.loginFailureDelayPromises[identityIP]) {
			throw httpError(429, "Slow down there jibro");
		}
		// validate password
		const password = this.config.perUser?.[req.plex.userInfo.email]?.passwordLock?.password
			?? this.config.passwordLock?.password
			?? "";
		if(password != inputPassword) {
			// failure, delay some time to prevent brute force
			console.error(`Failed login from ip ${identityIP} with context ${JSON.stringify(req.plex)}`);
			const failureDelay = delay(this.loginFailureDelay);
			this.loginFailureDelayPromises[identityIP] = failureDelay;
			try {
				await failureDelay;
			} finally {
				delete this.loginFailureDelayPromises[identityIP];
			}
			throw httpError(401, "Wrong password");
		}
		// success, so whitelist the IP
		console.log(`Successful login from ip ${identityIP} with context ${JSON.stringify(req.plex)}`);
		const plexToken = req.plex.authContext['X-Plex-Token']!;
		this.authCache.whitelistIPForUser(identityIP, req);
		if(!this.authCache.isSaveQueued) {
			this.saveAuthCache();
		}
		// TODO send section change notifications to add library sections and remove login section, so user doesn't have to restart the app
		// disconnect any unauthed websockets
		for(const client of this.notificationWebsocketServer.clients as Set<ws & PlexClientWebsocketMixin>) {
			const cmpPlexToken = client.plex.authContext['X-Plex-Token'];
			if(plexToken == cmpPlexToken && identityIP == client.identityIP) {
				console.log(`Disconnecting unauthenticated plex websocket for ${req.plex.userInfo.email} on ip ${identityIP}`);
				client.close();
			}
		}
		// disconnect any unauthed eventsource subscribers
		for(const subscriber of this.notificationEventsourceSubscribers) {
			const cmpPlexToken = subscriber.req.plex.authContext['X-Plex-Token'];
			const cmpIdentityIP = this.identityIPOfRequest(subscriber.req);
			if(plexToken == cmpPlexToken && identityIP == cmpIdentityIP) {
				console.log(`Disconnecting unauthenticated plex eventsource subscriber for ${req.plex.userInfo.email} on ip ${identityIP}`);
				subscriber.res.end();
			}
		}
	}

	saveAuthCache() {
		this.authCache.save().catch((error) => {
			console.error("Error saving auth cache:");
			console.error(error);
		});
	}
	
} satisfies PseuplexPluginClass);


function parseAutoWhitelistedNetmasks(netmaskStrings: string | string[] | undefined) {
	if(typeof netmaskStrings === 'string') {
		netmaskStrings = netmaskStrings.trim();
		if(netmaskStrings) {
			netmaskStrings = netmaskStrings.split(',');
		} else {
			netmaskStrings = [];
		}
	} else if(netmaskStrings) {
		netmaskStrings = netmaskStrings.flatMap((netmask) => {
			netmask = netmask.trim();
			if(netmask) {
				return netmask.split(',');
			} else {
				return [];
			}
		});
	}
	return netmaskStrings?.map((maskString) => new IPCIDR(maskString)) ?? [];
}
