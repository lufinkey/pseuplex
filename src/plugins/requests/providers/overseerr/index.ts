
import * as plexTypes from '../../../../plex/types';
import { PlexServerAccountInfo } from '../../../../plex/accounts';
import { parsePlexMetadataGuidOrThrow } from '../../../../plex/metadataidentifier';
import {
	PseuplexApp,
	PseuplexConfigBase,
	PseuplexRequestContext
} from '../../../../pseuplex';
import {
	PlexMediaRequestOptions,
	RequestsProvider,
	RequestsProviderClass
} from '../../provider';
import { RequestInfo } from '../../types';
import { OverseerrRequestsPluginConfig } from './config';
import * as overseerrAPI from './api';
import * as overseerrTypes from './apitypes'
import * as ovrsrTransform from './transform';
import { httpError, HttpResponseError } from '../../../../utils/error';
import { firstOrSingle } from '../../../../utils/misc';
import { PlexIdCachedInfo } from '../../../../plex/metadata';

type RequestableItemInfo = {
	type: overseerrTypes.MediaType,
	tvdbId?: number,
	tmdbId?: number,
	season: number | undefined,
};

export default (class OverseerrRequestsProvider implements RequestsProvider {
	readonly slug = 'overseerr';
	readonly app: PseuplexApp;
	
	overseerrUsersMinLifetime: number = 60;
	
	_uniqueOverseerrUsernames = new Set<string>();
	_overseerrUsers: overseerrTypes.User[] | undefined = undefined;
	_allMatchedPlexTokensToOverseerrUsersMap: {[token: string]: overseerrTypes.User} = {};
	_plexTokensToOverseerrUsersMap: {[token: string]: overseerrTypes.User} = {};
	_overseerrUsersTask: Promise<void> | null = null;
	_lastOverseerrUsersFetchTime: number | null = null;
	
	constructor(app: PseuplexApp) {
		this.app = app;
		// log if overseerr is misspelled, so this doesn't happen again
		if(!this.config.overseerr && (this.config as any)['overseer']) {
			console.warn(`It looks like overseerr may be misspelled in your config`);
		}
	}
	
	get config(): OverseerrRequestsPluginConfig {
		return this.app.config as OverseerrRequestsPluginConfig;
	}
	
	get isConfigured(): boolean {
		const cfg = this.config?.overseerr;
		if (cfg && cfg.host && cfg.apiKey) {
			return true;
		}
		return false;
	}

	get canRequestEpisodes(): boolean {
		return false;
	}

	private _overseerrReqOpts(): overseerrAPI.OverseerrAPIRequestOptions  {
		const cfg = this.config.overseerr;
		return {
			serverURL: cfg.host,
			apiKey: cfg.apiKey,
			logger: this.app.logger,
		};
	}

	private async _refetchOverseerrUsersIfAble(): Promise<boolean> {
		// wait for existing fetch operation, if any
		if(this._overseerrUsersTask) {
			await this._overseerrUsersTask;
			return true;
		}
		// check if enough time has passed that we can refetch
		if(this._lastOverseerrUsersFetchTime != null && (process.uptime() - this._lastOverseerrUsersFetchTime) < this.overseerrUsersMinLifetime) {
			return false;
		}
		try {
			const cfg = this.config.overseerr;
			// fetch overseer users
			const task = overseerrAPI.getUsers({take: 1000}, {
				serverURL: cfg.host,
				apiKey: cfg.apiKey,
			}).then((usersPage) => {
				this._overseerrUsers = usersPage.results;
				if(usersPage.results) {
					const prevKeys = new Set(this._uniqueOverseerrUsernames);
					for(const user of usersPage.results) {
						if(!prevKeys.has(user.username)) {
							this._uniqueOverseerrUsernames.add(user.username);
							this.app.logger?.logFetchedOverseerrUser(user);
						}
					}
				}
				this._plexTokensToOverseerrUsersMap = {};
				this._lastOverseerrUsersFetchTime = process.uptime();
			});
			// store pending task and wait
			this._overseerrUsersTask = task;
			await task;
			return true;
		} finally {
			// delete pending task
			this._overseerrUsersTask = null;
		}
	}

	private _findOverseerrUserFromPlexUser(token: string, userInfo: PlexServerAccountInfo): (overseerrTypes.User | null) {
		let overseerrUser: (overseerrTypes.User | undefined) = this._plexTokensToOverseerrUsersMap[token];
		if(overseerrUser) {
			return overseerrUser;
		}
		overseerrUser = this._overseerrUsers?.find((osrUser) => {
			return (osrUser.plexId != null && osrUser.plexId == userInfo.plexUserID)
				|| (osrUser.plexUsername && osrUser.plexUsername == userInfo.plexUsername)
				|| (osrUser.email && osrUser.email == userInfo.email);
		});
		if(overseerrUser) {
			this._plexTokensToOverseerrUsersMap[token] = overseerrUser;
			const prevMatchedUser = this._allMatchedPlexTokensToOverseerrUsersMap[token];
			this._allMatchedPlexTokensToOverseerrUsersMap[token] = overseerrUser;
			const userChanged =
				(!prevMatchedUser || prevMatchedUser.plexId != overseerrUser.plexId || prevMatchedUser.plexUsername != overseerrUser.plexUsername
				|| prevMatchedUser.email != overseerrUser.email || prevMatchedUser.username != overseerrUser.username);
			if(userChanged) {
				this.app.logger?.logOverseerrUserMatched(token, userInfo, overseerrUser);
			}
			return overseerrUser;
		}
		return null;
	}

	private async _getOverseerrUserFromPlexUser(token: string, userInfo: PlexServerAccountInfo): Promise<overseerrTypes.User | null> {
		let overseerrUser = this._findOverseerrUserFromPlexUser(token, userInfo);
		if(!overseerrUser) {
			if(await this._refetchOverseerrUsersIfAble()) {
				overseerrUser = this._findOverseerrUserFromPlexUser(token, userInfo);
			}
		}
		if(!overseerrUser) {
			this.app.logger?.logOverseerrUserNotMatched(token, userInfo);
		}
		return overseerrUser ?? null;
	}

	private async _getRequestableItem(plexItem: (PlexIdCachedInfo & {type: plexTypes.PlexMediaItemType})): Promise<RequestableItemInfo> {
		// get plex item info
		let tmdbPrefix: string = 'tmdb://';
		let tvdbPrefix: string = 'tvdb://';
		let type: overseerrTypes.MediaType;
		let itemGuids: plexTypes.PlexGuid[] | undefined;
		let season: number | undefined;
		const plexIdToInfoCache = this.app.plexIdToInfoCache;
		switch(plexItem.type) {
			case plexTypes.PlexMediaItemType.Movie: {
				type = overseerrTypes.MediaType.Movie;
				itemGuids = plexItem.Guid;
			} break;

			case plexTypes.PlexMediaItemType.Episode: {
				// get season to request instead
				type = overseerrTypes.MediaType.TV;
				if(plexItem.parentIndex == null) {
					throw httpError(500, `Unable to request season for episode`);
				}
				if(!plexItem.grandparentRatingKey) {
					throw httpError(500, `Unable to determine show for episode`);
				}
				season = plexItem.parentIndex;
				const grandparentMetadataItem = plexIdToInfoCache
					? await plexIdToInfoCache.getOrFetch(plexItem.grandparentRatingKey)
					: firstOrSingle((await this.app.plexMetadataClient.getMetadata(plexItem.grandparentRatingKey)).MediaContainer.Metadata);
				itemGuids = grandparentMetadataItem?.Guid;
			} break;

			case plexTypes.PlexMediaItemType.Season: {
				// get show for season to request
				type = overseerrTypes.MediaType.TV;
				if(plexItem.index == null) {
					throw httpError(500, `Unable to determine season index`);
				}
				if(!plexItem.parentRatingKey) {
					throw httpError(500, `Unable to determine show for season`);
				}
				season = plexItem.index;
				const parentMetadataItem = plexIdToInfoCache
					? await plexIdToInfoCache.getOrFetch(plexItem.parentRatingKey)
					: firstOrSingle((await this.app.plexMetadataClient.getMetadata(plexItem.parentRatingKey)).MediaContainer.Metadata);
				itemGuids = parentMetadataItem?.Guid;
				console.log("got guids from show item");
			} break;
				
			case plexTypes.PlexMediaItemType.TVShow: {
				type = overseerrTypes.MediaType.TV;
				itemGuids = plexItem.Guid;
			} break;

			default:
				throw new Error(`Unsupported media type ${plexItem.type}`);
		}
		const tvdbIdString = itemGuids?.find((g) => g.id.startsWith(tvdbPrefix))?.id.slice(tvdbPrefix.length);
		const tmdbIdString = itemGuids?.find((g) => g.id.startsWith(tmdbPrefix))?.id.slice(tmdbPrefix.length);
		// parse media ids
		const tvdbId = tvdbIdString ? Number.parseInt(tvdbIdString) : undefined;
		const tmdbId = tmdbIdString ? Number.parseInt(tmdbIdString) : undefined;
		return {
			type,
			season,
			tmdbId: (tmdbId != null && !Number.isNaN(tmdbId)) ? tmdbId : (tmdbIdString as any),
			tvdbId: (tvdbId != null && !Number.isNaN(tvdbId)) ? tvdbId : (tvdbIdString as any),
		};
	}

	async canPlexUserMakeRequests(token: string, userInfo: PlexServerAccountInfo): Promise<boolean> {
		const overseerrUser = await this._getOverseerrUserFromPlexUser(token, userInfo);
		if(overseerrUser) {
			return true;
		}
		return false;
	}
	
	async requestPlexItem(plexItem: plexTypes.PlexMetadataItem, options: PlexMediaRequestOptions): Promise<RequestInfo> {
		// get overseerr user info
		const userToken = options.context.plexAuthContext['X-Plex-Token'];
		const overseerrUser = userToken ? await this._getOverseerrUserFromPlexUser(userToken, options.context.plexUserInfo) : null;
		if(!overseerrUser) {
			throw httpError(401, `User is not allowed to request media from ${this.slug}`);
		}
		const reqItem = await this._getRequestableItem(plexItem);
		if(reqItem.season == null && options.season != null) {
			reqItem.season = options.season;
		}
		if(!reqItem.tmdbId) {
			throw httpError(500, "Unable to find matching tmdb id");
		}
		// ensure request hasn't already been sent by this user
		const ovrsrReqOpts = this._overseerrReqOpts();
		let mediaItemInfo: (overseerrTypes.Movie | overseerrTypes.TVShow);
		switch(reqItem.type) {
			case overseerrTypes.MediaType.Movie:
				mediaItemInfo = await overseerrAPI.getMovie(reqItem.tmdbId, null, ovrsrReqOpts);
				break;

			case overseerrTypes.MediaType.TV:
				mediaItemInfo = await overseerrAPI.getTV(reqItem.tmdbId, null, ovrsrReqOpts);
				break;

			default:
				throw httpError(400, `Cannot handle media type ${reqItem.type}`);
		}
		const matchingRequest = mediaItemInfo.mediaInfo?.requests?.find((reqInfo) => {
			return reqInfo.requestedBy?.id == overseerrUser.id
				&& (options.season == null || (reqInfo as overseerrTypes.TVRequestInfo).seasons?.find((s) => s.seasonNumber == options.season));
		});
		if(matchingRequest) {
			if(this.app.logger?.options.logOutgoingRequests) {
				console.log(`Found existing overserr request ${JSON.stringify(matchingRequest)}`);
			}
			// already requested by this user
			return ovrsrTransform.transformOverseerrRequestItem(matchingRequest, mediaItemInfo.mediaInfo, {
				seasons: (matchingRequest as overseerrTypes.TVRequestInfo).seasons?.map((s) => s.seasonNumber),
			});
		}
		// send request to overseerr
		const seasons = options?.season != null ? [options.season] : undefined;
		const createItemReq: overseerrAPI.CreateRequestItem = {
			mediaType: reqItem.type,
			mediaId: reqItem.tmdbId,
			userId: overseerrUser.id,
			seasons,
		};
		let resData: overseerrTypes.CreateRequestItemResult;
		try {
			resData = await overseerrAPI.createRequest(createItemReq, ovrsrReqOpts);
		} catch(error) {
			if((error as HttpResponseError).httpResponse?.status == 202) {
				const firstRequest = options.season != null ?
					mediaItemInfo?.mediaInfo?.requests?.find((cmpReq: overseerrTypes.TVRequestInfo) => cmpReq.seasons?.find((s) => s.seasonNumber == options.season))
					: mediaItemInfo?.mediaInfo?.requests?.[0];
				if(firstRequest) {
					// already requested by this user
					return ovrsrTransform.transformOverseerrRequestItem(firstRequest, mediaItemInfo.mediaInfo, {
						seasons: (firstRequest as overseerrTypes.TVRequestInfo).seasons?.map((s) => s.seasonNumber)
					});
				}
			}
			throw error;
		}
		return ovrsrTransform.transformOverseerrRequestItem(resData, resData.media, {seasons});
	}

	async _getRequestsForRequestableItem(reqItem: RequestableItemInfo, context: PseuplexRequestContext) {
		if(!reqItem.tmdbId) {
			throw httpError(500, "Unable to find matching tmdb id");
		}
		// get media item info from overseerr
		const ovrsrReqOpts = this._overseerrReqOpts();
		let mediaItemInfo: (overseerrTypes.Movie | overseerrTypes.TVShow);
		switch(reqItem.type) {
			case overseerrTypes.MediaType.Movie:
				mediaItemInfo = await overseerrAPI.getMovie(reqItem.tmdbId, null, ovrsrReqOpts);
				break;

			case overseerrTypes.MediaType.TV:
				mediaItemInfo = await overseerrAPI.getTV(reqItem.tmdbId, null, ovrsrReqOpts);
				break;

			default:
				throw httpError(400, `Cannot handle media type ${reqItem.type}`);
		}
		// return requests
		let requests = mediaItemInfo?.mediaInfo?.requests;
		if(reqItem.season != null) {
			requests = requests.filter((r: overseerrTypes.TVRequestInfo) => {
				return r.seasons?.find((s) => s.seasonNumber == reqItem.season);
			});
		}
		if(reqItem.type == overseerrTypes.MediaType.TV) {
			return requests?.map((r: overseerrTypes.TVRequestInfo): RequestInfo => {
				return ovrsrTransform.transformOverseerrRequestItem(r, mediaItemInfo.mediaInfo, {
					seasons: r.seasons?.map((s) => s.seasonNumber)
				});
			}) ?? [];
		} else {
			return requests?.map((r: overseerrTypes.MovieRequestInfo): RequestInfo => {
				return ovrsrTransform.transformOverseerrRequestItem(r, mediaItemInfo.mediaInfo, {});
			}) ?? [];
		}
	}

	async getRequestsForPlexItem(plexItem: plexTypes.PlexMetadataItem, context: PseuplexRequestContext): Promise<RequestInfo[]> {
		const reqItem = await this._getRequestableItem(plexItem);
		return await this._getRequestsForRequestableItem(reqItem, context);
	}

	async getRequestsForPlexGuid(plexGuid: string, context: PseuplexRequestContext): Promise<RequestInfo[]> {
		const plexGuidParts = parsePlexMetadataGuidOrThrow(plexGuid);
		if(plexGuidParts.protocol != plexTypes.PlexMetadataGuidProtocol.Plex || !plexGuidParts.type) {
			throw httpError(500, `Unrecognized plex guid ${plexGuid}`);
		}
		const plexIdToInfoCache = this.app.plexIdToInfoCache;
		const plexItem = plexIdToInfoCache
			? await plexIdToInfoCache.getOrFetch(plexGuidParts.id)
			: firstOrSingle((await this.app.plexMetadataClient.getMetadata(plexGuidParts.id)).MediaContainer.Metadata);
		const reqItem = await this._getRequestableItem({
			...plexItem,
			type: plexGuidParts.type as plexTypes.PlexMediaItemType,
		});
		return await this._getRequestsForRequestableItem(reqItem, context);
	}
} as RequestsProviderClass);
