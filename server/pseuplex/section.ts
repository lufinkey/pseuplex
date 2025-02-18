import express from 'express';
import * as plexTypes from '../plex/types';
import type { PseuplexRequestContext } from './types';
import type {
	PseuplexHub,
	PseuplexHubPageParams
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
}

export type PseuplexSectionOptions = {
	allowSync?: boolean;
	id: string | number;
	type?: plexTypes.PlexMediaItemType;
	uuid?: string | undefined;
	title: string;
	path: string;
	hubsPath: string;
	hidden?: boolean;
};

export class PseuplexSectionBase implements PseuplexSection {
	readonly id: string | number;
	readonly uuid?: string | undefined;
	readonly type: plexTypes.PlexMediaItemType;
	readonly title: string;
	readonly path: string;
	readonly hubsPath: string;
	allowSync: boolean;

	constructor(options: PseuplexSectionOptions) {
		this.id = options.id;
		this.uuid = options.uuid;
		this.type = options.type ?? plexTypes.PlexMediaItemType.Mixed;
		this.title = options.title;
		this.path = options.path;
		this.hubsPath = options.hubsPath;
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
			refreshing: false,
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
			refreshing: false,
			filters: true,
			content: true,
			directory: true,
		};
	}

	getHubs?(params: plexTypes.PlexHubListPageParams, context: PseuplexRequestContext): Promise<PseuplexHub[]>;
	getPromotedHubs?(params: plexTypes.PlexHubListPageParams, context: PseuplexRequestContext): Promise<PseuplexHub[]>;

	private async hubPageFromHubs(
		params: plexTypes.PlexHubListPageParams,
		context: PseuplexRequestContext,
		hubsPromise: (PseuplexHub[] | Promise<PseuplexHub[] | undefined> | undefined),
		promoted: boolean,
	): Promise<plexTypes.PlexSectionHubsPage> {
		const titlePromise = this.getTitle(context);
		const hubs = (await hubsPromise) ?? [];
		const hubPageParams: PseuplexHubPageParams = {
			count: params.count,
			includeMeta: params.includeMeta,
			excludeFields: params.excludeFields
		};
		const hubEntriesPromise = Promise.all(hubs.map((hub) => {
			return hub.getHubListEntry(hubPageParams, context)
		}));
		return {
			MediaContainer: {
				size: hubs.length,
				allowSync: false,
				librarySectionID: this.id,
				librarySectionTitle: await titlePromise,
				librarySectionUUID: this.uuid!,
				Hub: await hubEntriesPromise,
			}
		};
	}
	
	async getHubsPage(params: plexTypes.PlexHubListPageParams, context: PseuplexRequestContext): Promise<plexTypes.PlexSectionHubsPage> {
		return await this.hubPageFromHubs(
			params,
			context,
			this.getHubs?.(params, context),
			false
		);
	}

	async getPromotedHubsPage(params: plexTypes.PlexHubListPageParams, context: PseuplexRequestContext): Promise<plexTypes.PlexSectionHubsPage> {
		return await this.hubPageFromHubs(
			params,
			context,
			this.getHubs?.(params, context),
			true
		);
	}
}
