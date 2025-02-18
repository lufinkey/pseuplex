
export type LoadableListItemNode<ItemType,TokenType> = {
	id: string;
	token: TokenType;
	item: ItemType;
};

export type LoadableListFetchedChunk<ItemType,ItemTokenType,PageTokenType> = {
	items: LoadableListItemNode<ItemType,ItemTokenType>[];
	nextPageToken: PageTokenType | null;
};

export type LoadableListChunk<ItemType,ItemTokenType> = {
	items: LoadableListItemNode<ItemType,ItemTokenType>[];
	hasMore: boolean;
	totalItemCount: number;
};

export type LoadableListChunkLoader<ItemType,ItemTokenType,PageTokenType> = (pageToken: PageTokenType | null) => Promise<LoadableListFetchedChunk<ItemType,ItemTokenType,PageTokenType>>;
export type LoadableListItemTokenComparer<TokenType> = (token1: TokenType, token2: TokenType) => number;


const checkAndAdjustChunkForFragmentConnection = <ItemType,ItemTokenType,PageTokenType>(
	chunk: LoadableListFetchedChunk<ItemType,ItemTokenType,PageTokenType>,
	nextFragmentStartToken: ItemTokenType,
	tokenComparer: LoadableListItemTokenComparer<ItemTokenType>
) => {
	// find first index where the token comes after or matches the next fragment start token
	const mergeIndex = chunk.items.findIndex((itemNode) => (tokenComparer(itemNode.token, nextFragmentStartToken) >= 0));
	if(mergeIndex != -1) {
		chunk.items = chunk.items.slice(0, mergeIndex);
		chunk.nextPageToken = null;
		return true;
	} else if(!chunk.nextPageToken) {
		// merge anyways if this is the last chunk
		return true;
	}
	return false;
};


export type GetLoadableListItemsOptions = {
	unique: boolean;
	loadAheadCount?: number;
};

export type LoadableListFragmentOptions<ItemType,ItemTokenType,PageTokenType> = {
	loader: LoadableListChunkLoader<ItemType,ItemTokenType,PageTokenType>;
	tokenComparer: LoadableListItemTokenComparer<ItemTokenType>;
};

export class LoadableListFragment<ItemType,ItemTokenType,PageTokenType> {
	_options: LoadableListFragmentOptions<ItemType,ItemTokenType,PageTokenType>;

	_contents: LoadableListFetchedChunk<ItemType,ItemTokenType,PageTokenType>;
	_nextChunkTask: Promise<LoadableListFetchedChunk<ItemType,ItemTokenType,PageTokenType>> | null = null;

	_uniqueItemIds: string[];
	_itemIdsMap: {[id: string]: number};

	// when loading from the beginning of the list again, the previous list will become a detached fragment if the new list start chunk doesn't fully connect to the beginning of the previous list
	_nextFragment: LoadableListFragment<ItemType,ItemTokenType,PageTokenType> | null;
	_nextFragmentConnected: boolean;

	constructor(chunk: LoadableListFetchedChunk<ItemType,ItemTokenType,PageTokenType>, options: LoadableListFragmentOptions<ItemType,ItemTokenType,PageTokenType>, nextFragment: LoadableListFragment<ItemType,ItemTokenType,PageTokenType> | null) {
		this._options = options;
		// ignore empty fragments
		while(nextFragment != null && nextFragment._contents.items.length == 0 && !nextFragment.isLoading) {
			nextFragment = nextFragment._nextFragment;
		}
		// merge next fragment if needed
		if(nextFragment != null && (nextFragment._contents.items.length > 0 || nextFragment.isLoading || nextFragment.hasMoreItems)) {
			const connected = checkAndAdjustChunkForFragmentConnection(chunk, nextFragment.startItemToken, options.tokenComparer);
			this._nextFragmentConnected = connected;
			this._nextFragment = nextFragment;
		} else {
			this._nextFragment = null;
			this._nextFragmentConnected = false;
		}
		this._contents = chunk;
		this._uniqueItemIds = [];
		this._itemIdsMap = {};
		this._appendUniqueItems(chunk, 0);
	}

	static async create<ItemType,ItemTokenType,PageTokenType>(options: LoadableListFragmentOptions<ItemType,ItemTokenType,PageTokenType>, nextFragment: LoadableListFragment<ItemType,ItemTokenType,PageTokenType> | null): Promise<LoadableListFragment<ItemType,ItemTokenType,PageTokenType>> {
		const chunk = await options.loader(null);
		if(nextFragment != null) {
			if(chunk.items.length == 0) {
				return nextFragment;
			}
			// if both fragments start at the same item, ignore the new chunk and just return the old fragment
			const startToken = nextFragment.startItemToken;
			if(startToken != null && startToken == chunk.items[0]?.token) {
				if(chunk.items.length <= nextFragment.itemCount) { // in the future, we'll want to merge differences
					return nextFragment;
				}
			}
		}
		return new LoadableListFragment<ItemType,ItemTokenType,PageTokenType>(chunk, options, nextFragment);
	}

	_appendUniqueItems(chunk: LoadableListFetchedChunk<ItemType,ItemTokenType,PageTokenType>, startIndex: number) {
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
		return (this._nextFragment != null && this._nextFragmentConnected) ?
			(this._nextFragment._contents.items.length > 0 || this._nextFragment.hasMoreItems)
			: (this._contents.nextPageToken != null);
	}

	get hasMoreUniqueItems(): boolean {
		return (this._nextFragment != null && this._nextFragmentConnected) ?
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

	combineFragmentsIfAble() {
		// cannot combine fragments while loading
		if(this.isLoading) {
			return;
		}
		// merge fragments
		while(this._nextFragment != null && this._nextFragmentConnected && !this._nextFragment.isLoading) {
			const nextFragment = this._nextFragment;
			const nextChunk = nextFragment._contents;
			const prevCount = this._contents.items.length;
			this._contents.items = this._contents.items.concat(nextChunk.items);
			this._contents.nextPageToken = nextChunk.nextPageToken;
			// add unique items
			for(const itemId of nextFragment._uniqueItemIds) {
				if(!(itemId in this._itemIdsMap)) {
					this._uniqueItemIds.push(itemId);
					this._itemIdsMap[itemId] = prevCount + nextFragment._itemIdsMap[itemId];
				}
			}
			this._nextFragment = nextFragment._nextFragment;
			this._nextFragmentConnected = nextFragment._nextFragmentConnected;
		}
	}
	
	findItemTokenPoint(token: ItemTokenType): {
		fragment: LoadableListFragment<ItemType,ItemTokenType,PageTokenType>,
		index: number,
		uniqueIndex: number,
		isUniqueItem: boolean
	} | null {
		let uniqueIndex = 0;
		let index = 0;
		const tokenComparer = this._options.tokenComparer;
		for(const itemNode of this._contents.items) {
			const uniqueId = this._uniqueItemIds[uniqueIndex];
			const isUniqueItem = (itemNode.id === uniqueId);
			// if the item node comes after or matches the token, then we've found the index of the token
			if(tokenComparer(itemNode.token, token) >= 0) {
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
		let itemsCount = items.length;
		const slicedItems = (offset < items.length) ?
				items.slice(offset, offset+maxCount)
				: null;
		let hasMore: boolean;
		if(endOffset > itemsCount) {
			if(this._nextFragment != null && this._nextFragmentConnected) {
				const nextChunk = this._nextFragment.getItems((offset - itemsCount), (endOffset - itemsCount));
				if(slicedItems == null) {
					return nextChunk;
				}
				return {
					items: slicedItems.concat(nextChunk.items),
					hasMore: nextChunk.hasMore,
					totalItemCount: (itemsCount + nextChunk.totalItemCount)
				};
			}
			hasMore = this._contents.nextPageToken != null;
			if(hasMore) {
				itemsCount++;
			}
		} else if(endOffset < items.length) {
			hasMore = true;
		} else { // endOffset == items.length
			hasMore = this.hasMoreItems;
			if(hasMore) {
				itemsCount++;
			}
		}
		return {
			items: slicedItems ?? [],
			hasMore: hasMore,
			totalItemCount: itemsCount
		};
	}

	getUniqueItems(offset: number, maxCount: number): LoadableListChunk<ItemType,ItemTokenType> {
		const endOffset = offset + maxCount;
		let itemsCount = this._uniqueItemIds.length;
		const slicedItems = (offset < itemsCount ? 
			this._uniqueItemIds.slice(offset, offset+maxCount).map((id) => {
				const index = this._itemIdsMap[id];
				return this._contents.items[index];
			})
			: null);
		let hasMore: boolean;
		if(endOffset > itemsCount) {
			if(this._nextFragment != null && this._nextFragmentConnected) {
				const nextChunk = this._nextFragment.getUniqueItems((offset - itemsCount), (endOffset - itemsCount));
				if(slicedItems == null) {
					return nextChunk;
				}
				return {
					items: slicedItems.concat(nextChunk.items),
					hasMore: nextChunk.hasMore,
					totalItemCount: (itemsCount + nextChunk.totalItemCount)
				};
			}
			hasMore = this._contents.nextPageToken != null;
			if(hasMore) {
				itemsCount++;
			}
		} else if(endOffset < itemsCount) {
			hasMore = true;
		} else { // endOffset == items.length
			hasMore = this.hasMoreUniqueItems;
			if(hasMore) {
				itemsCount++;
			}
		}
		return {
			items: slicedItems ?? [],
			hasMore: hasMore,
			totalItemCount: itemsCount,
		};
	}

	async getOrFetchItems(offset: number, count: number, options: GetLoadableListItemsOptions): Promise<LoadableListChunk<ItemType,ItemTokenType>> {
		// get items and ensure offset is valid
		const contentsItems = this._contents.items;
		let itemsCount = options.unique ? this._uniqueItemIds.length : this._contents.items.length;
		if(offset < 0) {
			throw new Error(`Invalid offset ${offset}`);
		}
		const endOffset = offset + count;
		const loadAheadCount = (options.loadAheadCount ?? 0);
		const loadEndOffset = endOffset + loadAheadCount;
		// load the next chunk if needed
		while(loadEndOffset > itemsCount
			&& (this._nextFragment == null || !this._nextFragmentConnected)
			&& this._contents.nextPageToken != null) {
			if(this._nextChunkTask == null) {
				// load the next chunk
				this._nextChunkTask = this._options.loader(this._contents.nextPageToken);
				let nextChunk: LoadableListFetchedChunk<ItemType,ItemTokenType,PageTokenType>;
				try {
					nextChunk = await this._nextChunkTask;
					// check if chunk has merged with the next fragment
					if(this._nextFragment != null) {
						const connected = checkAndAdjustChunkForFragmentConnection(nextChunk, this._nextFragment.startItemToken, this._options.tokenComparer);
						if(connected) {
							this._nextFragmentConnected = true;
						}
					}
					// append chunk
					const prevEndIndex = contentsItems.length;
					contentsItems.push(...nextChunk.items);
					this._contents.nextPageToken = nextChunk.nextPageToken;
					this._appendUniqueItems(nextChunk, prevEndIndex);
				} finally {
					this._nextChunkTask = null;
				}
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
		if(loadEndOffset > itemsCount) {
			if(this._nextFragment != null && this._nextFragmentConnected) {
				let nextChunkOptions = options;
				let remainingItemCount = (endOffset - itemsCount);
				if(remainingItemCount < 0) {
					nextChunkOptions = {
						...nextChunkOptions,
						loadAheadCount: (loadAheadCount + remainingItemCount)
					};
					remainingItemCount = 0;
				}
				let nextChunkOffset = (offset - itemsCount);
				if(nextChunkOffset < 0) {
					nextChunkOffset = 0;
				}
				const nextChunk = await this._nextFragment.getOrFetchItems(nextChunkOffset, remainingItemCount, nextChunkOptions);
				if(slicedItems == null) {
					return nextChunk;
				}
				return {
					items: slicedItems.concat(nextChunk.items),
					hasMore: nextChunk.hasMore,
					totalItemCount: (itemsCount + nextChunk.totalItemCount)
				};
			}
			hasMore = this._contents.nextPageToken != null;
			if(hasMore) {
				itemsCount++;
			}
		} else if(endOffset < itemsCount) {
			hasMore = true;
		} else { // endOffset == items.length
			hasMore = options.unique ?
				this.hasMoreUniqueItems
				: this.hasMoreItems;
			if(hasMore) {
				itemsCount++;
			}
		}
		return {
			items: slicedItems ?? [],
			hasMore: hasMore,
			totalItemCount: itemsCount
		};
	}
}
