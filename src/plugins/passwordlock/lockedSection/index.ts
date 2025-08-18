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

export class PasswordLockedSection extends PseuplexSectionBase {
	readonly plugin: PasswordLockPluginDef;
	readonly introHub: PasswordLockedSectionIntroHub;

	constructor(plugin: PasswordLockPluginDef, options: PseuplexSectionOptions) {
		super(options);
		this.plugin = plugin;

		this.introHub = new PasswordLockedSectionIntroHub({
			path: `${this.hubsPath}/intro`,
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
				title: "Library Locked",
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
