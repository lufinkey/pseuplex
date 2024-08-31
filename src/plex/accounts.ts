import {
	PlexAuthContext,
	PlexMyPlexAccountPage,
	PlexServerIdentityPage
} from './types';
import * as plexServerAPI from './api';
import * as plexTVAPI from '../plextv/api';
import { httpError, HttpError } from '../utils';
import { PlexServerPropertiesStore } from './serverproperties';

export type PlexServerAccountInfo = {
	email: string;
	userID: number | string;
	isServerOwner: boolean;
};

export type PlexServerAccountsStoreOptions = {
	plexServerProperties: PlexServerPropertiesStore;
	sharedServersMinLifetime: number;
};

export class PlexServerAccountsStore {
	_options: PlexServerAccountsStoreOptions;
	
	_tokenUsers: {[key: string]: PlexServerAccountInfo} = {};
	_serverOwnerTokenCheckTasks: {[key: string]: Promise<PlexMyPlexAccountPage>} = {};
	_sharedServersTask: Promise<void> | null = null;
	_lastSharedServersFetchTime: number | null = null;

	constructor(options: PlexServerAccountsStoreOptions) {
		this._options = options;
	}

	async _getTokenServerOwnerAccount(token: string): Promise<PlexServerAccountInfo | null> {
		// check if the token belongs to the server owner
		try {
			let ownerCheckTask = this._serverOwnerTokenCheckTasks[token];
			if(ownerCheckTask) {
				// wait for existing task
				const result = await ownerCheckTask;
				if(result?.MyPlex?.username) {
					return {
						email: result.MyPlex.username,
						userID: 1, // user 1 is the server owner
						isServerOwner: true
					};
				}
			} else {
				// send request for myplex account
				const task = plexServerAPI.getMyPlexAccount({
					serverURL: this._options.plexServerProperties.plexServerURL,
					authContext: {
						'X-Plex-Token': token
					}
				});
				try {
					this._serverOwnerTokenCheckTasks[token] = task;
					const result = await task;
					if(result?.MyPlex?.username) {
						const userInfo = {
							email: result.MyPlex.username,
							userID: 1, // user 1 is the server owner
							isServerOwner: true
						};
						this._tokenUsers[token] = userInfo;
						return userInfo;
					}
				} finally {
					delete this._serverOwnerTokenCheckTasks[token];
				}
			}
		} catch(error) {
			// 401 means the token isn't authorized as the server owner
			if((error as HttpError).statusCode != 401) {
				throw error;
			}
		}
		return null;
	}

	async _refetchSharedServersIfNeeded(requiredToken: string) {
		if(this._tokenUsers[requiredToken]) {
			// token exists, so no need to refetch
			return;
		}
		// get machine ID
		const machineId = await this._options.plexServerProperties.getMachineIdentifier();
		// get the shared servers or wait for existing task
		if(this._sharedServersTask) {
			await this._sharedServersTask;
		} else {
			if(this._lastSharedServersFetchTime != null && (process.uptime() - this._lastSharedServersFetchTime) < this._options.sharedServersMinLifetime) {
				return;
			}
			const task = plexTVAPI.getSharedServers({
				clientIdentifier: machineId,
				authContext: this._options.plexServerProperties.plexAuthContext
			}).then((sharedServersPage) => {
				// apply new shared server tokens
				const newServerTokens = new Set<string>();
				if(sharedServersPage?.MediaContainer?.SharedServer) {
					// assign new shared server tokens
					for(const sharedServer of sharedServersPage.MediaContainer.SharedServer) {
						if(sharedServer.accessToken && sharedServer.email) {
							newServerTokens.add(sharedServer.accessToken);
							const userID = Number.parseInt(sharedServer.userID);
							this._tokenUsers[sharedServer.accessToken] = {
								email: sharedServer.email,
								userID: !Number.isNaN(userID) ? userID : sharedServer.userID,
								isServerOwner: false
							};
						}
					}
				}
				// delete old server tokens
				for(const token in this._tokenUsers) {
					if(!newServerTokens.has(token)) {
						delete this._tokenUsers[token];
					}
				}
				this._lastSharedServersFetchTime = process.uptime();
			});
			try {
				this._sharedServersTask = task;
				await task;
			} finally {
				this._sharedServersTask = null;
			}
		}
	}

	async getTokenUserInfo(token: string): Promise<PlexServerAccountInfo | null> {
		if(!token) {
			return null;
		}
		let userInfo = this._tokenUsers[token];
		if(userInfo) {
			return userInfo;
		}
		// check if the token belongs to the server owner
		userInfo = await this._getTokenServerOwnerAccount(token);
		if(userInfo) {
			return userInfo;
		}
		// check if the token belongs to someone who the server has been shared with
		await this._refetchSharedServersIfNeeded(token);
		// get the token user info
		return this._tokenUsers[token];
	}

	async getTokenUserInfoOrNull(token: string): Promise<PlexServerAccountInfo | null> {
		try {
			return await this.getTokenUserInfo(token);
		} catch(error) {
			console.error("Error while fetching token info for user:");
			console.error(error);
			return null;
		}
	}
}
