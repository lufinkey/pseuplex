
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

	async fetch(id: string | number): Promise<ItemType> {
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

	
}
