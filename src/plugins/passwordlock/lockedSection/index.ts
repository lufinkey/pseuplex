import * as plexTypes from '../../../plex/types';
import {
	PseuplexHub,
	PseuplexHubPage,
	PseuplexHubPageParams,
	PseuplexHubSectionInfo,
	PseuplexMetadataTransformOptions,
	PseuplexRequestContext,
	PseuplexSectionBase,
	PseuplexSectionOptions
} from '../../../pseuplex';
import { PasswordLockPluginDef } from '../plugindef';
import { PasswordLockedSectionIntroHub } from './introHub';

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

	constructor(plugin: PasswordLockPluginDef, options: PasswordLockSectionOptions) {
		super(options);
		this.plugin = plugin;

		this.hubsPivotTitle = options.hubsPivotTitle ?? SectionHubsPivotTitle;
		this.introHub = new PasswordLockedSectionIntroHub({
			path: `${this.hubsPath}/intro`,
			title: options.introHubTitle ?? SectionIntroHubTitle,
			metadataProvider: plugin.metadata,
			metadataTransformOptions: {
				metadataBasePath: '/library/metadata',
				qualifiedMetadataIds: true,
				includeMetadataUnavailability: true,
			},
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

	async getHubs?(params: plexTypes.PlexHubListPageParams, context: PseuplexRequestContext): Promise<PseuplexHub[]> {
		return [
			this.introHub,
		];
	}
	
	async getPromotedHubs?(params: plexTypes.PlexHubListPageParams, context: PseuplexRequestContext): Promise<PseuplexHub[]> {
		return [
			this.introHub,
		];
	}
}
