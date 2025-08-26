import * as plexTypes from '../../../plex/types';
import {
	PseuplexHub,
	PseuplexHubPage,
	PseuplexHubPageParams,
	PseuplexHubSectionInfo,
	PseuplexMetadataTransformOptions,
	PseuplexRequestContext,
	PseuplexSectionBase,
	PseuplexSectionItemsPage,
	PseuplexSectionOptions
} from '../../../pseuplex';
import { PasswordLockMetadataID } from '../metadata';
import { PasswordLockPluginDef } from '../plugindef';
import { PasswordLockedSectionIntroHub } from './introHub';
import { arrayFromArrayOrSingle } from '../../../utils/misc';

export type PasswordLockSectionOptions = PseuplexSectionOptions & {
	hubsPivotTitle?: string,
	introHubTitle?: string,
};

const SectionHubsPivotTitle = "Library Locked";
const SectionIntroHubTitle = "Sorry! Please Log in";

export class PasswordLockSection extends PseuplexSectionBase {
	readonly plugin: PasswordLockPluginDef;
	readonly hubsPivotTitle: string;
	readonly introHub: PasswordLockedSectionIntroHub;
	readonly metadataTransformOptions: PseuplexMetadataTransformOptions;

	constructor(plugin: PasswordLockPluginDef, options: PasswordLockSectionOptions) {
		super(options);
		this.plugin = plugin;

		this.metadataTransformOptions = {
			metadataBasePath: '/library/metadata',
			qualifiedMetadataIds: true,
			includeMetadataUnavailability: true,
		};

		this.hubsPivotTitle = options.hubsPivotTitle ?? SectionHubsPivotTitle;
		this.introHub = new PasswordLockedSectionIntroHub({
			path: `${this.hubsPath}/intro`,
			title: options.introHubTitle ?? SectionIntroHubTitle,
			metadataProvider: plugin.metadata,
			metadataTransformOptions: this.metadataTransformOptions,
			section: {
				id: `${this.id}`,
				uuid: this.uuid,
				title: this.title,
			},
		});
	}

	async getPivots(): Promise<plexTypes.PlexPivot[]> {
		return [
			{
				id: plexTypes.PlexPivotID.Recommended,
				key: this.hubsPath,
				type: plexTypes.PlexPivotType.Hub,
				title: this.hubsPivotTitle,
				context: plexTypes.PlexPivotContext.Discover,
				symbol: plexTypes.PlexSymbol.Star,
			}
		];
	}

	async getHubs?(plexParams: plexTypes.PlexHubListPageParams, context: PseuplexRequestContext): Promise<PseuplexHub[]> {
		return [
			this.introHub,
		];
	}
	
	async getPromotedHubs?(plexParams: plexTypes.PlexHubListPageParams, context: PseuplexRequestContext): Promise<PseuplexHub[]> {
		return [
			this.introHub,
		];
	}

	async getAllItems(plexParams: plexTypes.PlexSectionAllItemsParams, context: PseuplexRequestContext): Promise<PseuplexSectionItemsPage> {
		const items = arrayFromArrayOrSingle((await this.plugin.metadata.get([
			PasswordLockMetadataID.Instructions
		], {
			...this.metadataTransformOptions,
			context,
			includeUnmatched: true,
		})).MediaContainer.Metadata);
		return {
			items,
			offset: 0,
			more: false,
			totalItemCount: items.length,
		};
	}
}
