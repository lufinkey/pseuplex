import express from 'express';
import * as plexTypes from '../plex/types';
import { CachedFetcher } from '../fetching/CachedFetcher';
import type { PseuplexRequestContext } from './types';
import {
	parsePseuplexMetadataKey,
	stringifyPseuplexMetadataKeyFromIDStrings,
} from './metadataidentifier';
import { PseuplexMetadataTransformOptions } from './metadata';
import { parseStringQueryParam } from '../utils/queryparams';

export type PseuplexHubPage = {
	hub: plexTypes.PlexHub;
	items: plexTypes.PlexMetadataItem[];
	offset?: number;
	totalItemCount?: number;
	more: boolean;
}

export const HubStartTokenQueryParam = 'hubStartToken';

export type PseuplexHubPageParams = plexTypes.PlexHubPageParams & {
	hubStartToken?: string | null | undefined;
};

export const parsePseuplexHubPageParams = (req: express.Request, options: plexTypes.ParsePlexHubPageParamsOptions): PseuplexHubPageParams => {
	const hubPageParams: PseuplexHubPageParams = plexTypes.parsePlexHubPageParams(req, options);
	if(!options.fromListPage) {
		const hubStartToken = parseStringQueryParam(req.query[HubStartTokenQueryParam]);
		if(hubStartToken !== undefined) {
			hubPageParams.hubStartToken = hubStartToken;
		}
	}
	return hubPageParams;
};

export type PseuplexHubSectionInfo = {
	id: string;
	title: string;
	uuid?: string;
};

export abstract class PseuplexHub {
	abstract readonly metadataTransformOptions: PseuplexMetadataTransformOptions;
	abstract readonly section?: PseuplexHubSectionInfo;
	
	abstract get(params: PseuplexHubPageParams, context: PseuplexRequestContext): Promise<PseuplexHubPage>;
	
	async getHubPage(params: PseuplexHubPageParams, context: PseuplexRequestContext): Promise<plexTypes.PlexHubPage> {
		const page = await this.get(params, context);
		const section = this.section;
		return {
			MediaContainer: {
				size: (page.items?.length ?? 0),
				totalSize: page.totalItemCount,
				offset: page.offset,
				allowSync: false, // TODO figure out what this does
				...(section ? {
					librarySectionID: section.id,
					librarySectionTitle: section.title,
					librarySectionUUID: section.uuid,
				} : undefined),
				identifier: plexTypes.PlexPluginIdentifier.PlexAppLibrary, // TODO figure out what this does
				Meta: {
					Type: [
						{
							key: page.hub.key,
							type: page.hub.type,
							title: page.hub.title,
							active: (page.totalItemCount != 0)
						}
					]
				},
				Metadata: page.items
			}
		};
	}
	
	async getHubListEntry(params: PseuplexHubPageParams, context: PseuplexRequestContext): Promise<plexTypes.PlexHubWithItems> {
		const page = await this.get(params, context);
		const metadataIds: string[] = page.items
			.map((item) => {
				let metadataId = parsePseuplexMetadataKey(item.key)?.id;
				if (!metadataId) {
					metadataId = item.ratingKey;
				}
				return metadataId!;
			})
			.filter((metadataId) => metadataId);
		return {
			...page.hub,
			hubKey: stringifyPseuplexMetadataKeyFromIDStrings(metadataIds),
			size: (page.items?.length ?? 0),
			more: page.more,
			Metadata: page.items
		};
	}
}



export const pseuplexHubPageParamsFromHubListParams = (hubListParams: plexTypes.PlexHubPageParams) => {
	const hubPageParams: PseuplexHubPageParams = plexTypes.plexHubPageParamsFromHubListParams(hubListParams);
	delete hubPageParams.hubStartToken;
	return hubPageParams;
};



export abstract class PseuplexHubProvider<THub extends PseuplexHub = PseuplexHub> {
	readonly cache: CachedFetcher<THub>;

	constructor() {
		this.cache = new CachedFetcher<THub>(async (id: string) => {
			return await this.fetch(id);
		});
	}

	transformHubID?(id: string): (string | Promise<string>);
	abstract fetch(id: string): (THub | Promise<THub>);
	abstract path(id: string): string;

	async get(id: string): Promise<THub> {
		if(id == null) {
			throw new Error("Invalid null id");
		}
		if(this.transformHubID) {
			id = await this.transformHubID(id);
		}
		return this.cache.getOrFetch(id);
	}
}
