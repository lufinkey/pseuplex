import * as plexTypes from '../plex/types';
import { parseMetadataIDFromKey } from '../plex/metadataidentifier';
import { CachedFetcher } from '../fetching/CachedFetcher';
import type {
	PseuplexMetadataPathTransformOptions,
	PseuplexMetadataTransformOptions,
	PseuplexMetadataProvider,
} from './metadata';
import type { PseuplexRequestContext } from './types';
import { parseMetadataID, stringifyPartialMetadataID } from './metadataidentifier';

export type PseuplexHubPage = {
	hub: plexTypes.PlexHub;
	items: plexTypes.PlexMetadataItem[];
	offset?: number;
	totalItemCount?: number;
	more: boolean;
}

export type PseuplexHubPageParams = plexTypes.PlexHubPageParams & {
	listStartToken?: string | null | undefined;
};

export type PseuplexHubSectionInfo = {
	id: string;
	title: string;
	uuid?: string;
};

export type PseuplexHubMetadataTransformOptions = {
	metadataTransformOptions?: PseuplexMetadataPathTransformOptions;
	includeMetadataUnavailability: boolean;
};

export const getMetadataTransformOptionsForHub = (metadataProviderBasePath: string, options: PseuplexHubMetadataTransformOptions): PseuplexMetadataTransformOptions => {
	return options.metadataTransformOptions ? {
		...options.metadataTransformOptions,
		includeMetadataUnavailability: options.includeMetadataUnavailability,
	} : {
		metadataBasePath: metadataProviderBasePath,
		qualifiedMetadataIds: false,
		includeMetadataUnavailability: options.includeMetadataUnavailability,
	};
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
		let transformOpts = this.metadataTransformOptions;
		let metadataBasePath = transformOpts.metadataBasePath;
		if(metadataBasePath && !metadataBasePath.endsWith('/')) {
			metadataBasePath += '/';
		}
		const metadataIds = page.items
			.map((item) => {
				let metadataId = parseMetadataIDFromKey(item.key, metadataBasePath)?.id;
				if (!metadataId) {
					metadataId = item.ratingKey;
					if(metadataId && !transformOpts.qualifiedMetadataIds) {
						// unqualify metadata id
						const fullMetadataIdParts = parseMetadataID(metadataId);
						metadataId = stringifyPartialMetadataID(fullMetadataIdParts);
					}
				}
				return metadataId;
			})
			.filter((metadataId) => metadataId);
		return {
			...page.hub,
			hubKey: (metadataIds.length > 0 ? `${metadataBasePath}${metadataIds.join(',')}` : undefined) as string,
			size: (page.items?.length ?? 0),
			more: page.more,
			Metadata: page.items
		};
	}
}



export const pseuplexHubPageParamsFromHubListParams = (hubListParams: plexTypes.PlexHubPageParams) => {
	const hubPageParams: PseuplexHubPageParams = plexTypes.plexHubPageParamsFromHubListParams(hubListParams);
	delete hubPageParams.listStartToken;
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
