
import {
	PlexMetadataItem,
	PlexMetadataPage,
	PlexMediaContainer
} from '../../plex/types';

export enum PseuplexMetadataSource {
	Plex = 'plex',
	PlexServer = 'plexserver',
	Letterboxd = 'letterboxd'
};

export type PseuplexMetadataItem = PlexMetadataItem & {
	Pseuplex: {
		metadataId: string;
		isOnServer: boolean;
	}
};

export type PseuplexMetadataPage = {
	MediaContainer: PlexMediaContainer & {
		librarySectionID?: string | number;
		librarySectionTitle?: string;
		librarySectionUUID?: string; // only included on PMS results
		Metadata: PseuplexMetadataItem | PseuplexMetadataItem[];
	}
};
