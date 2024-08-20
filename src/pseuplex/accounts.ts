import {
	PlexAuthContext,
	PlexMyPlexAccountPage,
	PlexServerIdentityPage
} from '../plex/types';
import * as plexServerAPI from '../plex/api';
import * as plexTVAPI from '../plextv/api';
import { httpError, HttpError } from '../utils';

export type PseuplexAccountInfo = {
	email: string;
	isServerOwner: boolean;
};

export type PseuplexAccountsStoreOptions = {
	plexServerURL: string,
	plexAuthContext: PlexAuthContext,
	sharedServersMinLifetime: number
};

export class PseuplexAccountsStore {
	_options: PseuplexAccountsStoreOptions;
	_serverMachineIdentifier: string | Promise<string> | null = null;
	
	_tokenUsers: {[key: string]: PseuplexAccountInfo} = {};
	_serverOwnerTokenCheckTasks: {[key: string]: Promise<PlexMyPlexAccountPage>} = {};
	_sharedServersTask: Promise<void> | null = null;
	_lastSharedServersFetchTime: number | null = null;

	constructor(options: PseuplexAccountsStoreOptions) {
		this._options = options;
	}

	async _getMachineIdentifier(): Promise<string> {
		if(this._serverMachineIdentifier) {
			return await this._serverMachineIdentifier;
		}
		const task = plexServerAPI.getServerIdentity({
			serverURL: this._options.plexServerURL,
			authContext: this._options.plexAuthContext
		}).then((identityPage) => {
			const machineId = identityPage?.MediaContainer?.machineIdentifier;
			if(!machineId) {
				throw new Error("Missing machineIdentifier in response");
			}
			return machineId;
		});
		let serverId: string | null = null;
		try {
			this._serverMachineIdentifier = task;
			serverId = await task;
		} finally {
			this._serverMachineIdentifier = serverId;
		}
		return serverId;
	}

	async _getTokenServerOwnerAccount(token: string): Promise<PseuplexAccountInfo | null> {
		// check if the token belongs to the server owner
		try {
			let ownerCheckTask = this._serverOwnerTokenCheckTasks[token];
			if(ownerCheckTask) {
				// wait for existing task
				const result = await ownerCheckTask;
				if(result?.MyPlex?.username) {
					return {
						email: result.MyPlex.username,
						isServerOwner: true
					};
				}
			} else {
				// send request for myplex account
				const task = plexServerAPI.getMyPlexAccount({
					serverURL: this._options.plexServerURL,
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
		const machineId = await this._getMachineIdentifier();
		// get the shared servers or wait for existing task
		if(this._sharedServersTask) {
			await this._sharedServersTask;
		} else {
			if(this._lastSharedServersFetchTime != null && (process.uptime() - this._lastSharedServersFetchTime) < this._options.sharedServersMinLifetime) {
				return;
			}
			const task = plexTVAPI.getSharedServers({
				clientIdentifier: machineId,
				authContext: this._options.plexAuthContext
			}).then((sharedServersPage) => {
				// apply new shared server tokens
				const newServerTokens = new Set<string>();
				if(sharedServersPage?.MediaContainer?.SharedServer) {
					// assign new shared server tokens
					for(const sharedServer of sharedServersPage.MediaContainer.SharedServer) {
						if(sharedServer.accessToken && sharedServer.email) {
							newServerTokens.add(sharedServer.accessToken);
							this._tokenUsers[sharedServer.accessToken] = {
								email: sharedServer.email,
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

	async getTokenUserInfo(token: string): Promise<PseuplexAccountInfo | null> {
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

	async getTokenUserInfoOrNull(token: string): Promise<PseuplexAccountInfo | null> {
		try {
			return await this.getTokenUserInfo(token);
		} catch(error) {
			console.error("Error while fetching token info for user:");
			console.error(error);
			return null;
		}
	}
}
