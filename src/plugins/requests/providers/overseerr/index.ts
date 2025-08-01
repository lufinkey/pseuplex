
import * as plexTypes from '../../../../plex/types';
import { PlexServerAccountInfo } from '../../../../plex/accounts';
import { parsePlexMetadataGuidOrThrow } from '../../../../plex/metadataidentifier';
import {
	PseuplexApp,
	PseuplexConfigBase
} from '../../../../pseuplex';
import {
	PlexMediaRequestOptions,
	RequestsProvider
} from '../../provider';
import { RequestedMediaStatus, RequestInfo, RequestStatus } from '../../types';
import { OverseerrRequestsPluginConfig } from './config';
import * as overseerrAPI from './api';
import * as overseerrTypes from './apitypes'
import * as ovrsrTransform from './transform';
import { httpError, HttpResponseError } from '../../../../utils/error';
import { firstOrSingle } from '../../../../utils/misc';

export class OverseerrRequestsProvider implements RequestsProvider {
	readonly slug = 'overseerr';
	readonly app: PseuplexApp;
	
	overseerrUsersMinLifetime: number = 60;
	
	_overseerrUsers: overseerrTypes.User[] | undefined = undefined;
	_plexTokensToOverseerrUsersMap: {[token: string]: overseerrTypes.User} = {};
	_overseerrUsersTask: Promise<void> | null = null;
	_lastOverseerrUsersFetchTime: number | null = null;
	
	constructor(app: PseuplexApp) {
		this.app = app;
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

	private _overseerrReqOpts()  {
		const cfg = this.config.overseerr;
		return {
			serverURL: cfg.host,
			apiKey: cfg.apiKey,
			verbose: this.app.loggingOptions.logOutgoingRequests,
		};
	}

	async _refetchOverseerrUsersIfAble(): Promise<boolean> {
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

	_findOverseerrUserFromPlexUser(token: string, userInfo: PlexServerAccountInfo): (overseerrTypes.User | null) {
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
			return overseerrUser;
		}
		return null;
	}

	async _getOverseerrUserFromPlexUser(token: string, userInfo: PlexServerAccountInfo): Promise<overseerrTypes.User | null> {
		let overseerrUser = this._findOverseerrUserFromPlexUser(token, userInfo);
		if(overseerrUser) {
			return overseerrUser;
		}
		if(await this._refetchOverseerrUsersIfAble()) {
			return this._findOverseerrUserFromPlexUser(token, userInfo);
		}
		return null;
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
		// get plex item info
		let guidPrefix: string = 'tmdb://';
		let mediaIdKey: ('tvdbId' | 'mediaId') = 'mediaId';
		let type: overseerrTypes.MediaType;
		switch(plexItem.type) {
			case plexTypes.PlexMediaItemType.Movie:
				type = overseerrTypes.MediaType.Movie;
				break;

			case plexTypes.PlexMediaItemType.Episode:
				// get season to request instead
				type = overseerrTypes.MediaType.TV;
				if(plexItem.parentIndex == null) {
					throw httpError(500, `Unable to request season for episode`);
				}
				if(!plexItem.grandparentGuid) {
					throw httpError(500, `Unable to determine show for episode`);
				}
				const grandparentGuidParts = parsePlexMetadataGuidOrThrow(plexItem.grandparentGuid);
				if(grandparentGuidParts.protocol != plexTypes.PlexMetadataGuidProtocol.Plex) {
					throw httpError(500, `Unrecognized guid ${plexItem.grandparentGuid}`);
				}
				options.seasons = [plexItem.parentIndex];
				plexItem = firstOrSingle((await this.app.plexMetadataClient.getMetadata(grandparentGuidParts.id)).MediaContainer.Metadata)!;
				if(!plexItem) {
					throw httpError(500, `Unable to fetch show for episode`);
				}
				// cache if needed
				if(this.app.plexGuidToInfoCache) {
					this.app.plexGuidToInfoCache.cacheMetadataItem(plexItem);
				}
				break;

			case plexTypes.PlexMediaItemType.Season:
				// get show for season to request
				type = overseerrTypes.MediaType.TV;
				if(plexItem.index == null) {
					throw httpError(500, `Unable to determine season index`);
				}
				if(!plexItem.parentGuid) {
					throw httpError(500, `Unable to determine show for season`);
				}
				const parentGuidParts = parsePlexMetadataGuidOrThrow(plexItem.parentGuid);
				options.seasons = [plexItem.index];
				plexItem = firstOrSingle((await this.app.plexMetadataClient.getMetadata(parentGuidParts.id)).MediaContainer.Metadata)!;
				if(!plexItem) {
					throw httpError(500, `Unable to fetch show for season`);
				}
				// cache if needed
				if(this.app.plexGuidToInfoCache) {
					this.app.plexGuidToInfoCache.cacheMetadataItem(plexItem);
				}
				break;
				
			case plexTypes.PlexMediaItemType.TVShow:
				type = overseerrTypes.MediaType.TV;
				break;

			default:
				throw new Error(`Unsupported media type ${plexItem.type}`);
		}
		// parse media id
		const matchedGuid = plexItem.Guid?.find((guid) => guid.id?.startsWith(guidPrefix))?.id;
		if(!matchedGuid) {
			throw new Error(`Could not find ID to request`);
		}
		const mediaId = Number.parseInt(matchedGuid.substring(guidPrefix.length));
		if(Number.isNaN(mediaId)) {
			throw new Error(`Failed to parse matched guid ${matchedGuid}`);
		}
		//console.log(`Parsed ${matchedGuid} to ${matchedId}`);
		// ensure request hasn't already been sent by this user
		const ovrsrReqOpts = this._overseerrReqOpts();
		let mediaItemInfo: (overseerrTypes.Movie | overseerrTypes.TVShow);
		switch(type) {
			case overseerrTypes.MediaType.Movie:
				mediaItemInfo = await overseerrAPI.getMovie(mediaId, null, ovrsrReqOpts);
				break;

			case overseerrTypes.MediaType.TV:
				mediaItemInfo = await overseerrAPI.getTV(mediaId, null, ovrsrReqOpts);
				break;

			default:
				throw httpError(400, `Cannot handle media type ${type}`);
		}
		const matchingRequest = mediaItemInfo.mediaInfo?.requests?.find((reqInfo) => {
			return reqInfo.requestedBy?.id == overseerrUser.id
		});
		if(matchingRequest) {
			if(this.app.loggingOptions.logOutgoingRequests) {
				console.log(`Found existing overserr request ${JSON.stringify(matchingRequest)}`);
			}
			// already requested by this user
			return ovrsrTransform.transformOverseerrRequestItem(matchingRequest, mediaItemInfo.mediaInfo);
		}
		// send request to overseerr
		const createItemReq: overseerrAPI.CreateRequestItem = {
			mediaType: type,
			[mediaIdKey]: mediaId,
			userId: overseerrUser.id,
			seasons: options?.seasons
		};
		let resData: overseerrTypes.MediaRequestItem;
		try {
			resData = await overseerrAPI.createRequest(createItemReq, ovrsrReqOpts);
		} catch(error) {
			if((error as HttpResponseError).httpResponse?.status == 202) {
				const firstRequest = mediaItemInfo?.mediaInfo?.requests?.[0];
				if(firstRequest) {
					// already requested by this user
					return ovrsrTransform.transformOverseerrRequestItem(firstRequest, mediaItemInfo.mediaInfo);
				}
			}
			throw error;
		}
		return ovrsrTransform.transformOverseerrRequestItem(resData, resData.media);
	}
}
