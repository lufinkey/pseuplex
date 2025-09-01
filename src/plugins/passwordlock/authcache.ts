import fs from 'fs';
import * as plexTypes from '../../plex/types';
import {
	PlexServerAccountsStore
} from '../../plex/accounts';
import {
	IPv4NormalizeMode,
	normalizeIPAddress
} from '../../utils/ip';
import { IncomingPlexAPIRequest, IncomingPlexHttpRequest } from '../../plex/requesthandling';

export type PasswordLockWhitelistedIPInfo = {
	addedAt: number;
	// TODO lastAccessedAt: number;
	// TODO add recent tokens and client IDs
};

export type PasswordLockWhitelistedIPMap = {
	[ip: string]: PasswordLockWhitelistedIPInfo
};

export type PasswordLockAuthCacheUser = {
	whitelistedIPs: PasswordLockWhitelistedIPMap;
};

export type PasswordLockAuthCacheUsers = {
	[email: string]: PasswordLockAuthCacheUser;
};

export type PasswordLockAuthCacheData = {
	tokensToWhitelistedIPs?: {
		[plexToken: string]: string[]
	},
	emailsToWhitelistedIPs?: {
		[email: string]: string[]
	},
	users: PasswordLockAuthCacheUsers
};

export type EmailsToIPsMap = {
	[email: string]: Set<string>;
};

export class PasswordLockAuthenticationCache {
	readonly filePath: string | null;
	readonly plexServerAccountsStore: PlexServerAccountsStore;
	saveReadableJson: boolean;

	private _users: PasswordLockAuthCacheUsers = {};
	private _fileTaskPromise: Promise<void> | null = null;
	private _loadPromise: Promise<boolean> | null = null;
	private _nextSavePromise: Promise<boolean> | null = null;
	private _pendingUnsavedChanges: boolean = false;
	private _savingUnsavedChanges: boolean = false;

	constructor(filePath: string | null | undefined, options: {
		plexAccountsStore: PlexServerAccountsStore,
		saveReadableJson?: boolean,
	}) {
		this.filePath = filePath ?? null;
		this.plexServerAccountsStore = options.plexAccountsStore;
		this.saveReadableJson = options.saveReadableJson ?? false;
	}

	private async _doFileTask<T>(task: () => Promise<T>): Promise<T> {
		while(this._fileTaskPromise) {
			await this._fileTaskPromise;
		}
		let resolveFunc!: () => void;
		this._fileTaskPromise = new Promise<void>((resolve, reject) => {
			resolveFunc = resolve;
		});
		try {
			return await task();
		} finally {
			this._fileTaskPromise = null;
			resolveFunc();
		}
	}

	waitForLoad(): (Promise<void> | void) {
		if(!this._loadPromise) {
			return;
		}
		return this._loadPromise?.then(() => {}, (_) => {});
	}

	async load(): Promise<boolean> {
		if(!this.filePath) {
			return false;
		}
		let done = false;
		const loadPromise = this._doFileTask(async () => {
			try {
				if(!(await new Promise<boolean>((r) => fs.exists(this.filePath!, r)))) {
					return false;
				}
				const data = await fs.promises.readFile(this.filePath!, {encoding: 'utf8'});
				const cacheObj: PasswordLockAuthCacheData = JSON.parse(data);
				if(!cacheObj || typeof cacheObj !== 'object') {
					throw new Error(`Invalid auth cache data`);
				}
				let users: PasswordLockAuthCacheUsers = cacheObj.users || {};
				const now = (new Date()).getTime() / 1000;
				let unsavedChanges = false;
				// auto-convert emails to IPs
				if(cacheObj.emailsToWhitelistedIPs) {
					for(const email of Object.keys(cacheObj.emailsToWhitelistedIPs)) {
						const ipList = cacheObj.emailsToWhitelistedIPs[email];
						if(!(ipList instanceof Array) || ipList.length == 0) {
							continue;
						}
						// get auth cache entry for user
						let userAuthCache = users[email];
						if(!userAuthCache) {
							userAuthCache = {whitelistedIPs: {}};
							users[email] = userAuthCache;
						}
						unsavedChanges = true;
						// add ip entries for user
						for(const ip of ipList) {
							let ipInfo = userAuthCache.whitelistedIPs[ip];
							if(!ipInfo) {
								ipInfo = {
									addedAt: now,
									// lastAccessedAt: now,
								};
								userAuthCache.whitelistedIPs[ip] = ipInfo;
							}
						}
					}
				}
				// auto-convert tokens to IPs
				if(cacheObj.tokensToWhitelistedIPs) {
					const tokensList = Object.keys(cacheObj.tokensToWhitelistedIPs);
					for(const plexToken of tokensList) {
						const ipList = cacheObj.tokensToWhitelistedIPs[plexToken];
						if(!(ipList instanceof Array) || ipList.length == 0) {
							continue;
						}
						// get the associated user for the token
						const userForToken = await this.plexServerAccountsStore.getUserInfoOrNull({'X-Plex-Token':plexToken});
						const email = userForToken?.email;
						if(!email) {
							continue;
						}
						// get auth cache entry for user
						let userAuthCache = users[email];
						if(!userAuthCache) {
							userAuthCache = {whitelistedIPs: {}};
							users[email] = userAuthCache;
						}
						unsavedChanges = true;
						// add ip entries for user
						for(const ip of ipList) {
							let ipInfo = userAuthCache.whitelistedIPs[ip];
							if(!ipInfo) {
								ipInfo = {
									addedAt: now,
									// lastAccessedAt: now,
								};
								userAuthCache.whitelistedIPs[ip] = ipInfo;
							}
						}
					}
				}
				// set new auth data
				this._users = users;
				this._pendingUnsavedChanges = unsavedChanges;
				return true;
			} finally {
				this._loadPromise = null;
				done = true;
			}
		});
		if(!done) {
			this._loadPromise = loadPromise;
		}
		return await loadPromise;
	}

	get hasPendingUnsavedChanges(): boolean {
		return this._pendingUnsavedChanges;
	}

	get hasUnsavedChanges(): boolean {
		return this._pendingUnsavedChanges || this._savingUnsavedChanges;
	}

	get isSaveQueued(): boolean {
		return this._nextSavePromise != null;
	}

	async save(): Promise<boolean> {
		if(!this.filePath) {
			return false;
		}
		if(this._nextSavePromise) {
			return await this._nextSavePromise;
		}
		// to prevent multiple subsequent saves, we only queue one save until the save actually executes
		let nextSaveStarted = false;
		const nextSavePromise = this._doFileTask(async () => {
			this._nextSavePromise = null;
			nextSaveStarted = true;
			// create cache object
			const cacheObj: PasswordLockAuthCacheData = {
				users: this._users,
			};
			// serialize to json
			let cacheData: string;
			if(this.saveReadableJson) {
				cacheData = JSON.stringify(cacheObj, null, '\t');
			} else {
				cacheData = JSON.stringify(cacheObj);
			}
			// write to file
			this._savingUnsavedChanges = this._pendingUnsavedChanges;
			this._pendingUnsavedChanges = false;
			try {
				await fs.promises.writeFile(this.filePath!, cacheData);
			} catch(error) {
				// didn't save successfully,
				//  so re-apply unsaved changes if needed
				if(this._savingUnsavedChanges) {
					this._pendingUnsavedChanges = this._savingUnsavedChanges;
					this._savingUnsavedChanges = false;
				}
				throw error;
			}
			return true;
		});
		// if we haven't already started the next save, we should cache the promise to ensure multiple save calls only save once
		if(!nextSaveStarted) {
			this._nextSavePromise = nextSavePromise;
		}
		return await nextSavePromise;
	}

	isIPWhitelistedForUser(ipAddress: string, req: IncomingPlexAPIRequest | IncomingPlexHttpRequest): boolean {
		const userEmail = req.plex.userInfo.email;
		// ipv4 addresses are stored as ipv4
		ipAddress = normalizeIPAddress(ipAddress, IPv4NormalizeMode.ToIPv4);
		// get info for ip address
		const ipInfo = this._users[userEmail]?.whitelistedIPs[ipAddress];
		return ipInfo ? true : false;
	}

	whitelistIPForUser(ipAddress: string, req: IncomingPlexAPIRequest | IncomingPlexHttpRequest) {
		const userEmail = req.plex.userInfo.email;
		// get user auth cache info
		let userAuthCache = this._users[userEmail];
		if(!userAuthCache) {
			userAuthCache = {whitelistedIPs:{}};
			this._users[userEmail] = userAuthCache;
		}
		// ensure ipv4 addresses are stored as ipv4
		ipAddress = normalizeIPAddress(ipAddress, IPv4NormalizeMode.ToIPv4);
		// update whitelisted ip info
		let ipInfo = userAuthCache.whitelistedIPs[ipAddress];
		const now = (new Date()).getTime() / 1000;
		if(ipInfo) {
			// ipInfo.lastAccessedAt = now;
		} else {
			ipInfo = {
				addedAt: now,
				// lastAccessedAt: now,
			};
			userAuthCache.whitelistedIPs[ipAddress] = ipInfo;
		}
		// mark unsaved changes
		this._pendingUnsavedChanges = true;
	}
}
