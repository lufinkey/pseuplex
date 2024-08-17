
export type LoadableListItemNode<ItemType,TokenType> = {
	id: string;
	token: TokenType;
	item: ItemType;
};

export type LoadableListLoaderChunk<ItemType,ItemTokenType,PageTokenType> = {
	items: LoadableListItemNode<ItemType,ItemTokenType>[];
	nextPageToken: PageTokenType | null;
};

export type LoadableListChunk<ItemType,ItemTokenType> = {
	items: LoadableListItemNode<ItemType,ItemTokenType>[];
	hasMore: boolean;
};

export type LoadableListChunkLoader<ItemType,ItemTokenType,PageTokenType> = (nextPageToken: PageTokenType | null) => Promise<LoadableListLoaderChunk<ItemType,ItemTokenType,PageTokenType>>;
export type TokenComparer<TokenType> = (token1: TokenType, token2: TokenType) => number;


const checkAndAdjustChunkForFragmentMerge = <ItemType,ItemTokenType,PageTokenType>(chunk: LoadableListLoaderChunk<ItemType,ItemTokenType,PageTokenType>, nextFragmentStartToken: ItemTokenType, tokenComparer: TokenComparer<ItemTokenType>) => {
	const mergeIndex = chunk.items.findIndex((itemNode) => (tokenComparer(itemNode.token, nextFragmentStartToken) >= 0));
	if(mergeIndex != -1) {
		chunk.items = chunk.items.slice(0, mergeIndex);
		chunk.nextPageToken = null;
		return true;
	}
	return false;
};


export type GetItemsOptions = {
	unique: boolean;
};

export type LoadableListFragmentOptions<ItemType,ItemTokenType,PageTokenType> = {
	loader: LoadableListChunkLoader<ItemType,ItemTokenType,PageTokenType>;
	tokenComparer: TokenComparer<ItemTokenType>;
};

class LoadableListFragment<ItemType,ItemTokenType,PageTokenType> {
	_options: LoadableListFragmentOptions<ItemType,ItemTokenType,PageTokenType>;

	_contents: LoadableListLoaderChunk<ItemType,ItemTokenType,PageTokenType>;
	_nextChunkTask: Promise<LoadableListLoaderChunk<ItemType,ItemTokenType,PageTokenType>> | null = null;

	_uniqueItemIds: string[];
	_itemIdsMap: {[id: string]: number};

	// when loading from the beginning of the list again, the previous list will become a detached fragment if the new list start chunk doesn't fully connect to the beginning of the previous list
	_nextFragment: LoadableListFragment<ItemType,ItemTokenType,PageTokenType> | null;
	_nextFragmentMerged: boolean;

	constructor(chunk: LoadableListLoaderChunk<ItemType,ItemTokenType,PageTokenType>, options: LoadableListFragmentOptions<ItemType,ItemTokenType,PageTokenType>, nextFragment: LoadableListFragment<ItemType,ItemTokenType,PageTokenType> | null) {
		this._options = options;
		if(nextFragment != null) {
			const merged = checkAndAdjustChunkForFragmentMerge(chunk, nextFragment.startItemToken, options.tokenComparer);
			this._nextFragmentMerged = merged;
			this._nextFragment = nextFragment;
		} else {
			this._nextFragment = null;
			this._nextFragmentMerged = false;
		}
		this._contents = chunk;
		this._uniqueItemIds = [];
		this._itemIdsMap = {};
		this._appendUniqueItems(chunk, 0);
	}

	static async create<ItemType,ItemTokenType,PageTokenType>(options: LoadableListFragmentOptions<ItemType,ItemTokenType,PageTokenType>, nextFragment: LoadableListFragment<ItemType,ItemTokenType,PageTokenType> | null): Promise<LoadableListFragment<ItemType,ItemTokenType,PageTokenType>> {
		const chunk = await options.loader(null);
		if(chunk.items.length == 0 && nextFragment != null) {
			return nextFragment;
		}
		return new LoadableListFragment<ItemType,ItemTokenType,PageTokenType>(chunk, options, nextFragment);
	}

	_appendUniqueItems(chunk: LoadableListLoaderChunk<ItemType,ItemTokenType,PageTokenType>, startIndex: number) {
		let index = startIndex;
		for(const itemNode of chunk.items) {
			if(!(itemNode.id in this._itemIdsMap)) {
				this._itemIdsMap[itemNode.id] = index;
				this._uniqueItemIds.push(itemNode.id);
			}
			index++;
		}
	}

	get isLoading(): boolean {
		return (this._nextChunkTask != null);
	}

	get itemCount(): number {
		return this._contents.items.length;
	}

	get uniqueItemCount(): number {
		return this._uniqueItemIds.length;
	}

	get hasMoreItems(): boolean {
		return (this._nextFragment != null && this._nextFragmentMerged) ?
			(this._nextFragment._contents.items.length > 0 || this._nextFragment.hasMoreItems)
			: (this._contents.nextPageToken != null);
	}

	get hasMoreUniqueItems(): boolean {
		return (this._nextFragment != null && this._nextFragmentMerged) ?
			(this._nextFragment._uniqueItemIds.length > 0 || this._nextFragment.hasMoreUniqueItems)
			: (this._contents.nextPageToken != null);
	}

	get startItemToken(): ItemTokenType | null {
		const items = this._contents.items;
		if(items.length <= 0) {
			return null;
		}
		return items[0].token;
	}

	get lastFragment(): LoadableListFragment<ItemType,ItemTokenType,PageTokenType> {
		if(this._nextFragment != null) {
			return this._nextFragment.lastFragment;
		}
		return this;
	}

	findItemTokenPoint(token: ItemTokenType): {
		fragment: LoadableListFragment<ItemType,ItemTokenType,PageTokenType>,
		index: number,
		uniqueIndex: number,
		isUniqueItem: boolean
	} | null {
		let uniqueIndex = 0;
		let index = 0;
		for(const itemNode of this._contents.items) {
			const uniqueId = this._uniqueItemIds[uniqueIndex];
			const isUniqueItem = (itemNode.id === uniqueId);
			if(this._options.tokenComparer(token, itemNode.token) <= 0) {
				return {
					fragment: this,
					index: index,
					uniqueIndex: uniqueIndex,
					isUniqueItem: isUniqueItem
				};
			}
			if(isUniqueItem) {
				uniqueIndex++;
			}
			index++;
		}
		if(this._nextFragment != null) {
			return this._nextFragment.findItemTokenPoint(token);
		}
		return null;
	}

	getItem(index: number): LoadableListItemNode<ItemType,ItemTokenType> {
		return this._contents.items[index];
	}

	getUniqueItem(index: number): LoadableListItemNode<ItemType,ItemTokenType> {
		const id = this._uniqueItemIds[index];
		const itemIndex = this._itemIdsMap[id];
		return this._contents.items[itemIndex];
	}

	getItems(offset: number, maxCount: number): LoadableListChunk<ItemType,ItemTokenType> {
		const endOffset = offset + maxCount;
		const items = this._contents.items;
		const slicedItems = (offset < items.length) ?
				items.slice(offset, offset+maxCount)
				: null;
		let hasMore: boolean;
		if(endOffset > items.length) {
			if(this._nextFragment != null && this._nextFragmentMerged) {
				const nextChunk = this._nextFragment.getItems((offset - items.length), (endOffset - items.length));
				if(slicedItems == null) {
					return nextChunk;
				}
				return {
					items: slicedItems.concat(nextChunk.items),
					hasMore: nextChunk.hasMore
				};
			}
			hasMore = this._contents.nextPageToken != null;
		} else if(endOffset < items.length) {
			hasMore = true;
		} else { // endOffset == items.length
			hasMore = this.hasMoreItems;
		}
		return {
			items: slicedItems ?? [],
			hasMore: hasMore
		};
	}

	getUniqueItems(offset: number, maxCount: number): LoadableListChunk<ItemType,ItemTokenType> {
		const endOffset = offset + maxCount;
		const uniqueItemsCount = this._uniqueItemIds.length;
		const slicedItems = (offset < uniqueItemsCount ? 
			this._uniqueItemIds.slice(offset, offset+maxCount).map((id) => {
				const index = this._itemIdsMap[id];
				return this._contents.items[index];
			})
			: null);
		let hasMore: boolean;
		if(endOffset > uniqueItemsCount) {
			if(this._nextFragment != null && this._nextFragmentMerged) {
				const nextChunk = this._nextFragment.getUniqueItems((offset - uniqueItemsCount), (endOffset - uniqueItemsCount));
				if(slicedItems == null) {
					return nextChunk;
				}
				return {
					items: slicedItems.concat(nextChunk.items),
					hasMore: nextChunk.hasMore
				};
			}
			hasMore = this._contents.nextPageToken != null;
		} else if(endOffset < uniqueItemsCount) {
			hasMore = true;
		} else { // endOffset == items.length
			hasMore = this.hasMoreUniqueItems;
		}
		return {
			items: slicedItems ?? [],
			hasMore: hasMore
		};
	}

	async getOrFetchItems(offset: number, count: number, options: GetItemsOptions): Promise<LoadableListChunk<ItemType,ItemTokenType>> {
		// get items and ensure offset is valid
		const contentsItems = this._contents.items;
		let itemsCount = options.unique ? this._uniqueItemIds.length : this._contents.items.length;
		if(offset < 0) {
			throw new Error(`Invalid offset ${offset}`);
		}
		const endOffset = offset + count;
		// load the next chunk if needed
		while(endOffset > itemsCount
			&& (this._nextFragment == null || !this._nextFragmentMerged)
			&& this._contents.nextPageToken != null) {
			if(this._nextChunkTask == null) {
				// load the next chunk
				this._nextChunkTask = this._options.loader(this._contents.nextPageToken);
				let nextChunk: LoadableListLoaderChunk<ItemType,ItemTokenType,PageTokenType>;
				try {
					nextChunk = await this._nextChunkTask;
				} finally {
					this._nextChunkTask = null;
				}
				// check if chunk has merged with the next fragment
				if(this._nextFragment != null) {
					const merged = checkAndAdjustChunkForFragmentMerge(nextChunk, this._nextFragment.startItemToken, this._options.tokenComparer);
					if(merged) {
						this._nextFragmentMerged = true;
					}
				}
				const prevEndIndex = contentsItems.length;
				contentsItems.push(...nextChunk.items);
				this._contents.nextPageToken = nextChunk.nextPageToken;
				this._appendUniqueItems(nextChunk, prevEndIndex);
			} else {
				// wait for the next chunk to load
				await this._nextChunkTask;
			}
			itemsCount = options.unique ? this._uniqueItemIds.length : this._contents.items.length;
		}
		// we loaded it all
		const slicedItems = options.unique ?
			(offset < this._uniqueItemIds.length ? 
				this._uniqueItemIds.slice(offset, offset+count).map((id) => {
					const index = this._itemIdsMap[id];
					return this._contents.items[index];
				})
				: null)
			: (offset < contentsItems.length ?
				contentsItems.slice(offset, offset+count)
				: null);
		let hasMore: boolean;
		if(endOffset > itemsCount) {
			if(this._nextFragment != null && this._nextFragmentMerged) {
				const nextChunk = await this._nextFragment.getOrFetchItems((offset - itemsCount), (endOffset - itemsCount), options);
				if(slicedItems == null) {
					return nextChunk;
				}
				return {
					items: slicedItems.concat(nextChunk.items),
					hasMore: nextChunk.hasMore
				};
			}
			hasMore = this._contents.nextPageToken != null;
		} else if(endOffset < itemsCount) {
			hasMore = true;
		} else { // endOffset == items.length
			hasMore = options.unique ?
				this.hasMoreUniqueItems
				: this.hasMoreItems;
		}
		return {
			items: slicedItems ?? [],
			hasMore: hasMore
		};
	}
}


export type LoadableListOptions<ItemType,TokenType,PageTokenType> = {
	loader: LoadableListChunkLoader<ItemType,TokenType,PageTokenType>;
	tokenComparer: TokenComparer<TokenType>;
};

export class LoadableList<ItemType,ItemTokenType,PageTokenType> {
	
	_options: LoadableListOptions<ItemType,ItemTokenType,PageTokenType>;
	_newFragmentTask: Promise<LoadableListFragment<ItemType,ItemTokenType,PageTokenType>> | null = null;
	_fragment: LoadableListFragment<ItemType,ItemTokenType,PageTokenType> | null = null;
	_lastNewFragmentFetchTime: number;

	listStartFetchInterval: number | 'never' = 60 * 5;
	
	constructor(options: LoadableListOptions<ItemType,ItemTokenType,PageTokenType>) {
		this._options = {...options};
	}

	get totalItemCount(): number | null {
		if(this._fragment == null) {
			return null;
		}
		let fragment = this._fragment;
		let count = 0;
		while(fragment != null) {
			if(fragment._contents.nextPageToken != null) {
				return null;
			}
			count += fragment.itemCount;
			fragment = fragment._nextFragment;
		}
		return count;
	}

	get totalUniqueItemCount(): number | null {
		if(this._fragment == null) {
			return null;
		}
		let fragment = this._fragment;
		let count = 0;
		while(fragment != null) {
			if(fragment._contents.nextPageToken != null) {
				return null;
			}
			count += fragment.uniqueItemCount;
			fragment = fragment._nextFragment;
		}
		return count;
	}

	async getOrFetchStartItems(maxCount: number, options: GetItemsOptions): Promise<LoadableListChunk<ItemType,ItemTokenType>> {
		if(this._newFragmentTask == null) {
			// determine if the start fragment needs to be fetched again
			if(this._fragment == null
				|| (typeof this.listStartFetchInterval == 'number' && (process.uptime() - this._lastNewFragmentFetchTime) >= this.listStartFetchInterval)) {
				// fetch the list start fragment
				const newFragmentTask = LoadableListFragment.create({
					loader: this._options.loader,
					tokenComparer: this._options.tokenComparer
				}, this._fragment);
				this._newFragmentTask = newFragmentTask;
				try {
					const newFragment = await newFragmentTask;
					this._fragment = newFragment;
					// TODO combine the fragment with the next fragment
				} finally {
					this._newFragmentTask = null;
				}
			}
		} else {
			// wait for the start fragment to be fetched
			await this._newFragmentTask;
		}
		const startFragment = this._fragment;
		// load atleast 1 item into the list if possible
		await startFragment.getOrFetchItems(0, 1, options);
		// return the items from the start of the list
		return options.unique ?
			startFragment.getUniqueItems(0, maxCount)
			: startFragment.getItems(0, maxCount);
	}
	
	async getOrFetchItems(startToken: ItemTokenType, offset: number, count: number, options: GetItemsOptions): Promise<LoadableListChunk<ItemType,ItemTokenType>> {
		const tokenPoint = this._fragment.findItemTokenPoint(startToken);
		if(tokenPoint == null) {
			console.warn(`Failed to find token ${startToken}`);
			return {
				items: [],
				hasMore: false
			};
		}
		const startIndex = options.unique ? (tokenPoint.uniqueIndex+offset) : (tokenPoint.index+offset);
		return await tokenPoint.fragment.getOrFetchItems(startIndex, count, options);
	}
}
