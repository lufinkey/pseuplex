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

export type PasswordLockAuthCacheData = {
	tokensToWhitelistedIPs?: {
		[plexToken: string]: string[]
	},
	emailsToWhitelistedIPs?: {
		[email: string]: string[]
	},
};

export type EmailsToIPsMap = {
	[email: string]: Set<string>;
};

export class PasswordLockAuthenticationCache {
	readonly filePath: string | null;
	readonly plexServerAccountsStore: PlexServerAccountsStore;
	saveReadableJson: boolean;

	private _emailsToWhitelistedIPs: EmailsToIPsMap = {};
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
				const emailsToIPs: EmailsToIPsMap = {};
				let unsavedChanges = false;
				// load from emails to IPs array map
				//  into an emails to IPs set map
				if(cacheObj.emailsToWhitelistedIPs) {
					for(const email of Object.keys(cacheObj.emailsToWhitelistedIPs)) {
						const ipList = cacheObj.emailsToWhitelistedIPs[email];
						if(!(ipList instanceof Array)) {
							continue;
						}
						emailsToIPs[email] = new Set(ipList);
					}
				}
				// auto-convert old structure of tokens to IPs
				if(cacheObj.tokensToWhitelistedIPs) {
					const tokensList = Object.keys(cacheObj.tokensToWhitelistedIPs);
					unsavedChanges = tokensList.length > 0;
					for(const plexToken of tokensList) {
						const ipList = cacheObj.tokensToWhitelistedIPs[plexToken];
						if(!(ipList instanceof Array)) {
							continue;
						}
						// get the associated user for the token
						const userForToken = await this.plexServerAccountsStore.getUserInfoOrNull({'X-Plex-Token':plexToken});
						if(!userForToken) {
							continue;
						}
						let ipSet = emailsToIPs[userForToken.email];
						if(ipSet) {
							for(const ip of ipList) {
								ipSet.add(ip);
							}
						} else {
							ipSet = new Set(ipList);
							emailsToIPs[userForToken.email] = ipSet;
						}
					}
				}
				// set new emails to IPs map
				this._emailsToWhitelistedIPs = emailsToIPs;
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
			const emailsToIPs: {[email: string]: string[]} = {};
			for(const email of Object.keys(this._emailsToWhitelistedIPs)) {
				const ips = this._emailsToWhitelistedIPs[email];
				emailsToIPs[email] = Array.from(ips);
			}
			const cacheObj: PasswordLockAuthCacheData = {
				emailsToWhitelistedIPs: emailsToIPs,
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
		// get ip set for the user
		const ips = this._emailsToWhitelistedIPs[userEmail];
		if(!ips) {
			return false;
		}
		return ips.has(ipAddress);
	}

	whitelistIPForUser(ipAddress: string, req: IncomingPlexAPIRequest | IncomingPlexHttpRequest) {
		const userEmail = req.plex.userInfo.email;
		// ensure ipv4 addresses are stored as ipv4
		ipAddress = normalizeIPAddress(ipAddress, IPv4NormalizeMode.ToIPv4);
		// add ip to list for the user
		let ips = this._emailsToWhitelistedIPs[userEmail];
		if(ips) {
			ips.add(ipAddress);
		} else {
			ips = new Set([ipAddress]);
			this._emailsToWhitelistedIPs[userEmail] = ips;
		}
		this._pendingUnsavedChanges = true;
	}
}
