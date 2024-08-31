
import {
	PlexMetadataItem,
	PlexMetadataPage,
	PlexMediaContainer
} from '../../plex/types';

export type PseuplexMetadataItem = PlexMetadataItem & {
	Pseuplex: {
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
