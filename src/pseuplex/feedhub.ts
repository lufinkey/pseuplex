
import {
	LoadableFeed
} from '../fetching/LoadableFeed';
import {
	LoadableListFetchedChunk,
	LoadableListChunk
} from '../fetching/LoadableListFragment';
import * as plexTypes from '../plex/types';
import {
	addQueryArgumentToURLPath
} from '../utils';
import {
	PseuplexHub,
	PseuplexHubContext,
	PseuplexHubPage,
	PseuplexHubPageParams
} from './hub';

export type PseuplexFeedHubOptions = {
	title: string;
	type: plexTypes.PlexMediaItemType;
	hubPath: string;
	hubIdentifier: plexTypes.PlexHubIdentifier;
	context: plexTypes.PlexHubContext;
	style: plexTypes.PlexHubStyle;
	promoted?: boolean;
	defaultItemCount: number;
	uniqueItemsOnly: boolean;
};

export abstract class PseuplexFeedHub<
	TItem,
	TItemToken extends (string | number),
	TPageToken,
	TOptions extends PseuplexFeedHubOptions = PseuplexFeedHubOptions
	> extends PseuplexHub {
	_options: TOptions;
	_itemList: LoadableFeed<TItem,TItemToken,TPageToken>;
	
	constructor(options: TOptions) {
		super();
		this._options = options;
		this._itemList = new LoadableFeed<TItem,TItemToken,TPageToken>({
			loader: (pageToken) => {
				return this.fetchPage(pageToken);
			},
			tokenComparer: (itemToken1, itemToken2) => {
				return this.compareItemTokens(itemToken1, itemToken2);
			}
		});
	}
	
	abstract fetchPage(pageToken: TPageToken | null): Promise<LoadableListFetchedChunk<TItem,TItemToken,TPageToken>>;
	abstract compareItemTokens(itemToken1: TItemToken, itemToken2: TItemToken): number;
	abstract transformItem(item: TItem, context: PseuplexHubContext): (plexTypes.PlexMetadataItem | Promise<plexTypes.PlexMetadataItem>);
	
	override async get(params: PseuplexHubPageParams, context: PseuplexHubContext): Promise<PseuplexHubPage> {
		const opts = this._options;
		let chunk: LoadableListChunk<TItem,TItemToken>;
		let start: number;
		let { listStartToken } = params;
		if(listStartToken != null || (params.start != null && params.start > 0)) {
			if(listStartToken != null) {
				listStartToken = Number.parseInt(listStartToken as any);
				listStartToken = !Number.isNaN(listStartToken) ? listStartToken : params.listStartToken;
			}
			start = params.start ?? 0;
			chunk = await this._itemList.getOrFetchItems(listStartToken as any, start, params.count ?? opts.defaultItemCount, {unique:opts.uniqueItemsOnly});
		} else {
			const maxItemCount = params.count ?? opts.defaultItemCount;
			start = 0;
			chunk = await this._itemList.getOrFetchStartItems(maxItemCount, {unique:opts.uniqueItemsOnly});
			listStartToken = chunk.items[0].token;
		}
		let key = opts.hubPath;
		if(listStartToken != null) {
			key = addQueryArgumentToURLPath(opts.hubPath, `listStartToken=${listStartToken}`);
		}
		return {
			hub: {
				key: key,
				title: opts.title,
				type: opts.type,
				hubIdentifier: `${opts.hubIdentifier}${(params.contentDirectoryID != null && !(params.contentDirectoryID instanceof Array)) ? `.${params.contentDirectoryID}` : ''}`,
				context: opts.context,
				style: opts.style,
				promoted: opts.promoted
			},
			items: await Promise.all(chunk.items.map(async (itemNode) => {
				return await this.transformItem(itemNode.item, context);
			})),
			offset: start,
			more: chunk.hasMore,
			totalCount: opts.uniqueItemsOnly ? this._itemList.totalUniqueItemCount : this._itemList.totalItemCount
		};
	}
}
