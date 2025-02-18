
import {
	LoadableListChunk,
	LoadableListChunkLoader,
	LoadableListFragment,
	LoadableListItemTokenComparer,
	GetLoadableListItemsOptions
} from './LoadableListFragment';

export type LoadableListOptions<ItemType,TokenType,PageTokenType> = {
	loader: LoadableListChunkLoader<ItemType,TokenType,PageTokenType>;
	tokenComparer: LoadableListItemTokenComparer<TokenType>;
};

export type ListFetchInterval = number | 'never';

export class LoadableList<ItemType,ItemTokenType,PageTokenType> {
	_options: LoadableListOptions<ItemType,ItemTokenType,PageTokenType>;
	_newFragmentTask: Promise<LoadableListFragment<ItemType,ItemTokenType,PageTokenType>> | null = null;
	_fragment: LoadableListFragment<ItemType,ItemTokenType,PageTokenType> | null = null;
	_lastNewFragmentFetchTime: number;
	_fragmentMergeTimeout: NodeJS.Timeout | null = null;
	
	listStartFetchInterval: ListFetchInterval = 60;
	
	constructor(options: LoadableListOptions<ItemType,ItemTokenType,PageTokenType>) {
		this._options = {...options};
	}
	
	get totalItemCount(): number | null {
		let fragment = this._fragment;
		if(fragment == null) {
			return null;
		}
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
		let fragment = this._fragment;
		if(fragment == null) {
			return null;
		}
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

	get totalLoadedItemCount(): number {
		let fragment = this._fragment;
		if(fragment == null) {
			return 0;
		}
		let count = 0;
		while(fragment != null) {
			count += fragment.itemCount;
			fragment = fragment._nextFragment;
		}
		return count;
	}

	get totalLoadedUniqueItemCount(): number {
		let fragment = this._fragment;
		if(fragment == null) {
			return 0;
		}
		let count = 0;
		while(fragment != null) {
			count += fragment.uniqueItemCount;
			fragment = fragment._nextFragment;
		}
		return count;
	}

	_queueFragmentMerge() {
		if(this._fragmentMergeTimeout != null) {
			// already queued
			return;
		}
		const startFragment = this._fragment;
		if(!startFragment || startFragment._nextFragment == null || startFragment.isLoading || startFragment._nextFragment.isLoading) {
			// don't queue right now
			return;
		}
		this._fragmentMergeTimeout = setTimeout(() => {
			this._fragmentMergeTimeout = null;
			startFragment.combineFragmentsIfAble();
		}, 0);
	}
	
	async getOrFetchStartItems(count: number, options: GetLoadableListItemsOptions): Promise<LoadableListChunk<ItemType,ItemTokenType>> {
		let startFragment: LoadableListFragment<ItemType,ItemTokenType,PageTokenType>;
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
					startFragment = await newFragmentTask;
					this._fragment = startFragment;
					this._lastNewFragmentFetchTime = process.uptime();
				} finally {
					this._newFragmentTask = null;
				}
			} else {
				startFragment = this._fragment;
			}
		} else {
			// wait for the start fragment to be fetched
			startFragment = await this._newFragmentTask;
		}
		// attempt to load atleast 1 item into the list
		const chunk = await startFragment.getOrFetchItems(0, Math.max(1, count), options);
		// merge fragments after a delay
		if(this._fragment?._nextFragment) {
			this._queueFragmentMerge();
		}
		// return the items from the start of the list
		return chunk;
	}
	
	async getOrFetchItems(startToken: ItemTokenType | null, offset: number, count: number, options: GetLoadableListItemsOptions): Promise<LoadableListChunk<ItemType,ItemTokenType>> {
		// get starting fragment if needed
		if(this._fragment == null) {
			await this.getOrFetchStartItems(count, options);
		}
		// find where the start token begins in the list
		const tokenPoint = startToken != null ? this._fragment!.findItemTokenPoint(startToken) : {
			fragment: this._fragment!,
			index: 0,
			uniqueIndex: 0,
			isUniqueItem: true
		};
		if(tokenPoint == null) {
			console.warn(`Failed to find token ${startToken}`);
			return {
				items: [],
				hasMore: false,
				totalItemCount: 0
			};
		}
		// fetch the items
		const startIndex = options.unique ? (tokenPoint.uniqueIndex+offset) : (tokenPoint.index+offset);
		const chunk = await tokenPoint.fragment.getOrFetchItems(startIndex, count, options);
		if(options.unique) {
			chunk.totalItemCount -= tokenPoint.uniqueIndex;
		} else {
			chunk.totalItemCount -= tokenPoint.index;
		}
		// merge fragments after a delay
		if(this._fragment?._nextFragment) {
			this._queueFragmentMerge();
		}
		// done
		return chunk;
	}
}
