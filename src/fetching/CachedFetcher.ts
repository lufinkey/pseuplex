
export type Fetcher<ItemType> = (id: string | number) => Promise<ItemType>;

export type CacheItemNode<ItemType> = {
	item: ItemType;
	updatedAt: number;
	accessedAt: number;
};

export class CachedFetcher<ItemType> {
	_fetcher: Fetcher<ItemType>;
	_cache: {[key: string | number]: CacheItemNode<ItemType> | Promise<ItemType>} = {};

	constructor(fetcher: Fetcher<ItemType>) {
		this._fetcher = fetcher;
	}

	async getOrFetch(id: string | number): Promise<ItemType> {
		let itemNode = this._cache[id];
		if(itemNode == null) {
			const itemTask = this._fetcher(id);
			this._cache[id] = itemTask;
			try {
				const item = await itemTask;
				const now = process.uptime();
				this._cache[id] = {
					item: item,
					updatedAt: now,
					accessedAt: now
				};
				return item;
			} catch(error) {
				delete this._cache[id];
				throw error;
			}
		}
		if(itemNode instanceof Promise) {
			return await itemNode;
		}
		itemNode.accessedAt = process.uptime();
		return itemNode.item;
	}

	get(id: string | number): (ItemType | Promise<ItemType> | undefined) {
		const itemNode = this._cache[id];
		if(itemNode) {
			if(itemNode instanceof Promise) {
				return itemNode;
			} else {
				return itemNode.item;
			}
		}
		return undefined;
	}

	async set(id: string | number, value: ItemType | Promise<ItemType>): Promise<ItemType> {
		if(value instanceof Promise) {
			this._cache[id] = value;
			try {
				value = await value;
			} catch(error) {
				delete this._cache[id];
				throw error;
			}
		}
		const now = process.uptime();
		this._cache[id] = {
			item: value,
			updatedAt: now,
			accessedAt: now
		};
		return value;
	}

	setSync(id: string | number, value: ItemType | Promise<ItemType>) {
		let caughtError: Error = undefined;
		this.set(id, value).catch((error) => {
			caughtError = error;
		});
		if(caughtError && !(value instanceof Promise)) {
			throw caughtError;
		}
	}
}
