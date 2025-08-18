import fs from 'fs';
import { IPv4NormalizeMode, normalizeIPAddress } from '../../utils/ip';

export type PasswordLockAuthCacheData = {
	tokensToWhitelistedIPs: {
		[plexToken: string]: string[]
	}
};

export type TokensToIPsMap = {
	[plexToken: string]: Set<string>;
};

export class PasswordLockAuthenticationCache {
	readonly filePath: string | null;
	private _tokensToWhitelistedIPs: TokensToIPsMap = {};
	private _fileTaskPromise: Promise<void> | null = null;
	private _loadPromise: Promise<boolean> | null = null;
	private _nextSavePromise: Promise<boolean> | null = null;

	constructor(filePath: string | null | undefined) {
		this.filePath = filePath ?? null;
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
				if(cacheObj.tokensToWhitelistedIPs) {
					const tokensToIPs: TokensToIPsMap = {};
					for(const plexToken of Object.keys(cacheObj.tokensToWhitelistedIPs)) {
						const ipList = cacheObj.tokensToWhitelistedIPs[plexToken];
						if(!(ipList instanceof Array)) {
							continue;
						}
						tokensToIPs[plexToken] = new Set(ipList);
					}
					this._tokensToWhitelistedIPs = tokensToIPs;
				}
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
		let done = false;
		const nextSavePromise = this._doFileTask(async () => {
			this._nextSavePromise = null;
			done = true;
			const tokensToIPs: {[plexToken: string]: string[]} = {};
			for(const plexToken of Object.keys(this._tokensToWhitelistedIPs)) {
				const ips = this._tokensToWhitelistedIPs[plexToken];
				tokensToIPs[plexToken] = Array.from(ips);
			}
			const cacheData = JSON.stringify({
				tokensToWhitelistedIPs: tokensToIPs,
			} satisfies PasswordLockAuthCacheData);
			await fs.promises.writeFile(this.filePath!, cacheData);
			return true;
		});
		if(!done) {
			this._nextSavePromise = nextSavePromise;
		}
		return await nextSavePromise;
	}

	isIPWhitelistedForToken(plexToken: string, ipAddress: string): boolean {
		// ipv4 addresses are stored as ipv4
		ipAddress = normalizeIPAddress(ipAddress, IPv4NormalizeMode.ToIPv4);
		// get ip set for the token
		const ips = this._tokensToWhitelistedIPs[plexToken];
		if(!ips) {
			return false;
		}
		return ips.has(ipAddress);
	}

	whitelistIPForPlexToken(plexToken: string, ipAddress: string) {
		// ensure ipv4 addresses are stored as ipv4
		ipAddress = normalizeIPAddress(ipAddress, IPv4NormalizeMode.ToIPv4);
		// add ip to list for the token
		let ips = this._tokensToWhitelistedIPs[plexToken];
		if(ips) {
			ips.add(ipAddress);
		} else {
			ips = new Set([ipAddress]);
			this._tokensToWhitelistedIPs[plexToken] = ips;
		}
	}
}
