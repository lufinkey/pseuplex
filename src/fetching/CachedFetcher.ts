
export type Fetcher<ItemType> = (id: string | number) => Promise<ItemType>;

export class CachedFetcher<ItemType> {
	_fetcher: Fetcher<ItemType>;
	_cache: {[key: string | number]: { item: ItemType, fetchTime: number } | Promise<ItemType>} = {};

	constructor(fetcher: Fetcher<ItemType>) {
		this._fetcher = fetcher;
	}

	async fetch(id: string | number): Promise<ItemType> {
		let val = this._cache[id];
		if(val == null) {
			const itemTask = this._fetcher(id);
			this._cache[id] = itemTask;
			try {
				const item = await itemTask;
				this._cache[id] = {
					item: item,
					fetchTime: process.uptime()
				};
				return item;
			} catch(error) {
				delete this._cache[id];
				throw error;
			}
		}
		if(val instanceof Promise) {
			return await val;
		}
		return val.item;
	}
}
