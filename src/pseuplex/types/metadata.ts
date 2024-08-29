
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
		Metadata: PseuplexMetadataItem | PseuplexMetadataItem[];
	}
};
