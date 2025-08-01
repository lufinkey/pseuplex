import {
	PlexAuthContext,
	PlexMyPlexAccountPage,
} from './types';
import * as plexServerAPI from './api';
import * as plexTVAPI from '../plextv/api';
import { PlexTVCurrentUserInfo } from '../plextv/types/User';
import { HttpResponseError } from '../utils/error';
import { PlexServerPropertiesStore } from './serverproperties';

export type PlexServerAccountInfo = {
	email: string;
	plexUsername: string;
	plexUserID: number | string;
	serverUserID: number | string;
	isServerOwner: boolean;
};

export type PlexServerAccountsStoreOptions = {
	plexServerProperties: PlexServerPropertiesStore;
	sharedServersMinLifetime?: number;
	logPlexFuckery?: boolean;
};

export class PlexServerAccountsStore {
	readonly plexServerProperties: PlexServerPropertiesStore;
	readonly sharedServersMinLifetime: number;
	
	_tokensToPlexOwnersMap: {[token: string]: PlexServerAccountInfo} = {};
	_tokensToPlexUsersMap: {[token: string]: PlexServerAccountInfo} = {};
	
	_serverOwnerTokenCheckTasks: {[key: string]: Promise<PlexServerAccountInfo | null>} = {};
	_sharedServersTask: Promise<void> | null = null;
	_lastSharedServersFetchTime: number | null = null;

	_logPlexFuckery?: boolean;

	constructor(options: PlexServerAccountsStoreOptions) {
		this.plexServerProperties = options.plexServerProperties;
		this.sharedServersMinLifetime = options.sharedServersMinLifetime ?? 60;
		this._logPlexFuckery = options.logPlexFuckery;
	}

	get lastSharedServersFetchTime() {
		return this._lastSharedServersFetchTime;
	}

	isTokenMapped(token: string): boolean {
		if(this._tokensToPlexOwnersMap[token] || this._tokensToPlexUsersMap[token]) {
			return true;
		}
		return false;
	}

	/// Returns the account info if the token belongs to the server owner, otherwise returns null
	private async _fetchTokenServerOwnerAccount(token: string): Promise<PlexServerAccountInfo | null> {
		let task = this._serverOwnerTokenCheckTasks[token];
		if(task) {
			// wait for existing task
			return await task;
		}
		try {
			task = (async () => {
				// send request for myplex account
				let myPlexAccountPage: PlexMyPlexAccountPage | null;
				try {
					myPlexAccountPage = await plexServerAPI.getMyPlexAccount({
						...this.plexServerProperties.requestOptions,
						authContext: {
							'X-Plex-Token': token
						}
					});
				} catch(error) {
					// 401 means the token isn't authorized as the server owner
					if((error as HttpResponseError).httpResponse?.status == 401) {
						return null;
					}
					// all non-401 errors should still get thrown
					throw error;
				}
				// check that required data exists
				if(!myPlexAccountPage?.MyPlex?.username) {
					console.error(`Missing plex account username in MyPlex account response`);
					return null;
				}
				// fetch the rest of the user data from plex
				const plexTvOptions: plexTVAPI.PlexTVAPIRequestOptions = {...this.plexServerProperties.requestOptions};
				delete (plexTvOptions as {serverURL?: string}).serverURL;
				let plexUserInfo: PlexTVCurrentUserInfo;
				try {
					plexUserInfo = await plexTVAPI.getCurrentUser({
						...plexTvOptions,
						authContext: {
							'X-Plex-Token': token
						},
					});
				} catch (error) {
					if((error as HttpResponseError).httpResponse?.status == 401) {
						if(this._logPlexFuckery) {
							console.error("The plex server owner wasn't able to fetch account info:");
							console.error(error);
						}
						return null;
					}
					throw error;
				}
				// ensure the account info matches the owner info
				if (plexUserInfo.email != myPlexAccountPage.MyPlex.username
				   && plexUserInfo.username != myPlexAccountPage.MyPlex.username) {
					console.error(`User info ${plexUserInfo.email ?? plexUserInfo.username} doesnt match plex server owner ${myPlexAccountPage.MyPlex.username}`);
					return null;
				}
				// add user info for owner
				const userInfo: PlexServerAccountInfo = {
					email: myPlexAccountPage.MyPlex.username,
					serverUserID: 1, // user 1 is the server owner
					plexUsername: plexUserInfo.username,
					plexUserID: plexUserInfo.id,
					isServerOwner: true
				};
				this._tokensToPlexOwnersMap[token] = userInfo;
				return userInfo;
			})();
			// store pending task and wait
			this._serverOwnerTokenCheckTasks[token] = task;
			return await task;
		} finally {
			// delete pending task
			delete this._serverOwnerTokenCheckTasks[token];
		}
	}

	/// Refetches the list of shared servers if needed
	private async _refetchSharedServersIfAble(): Promise<boolean> {
		// get plex server machine ID
		const machineId = await this.plexServerProperties.getMachineIdentifier();
		// wait for existing fetch operation to finish, if any
		if(this._sharedServersTask) {
			await this._sharedServersTask;
			return true;
		}
		// ensure that enough time has passed that we can re-fetch this
		if(this._lastSharedServersFetchTime != null && (process.uptime() - this._lastSharedServersFetchTime) < this.sharedServersMinLifetime) {
			return false;
		}
		try {
			// fetch users that the plex server is shared with
			const plexTvOptions: plexTVAPI.PlexTVAPIRequestOptions = {...this.plexServerProperties.requestOptions};
			delete (plexTvOptions as {serverURL?: string}).serverURL;
			const task = plexTVAPI.getSharedServers({
				clientIdentifier: machineId,
			}, plexTvOptions).then((sharedServersPage) => {
				// apply new shared server tokens
				const newServerTokens = new Set<string>();
				if(sharedServersPage?.MediaContainer?.SharedServer) {
					// assign new shared server tokens
					for(const sharedServer of sharedServersPage.MediaContainer.SharedServer) {
						if(sharedServer.accessToken && sharedServer.email) {
							newServerTokens.add(sharedServer.accessToken);
							const userID = Number.parseInt(sharedServer.userID);
							this._tokensToPlexUsersMap[sharedServer.accessToken] = {
								email: sharedServer.email,
								serverUserID: !Number.isNaN(userID) ? userID : sharedServer.userID,
								plexUsername: sharedServer.username,
								plexUserID: sharedServer.id,
								isServerOwner: false
							};
						}
					}
				}
				// delete old server tokens
				for(const token in this._tokensToPlexUsersMap) {
					if(!newServerTokens.has(token)) {
						delete this._tokensToPlexUsersMap[token];
					}
				}
				// update the last time that the server users was fetched
				this._lastSharedServersFetchTime = process.uptime();
			});
			// store pending task and wait
			this._sharedServersTask = task;
			await task;
			return true;
		} finally {
			// delete pending task
			this._sharedServersTask = null;
		}
	}

	async getUserInfo(authContext: PlexAuthContext): Promise<PlexServerAccountInfo | null> {
		const token = authContext['X-Plex-Token'];
		if(!token) {
			return null;
		}
		// get user info for token
		let userInfo: (PlexServerAccountInfo | null) = this._tokensToPlexOwnersMap[token] ?? this._tokensToPlexUsersMap[token];
		if(userInfo) {
			return userInfo;
		}
		// check if the token belongs to the server owner
		userInfo = await this._fetchTokenServerOwnerAccount(token);
		if(userInfo) {
			return userInfo;
		}
		// refetch shared users for server if needed
		if(await this._refetchSharedServersIfAble()) {
			// get the token user info (if any)
			return this._tokensToPlexUsersMap[token] ?? null;
		}
		return null;
	}

	async getUserInfoOrNull(authContext: PlexAuthContext): Promise<PlexServerAccountInfo | null> {
		try {
			return await this.getUserInfo(authContext);
		} catch(error) {
			console.error(`Error while fetching user info from token:`);
			console.error(error);
			return null;
		}
	}
}
