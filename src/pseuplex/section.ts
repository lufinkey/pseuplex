import express from 'express';
import * as plexTypes from '../plex/types';
import type { PseuplexRequestContext } from './types';
import {
	pseuplexHubPageParamsFromHubListParams,
	type PseuplexHub,
	type PseuplexHubPageParams,
} from './hub';

export interface PseuplexSection {
	readonly id: string | number;
	readonly uuid?: string | undefined;
	readonly type: plexTypes.PlexMediaItemType;
	readonly title: string;
	readonly path: string;
	readonly hubsPath: string;

	getSectionPage(context: PseuplexRequestContext): Promise<plexTypes.PlexLibrarySectionPage>;
	getMediaProviderDirectory(context: PseuplexRequestContext): Promise<plexTypes.PlexContentDirectoryWithPivots>;
	getLibrarySectionsEntry(params: plexTypes.PlexLibrarySectionsPageParams, context: PseuplexRequestContext): Promise<plexTypes.PlexLibrarySection>;
	getPromotedHubsPage(params: plexTypes.PlexHubListPageParams, context: PseuplexRequestContext): Promise<plexTypes.PlexSectionHubsPage>;
	getHubsPage(params: plexTypes.PlexHubListPageParams, context: PseuplexRequestContext): Promise<plexTypes.PlexSectionHubsPage>;
	getAllItemsPage(params: plexTypes.PlexSectionAllItemsParams, context: PseuplexRequestContext): Promise<plexTypes.PlexMetadataPage>;
}

export type PseuplexSectionItemsPage = {
	items: plexTypes.PlexMetadataItem[];
	offset: number;
	more: boolean;
	totalItemCount?: number;
};

export type PseuplexSectionOptions = {
	allowSync?: boolean;
	id: string | number;
	type?: plexTypes.PlexMediaItemType;
	uuid?: string | undefined;
	title: string;
	path: string;
	hubsPath: string;
	agent?: plexTypes.PlexLibraryAgent;
	scanner?: plexTypes.PlexLibraryScanner;
	language?: string; // "en-US"
	hidden?: boolean;
};

export class PseuplexSectionBase implements PseuplexSection {
	readonly id: string | number;
	readonly uuid?: string | undefined;
	readonly type: plexTypes.PlexMediaItemType;
	readonly path: string;
	readonly hubsPath: string;
	title: string;
	agent?: plexTypes.PlexLibraryAgent;
	scanner?: plexTypes.PlexLibraryScanner;
	language?: string; // "en-US"
	allowSync: boolean;
	refreshing = false;

	constructor(options: PseuplexSectionOptions) {
		this.id = options.id;
		this.uuid = options.uuid;
		this.type = options.type ?? plexTypes.PlexMediaItemType.Mixed;
		this.path = options.path;
		this.hubsPath = options.hubsPath;
		this.title = options.title;
		this.agent = options.agent;
		this.scanner = options.scanner;
		this.language = options.language;
		this.allowSync = options.allowSync ?? false;
	}

	async getTitle(context: PseuplexRequestContext): Promise<string> {
		return this.title;
	}

	async getSectionPage(context: PseuplexRequestContext): Promise<plexTypes.PlexLibrarySectionPage> {
		const titlePromise = this.getTitle(context);
		return {
			MediaContainer: {
				size: 0,
				allowSync: false,
				// art: someart
				content: plexTypes.PlexLibrarySectionContentType.Secondary,
				identifier: plexTypes.PlexPluginIdentifier.PlexAppLibrary,
				librarySectionID: this.id,
				// thumb: somethumb
				title1: await titlePromise,
				viewGroup: plexTypes.PlexLibrarySectionViewGroup.Secondary,
			}
		};
	}

	async getMediaProviderDirectory(context: PseuplexRequestContext): Promise<plexTypes.PlexContentDirectoryWithPivots> {
		const titlePromise = this.getTitle(context);
		const pivotsPromise = this.getPivots?.();
		return {
			id: `${this.id}`,
			key: this.path,
			hubKey: this.hubsPath,
			title: await titlePromise,
			uuid: this.uuid,
			type: this.type,
			refreshing: this.refreshing,
			agent: this.agent,
			scanner: this.scanner,
			language: this.language,
			Pivot: await pivotsPromise,
		};
	}

	async getPivots?(): Promise<plexTypes.PlexPivot[]>;

	async getLibrarySectionsEntry(params: plexTypes.PlexLibrarySectionsPageParams, context: PseuplexRequestContext): Promise<plexTypes.PlexLibrarySection> {
		const titlePromise = this.getTitle(context);
		return {
			allowSync: this.allowSync,
			key: `${this.id}`,
			uuid: this.uuid!,
			type: this.type,
			title: await titlePromise,
			refreshing: this.refreshing,
			agent: this.agent,
			scanner: this.scanner,
			language: this.language,
			filters: true,
			content: true,
			directory: true,
		};
	}

	getHubs?(params: plexTypes.PlexHubListPageParams, context: PseuplexRequestContext): Promise<PseuplexHub[]>;
	getPromotedHubs?(params: plexTypes.PlexHubListPageParams, context: PseuplexRequestContext): Promise<PseuplexHub[]>;

	private async hubPageFromHubs(options: {
		plexParams: plexTypes.PlexHubListPageParams,
		context: PseuplexRequestContext,
		hubsPromise: (PseuplexHub[] | Promise<PseuplexHub[] | undefined> | undefined),
		promoted: boolean,
	}): Promise<plexTypes.PlexSectionHubsPage> {
		const titlePromise = this.getTitle(options.context);
		const hubs = (await options.hubsPromise) ?? [];
		const hubPageParams = pseuplexHubPageParamsFromHubListParams(options.plexParams);
		const hubEntriesPromise = Promise.all(hubs.map((hub) => {
			return hub.getHubListEntry(hubPageParams, options.context);
		}));
		return {
			MediaContainer: {
				size: hubs.length,
				allowSync: false,
				librarySectionID: this.id,
				librarySectionTitle: await titlePromise,
				librarySectionUUID: this.uuid!,
				identifier: plexTypes.PlexPluginIdentifier.PlexAppLibrary,
				Hub: await hubEntriesPromise,
			}
		};
	}
	
	async getHubsPage(plexParams: plexTypes.PlexHubListPageParams, context: PseuplexRequestContext): Promise<plexTypes.PlexSectionHubsPage> {
		return await this.hubPageFromHubs({
			plexParams,
			context,
			hubsPromise: this.getHubs?.(plexParams, context),
			promoted: false,
		});
	}
	
	async getPromotedHubsPage(plexParams: plexTypes.PlexHubListPageParams, context: PseuplexRequestContext): Promise<plexTypes.PlexSectionHubsPage> {
		return await this.hubPageFromHubs({
			plexParams,
			context,
			hubsPromise: this.getPromotedHubs?.(plexParams, context),
			promoted: true,
		});
	}



	getAllItems?(params: plexTypes.PlexSectionAllItemsParams, context: PseuplexRequestContext): Promise<PseuplexSectionItemsPage>;

	async getAllItemsPage(params: plexTypes.PlexSectionAllItemsParams, context: PseuplexRequestContext): Promise<plexTypes.PlexMetadataPage> {
		const titlePromise = this.getTitle(context);
		const itemsPage = await this.getAllItems?.(params, context);
		return {
			MediaContainer: {
				size: itemsPage?.items.length ?? 0,
				totalSize: itemsPage ? itemsPage.totalItemCount : 0,
				allowSync: false,
				librarySectionID: this.id,
				librarySectionTitle: await titlePromise,
				librarySectionUUID: this.uuid!,
				identifier: plexTypes.PlexPluginIdentifier.PlexAppLibrary,
				Metadata: itemsPage?.items ?? [],
			}
		};
	}
}
