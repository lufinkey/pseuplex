
import * as plexTypes from '../plex/types';
import {
	PseuplexHub,
	PseuplexHubContext,
	PseuplexHubPageParams
} from './hub';

export type PseuplexSectionInfo = {
	readonly id: string | number;
	readonly title: string;
	readonly uuid?: string | undefined;
};

export abstract class PseuplexSection {
	abstract readonly sectionInfo: PseuplexSectionInfo;

	abstract getHubs?(options: {maxCount?: number}): Promise<PseuplexHub[]>;
	async getHubsPage?(params: plexTypes.PlexHubListPageParams, context: PseuplexHubContext): Promise<plexTypes.PlexSectionHubsPage> {
		const hubs = await this.getHubs({
			maxCount: params.count
		});
		const hubPageParams: PseuplexHubPageParams = {
			count: params.count,
			includeMeta: params.includeMeta,
			excludeFields: params.excludeFields
		};
		return {
			MediaContainer: {
				size: hubs.length,
				allowSync: false,
				librarySectionID: this.sectionInfo.id,
				librarySectionTitle: this.sectionInfo.title,
				librarySectionUUID: this.sectionInfo.uuid,
				Hub: await Promise.all(hubs.map((hub) => {
					return hub.getHubListEntry(hubPageParams, context)
				}))
			}
		};
	}
}
