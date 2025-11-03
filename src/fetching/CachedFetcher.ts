import { OutRef, Ref, setRefIfNone } from '../utils/ref';

export type Fetcher<ItemType> = (id: string | number) => Promise<ItemType>;

export type CacheItemNode<ItemType> = {
	item: ItemType;
	updatedAt: number;
	accessedAt: number;
};

export type CachedFetcherOptions = {
	/// How long an item can exist in the cache, in seconds
	itemLifetime?: number | null;
	// How long a null item can exist in the cache, in seconds
	nullItemLifetime?: number | null;
	/// Controls whether accessing an item resets its lifetime
	accessResetsLifetime?: boolean;
	/// Determines the maximum number of items that can be cleaned from the cache in one synchronous go (if limit is reached, timer will be rescheduled)
	autoCleanLimit?: number;
};

type CachedFetcherCache<ItemType> = {
	[key: string | number]: CacheItemNode<ItemType> | Promise<ItemType>
};

type CacheID = string | number;

export class CachedFetcher<TItem> {
	options: CachedFetcherOptions;
	private _fetcher: Fetcher<TItem>;
	private _cache: CachedFetcherCache<TItem> = {};
	private _autoclean: boolean;
	private _cleanTimer?: NodeJS.Timeout | null;
	private _nullEntries: Set<string> = new Set();

	constructor(fetcher: Fetcher<TItem>, options?: CachedFetcherOptions) {
		this.options = options || {};
		this._fetcher = fetcher;
	}

	private _put(id: CacheID, itemNode: CacheItemNode<TItem>) {
		this.delete(id); // ensure new ID is added to the end
		this._cache[id] = itemNode;
		if(itemNode.item == null) {
			this._nullEntries.add(id.toString());
		}
	}

	private _itemNodeAccessed(id: CacheID, itemNode: CacheItemNode<TItem>, nowRef?: OutRef<number>) {
		if(this.options.accessResetsLifetime && (this.options.itemLifetime != null || this.options.nullItemLifetime != null)) {
			// move this item to the end, since it was just accessed
			this._put(id, itemNode);
		}
		nowRef = setRefIfNone(nowRef, () => process.uptime());
		itemNode.accessedAt = nowRef.val!;
	}

	async fetch(id: string | number): Promise<TItem> {
		let itemTask: Promise<TItem>;
		try {
			itemTask = this._fetcher(id);
		} catch(error) {
			this.delete(id);
			throw error;
		}
		return await this.set(id, itemTask);
	}

	delete(id: string | number) {
		delete this._cache[id];
		this._nullEntries.delete(id.toString());
	}

	private _expireItemIfNeeded(id: string | number, itemNode: CacheItemNode<TItem>, now?: OutRef<number>, elapsedTimeRef?: OutRef<number>): boolean {
		const { nullItemLifetime, itemLifetime, accessResetsLifetime } = this.options;
		const lifetimeForItem = itemNode.item == null ? (nullItemLifetime ?? itemLifetime) : itemLifetime;
		if(lifetimeForItem != null) {
			now = setRefIfNone(now, () => process.uptime());
			elapsedTimeRef ??= {};
			if(accessResetsLifetime) {
				elapsedTimeRef.val = now.val! - itemNode.accessedAt;
			} else {
				elapsedTimeRef.val = now.val! - itemNode.updatedAt;
			}
			if(elapsedTimeRef.val! >= lifetimeForItem) {
				// item is expired, so remove
				this.delete(id);
				return true;
			}
		}
		return false;
	}

	async getOrFetch(id: string | number): Promise<TItem> {
		let itemNode = this._cache[id];
		if(itemNode == null) {
			return await this.fetch(id);
		}
		if(itemNode instanceof Promise) {
			return await itemNode;
		}
		let nowRef: OutRef<number> = {};
		// check if the item is expired
		if(this._expireItemIfNeeded(id, itemNode, nowRef)) {
			return await this.fetch(id);
		}
		// mark item as accessed
		this._itemNodeAccessed(id, itemNode, nowRef);
		return itemNode.item;
	}

	get(id: string | number, access: boolean = true): (TItem | Promise<TItem | undefined> | undefined) {
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

	async set(id: string | number, value: TItem | Promise<TItem>): Promise<TItem> {
		let result: TItem | undefined;
		if(value instanceof Promise) {
			this._cache[id] = value;
			try {
				result = await value;
			} catch(error) {
				this.delete(id);
				throw error;
			}
		} else {
			result = value;
		}
		if(result === undefined) {
			// if the fetcher returns undefined, this means it shouldn't get cached
			this.delete(id);
			return result;
		}
		const now = process.uptime();
		this._put(id, {
			item: result,
			updatedAt: now,
			accessedAt: now
		});
		if(this._autoclean) {
			this._scheduleAutoCleanIfUnscheduled();
		}
		return result;
	}

	setSync(id: string | number, value: TItem | Promise<TItem>, logError?: boolean) {
		let caughtError: Error | undefined = undefined;
		logError ??= !(value instanceof Promise);
		this.set(id, value).catch((error) => {
			caughtError = error;
			if(logError) {
				console.error(error);
			}
		});
	}

	private get minItemLifetime(): (number | null) {
		const { itemLifetime, nullItemLifetime } = this.options;
		let minItemLifetime: number = itemLifetime!;
		if(minItemLifetime == null || (nullItemLifetime != null && nullItemLifetime < minItemLifetime)) {
			minItemLifetime = nullItemLifetime!;
		}
		return minItemLifetime;
	}

	/// Cleans any expired entries, and returns the amount of time to wait until the next cleaning
	cleanExpiredEntries(opts?: {limit?: number}): (number | null) {
		const { itemLifetime, nullItemLifetime } = this.options;
		let nowRef: OutRef<number> = {};
		let count = 0;
		// clean null entries
		if(nullItemLifetime != null) {
			for(const id of this._nullEntries) {
				const itemNode = this._cache[id];
				if(itemNode && !(itemNode instanceof Promise)) {
					const elapsedTimeRef: OutRef<number> = {};
					if(this._expireItemIfNeeded(id, itemNode, nowRef, elapsedTimeRef)) {
						// expired
					}
				}
				count++;
				// check if we should stop here
				if(opts?.limit && count >= opts.limit) {
					// return seconds until we should clean again
					return 0;
				}
			}
		}
		// clean old entries
		if(itemLifetime == null) {
			// items have no lifetime
			return null;
		}
		for(const id of Object.keys(this._cache)) {
			const itemNode = this._cache[id];
			if(itemNode && !(itemNode instanceof Promise)) {
				const elapsedTimeRef: OutRef<number> = {};
				if(this._expireItemIfNeeded(id, itemNode, nowRef, elapsedTimeRef)) {
					// expired
				} else {
					// item is not expired, so check if we can stop here, since all items after will be newer
					const remainingTime = (itemLifetime - elapsedTimeRef.val!);
					if(remainingTime > 0) {
						// item would not be expired with regular item lifetime, so stop here
						// return seconds until we should clean again
						return remainingTime;
					}
				}
			}
			count++;
			// check if we should stop here
			if(opts?.limit && count >= opts.limit) {
				// return seconds until we should clean again
				return 0;
			}
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
