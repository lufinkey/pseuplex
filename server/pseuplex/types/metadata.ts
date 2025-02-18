
import {
	PlexMetadataItem,
	PlexMediaContainer,
	PlexMetadataChildrenPage,
	PlexMetadataPage
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
		plexServerMetadataId?: string | undefined;
		externalPlexMetadataIds?: { [serverURL: string]: string | undefined };
	}
};

export type PseuplexMetadataPage = PlexMetadataPage<PseuplexMetadataItem>;
export type PseuplexMetadataChildrenPage = PlexMetadataChildrenPage<PseuplexMetadataItem>;
