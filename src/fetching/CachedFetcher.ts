
export type Fetcher<ItemType> = (id: string | number) => Promise<ItemType>;

export type CacheItemNode<ItemType> = {
	item: ItemType;
	updatedAt: number;
	accessedAt: number;
};

export type CachedFetcherOptions = {
	/// How long an item can exist in the cache, in seconds
	itemLifetime?: number | null;
	/// Controls whether accessing an item resets its lifetime
	accessResetsLifetime?: boolean;
	/// Determines the maximum number of items that can be cleaned from the cache in one synchronous go (if limit is reached, timer will be rescheduled)
	autoCleanLimit?: number;
};

type CachedFetcherCache<ItemType> = {
	[key: string | number]: CacheItemNode<ItemType> | Promise<ItemType>
};

export class CachedFetcher<ItemType> {
	options: CachedFetcherOptions;
	private _fetcher: Fetcher<ItemType>;
	private _cache: CachedFetcherCache<ItemType> = {};
	private _autoclean: boolean;
	private _cleanTimer?: NodeJS.Timeout | null;

	constructor(fetcher: Fetcher<ItemType>, options?: CachedFetcherOptions) {
		this.options = options || {};
		this._fetcher = fetcher;
	}

	private _itemNodeAccessed(id: string | number, itemNode: CacheItemNode<ItemType>) {
		if(this.options.itemLifetime && this.options.accessResetsLifetime) {
			// move this item to the end, since it was just accessed
			delete this._cache[id];
			this._cache[id] = itemNode;
		}
		itemNode.accessedAt = process.uptime();
	}

	async fetch(id: string | number): Promise<ItemType> {
		const itemTask = this._fetcher(id);
		this._cache[id] = itemTask;
		try {
			const item = await itemTask;
			if(item === undefined) {
				// if the fetcher returns undefined, this means it shouldn't get cached
				delete this._cache[id];
				return item;
			}
			const now = process.uptime();
			delete this._cache[id]; // ensure new ID is added to the end
			this._cache[id] = {
				item: item,
				updatedAt: now,
				accessedAt: now
			};
			if(this._autoclean) {
				this._scheduleAutoCleanIfUnscheduled();
			}
			return item;
		} catch(error) {
			delete this._cache[id];
			throw error;
		}
	}

	async getOrFetch(id: string | number): Promise<ItemType> {
		let itemNode = this._cache[id];
		if(itemNode == null) {
			return await this.fetch(id);
		}
		if(itemNode instanceof Promise) {
			return await itemNode;
		}
		this._itemNodeAccessed(id, itemNode);
		return itemNode.item;
	}

	get(id: string | number, access: boolean = true): (ItemType | Promise<ItemType | undefined> | undefined) {
		const itemNode = this._cache[id];
		if(itemNode) {
			if(itemNode instanceof Promise) {
				return itemNode;
			} else {
				if(access) {
					this._itemNodeAccessed(id, itemNode);
				}
				return itemNode.item;
			}
		}
		return undefined;
	}

	async set(id: string | number, value: ItemType | Promise<ItemType>): Promise<ItemType | undefined> {
		let result: ItemType | undefined;
		if(value instanceof Promise) {
			this._cache[id] = value;
			try {
				result = await value;
			} catch(error) {
				delete this._cache[id];
				throw error;
			}
		} else {
			result = value;
		}
		if(result === undefined) {
			delete this._cache[id];
			return result;
		}
		const now = process.uptime();
		delete this._cache[id]; // ensure new ID is added to the end
		this._cache[id] = {
			item: result,
			updatedAt: now,
			accessedAt: now
		};
		return result;
	}

	setSync(id: string | number, value: ItemType | Promise<ItemType>, logError?: boolean) {
		let caughtError: Error | undefined = undefined;
		this.set(id, value).catch((error) => {
			caughtError = error;
			if(logError) {
				console.error(error);
			}
		});
	}

	/// Cleans any expired entries, and returns the amount of time to wait until the next cleaning
	cleanExpiredEntries(opts?: {limit?: number}): (number | null) {
		const { itemLifetime, accessResetsLifetime } = this.options;
		if(!itemLifetime) {
			// items have no lifetime
			return null;
		}
		let count = 0;
		const now = process.uptime();
		for(const id of Object.keys(this._cache)) {
			const itemNode = this._cache[id];
			if(itemNode && !(itemNode instanceof Promise)) {
				// get elapsed time
				let elapsedTime;
				if(accessResetsLifetime) {
					elapsedTime = now - itemNode.accessedAt;
				} else {
					elapsedTime = now - itemNode.updatedAt;
				}
				// return next expiration if done
				const remainingTime = itemLifetime - elapsedTime;
				if(opts?.limit && count >= opts.limit) {
					return remainingTime;
				}
				// check if item is expired
				if(remainingTime <= 0) {
					// item has expired, so delete it from the cache
					delete this._cache[id];
				} else {
					// item is not expired, so we can stop here, since all items after will be newer
					return remainingTime;
				}
			}
			count++;
		}
		return null;
	}

	private _doAutoClean() {
		// clean and check how long until next clean
		const timeUntilNextClean = this.cleanExpiredEntries({
			limit: this.options.autoCleanLimit
		});
		if(timeUntilNextClean == null) {
			// no need to schedule right now
			return;
		}
		// schedule next clean
		if(this._autoclean) {
			this._cleanTimer = setTimeout(() => {
				this._cleanTimer = null;
				this._doAutoClean();
			}, Math.max(0, timeUntilNextClean * 1000));
		}
	}

	private _scheduleAutoCleanIfUnscheduled() {
		if(!this._cleanTimer) {
			const { itemLifetime } = this.options;
			if(itemLifetime) {
				this._cleanTimer = setTimeout(() => {
					this._cleanTimer = null;
					this._doAutoClean();
				}, itemLifetime * 1000);
			}
		}
	}

	startAutoClean() {
		if(this._autoclean) {
			// already started
			return;
		}
		this._autoclean = true;
		this._doAutoClean();
	}

	stopAutoClean() {
		if(!this._autoclean) {
			// already stopped
			return;
		}
		if(this._cleanTimer) {
			clearTimeout(this._cleanTimer);
			this._cleanTimer = null;
		}
		this._autoclean = false;
	}
}
