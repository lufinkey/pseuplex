
import {
	PlexMetadataItem,
	PlexMediaContainer
} from '../../plex/types';

export enum PseuplexMetadataSource {
	Plex = 'plex',
	PlexServer = 'plexserver',
	Letterboxd = 'letterboxd',
	Request = 'request'
};

export type PseuplexMetadataItem = PlexMetadataItem & {
	Pseuplex: {
		isOnServer: boolean;
		unavailable: boolean;
		metadataIds: { [sourceSlug: string]: string };
		plexMetadataIds?: { [serverURL: string]: string | undefined };
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
