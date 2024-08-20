
import { PlexMediaItemType } from '../../plex/types';
import {
	PlexXMLBoolean
} from './common';

export type PlexTVSharedServer = {
	id: `${number}` | number;
	username: string;
	email: string;
	userID: `${number}` | string;
	accessToken: string;
	name: string; // server name
	invitedAt: `${number}` | number;
	acceptedAt: `${number}` | number;
	allowSync: PlexXMLBoolean;
	allowCameraUpload: PlexXMLBoolean;
	allowChannels: PlexXMLBoolean;
	allowTuners: PlexXMLBoolean;
	allowSubtitleAdmin: PlexXMLBoolean;
	owned: PlexXMLBoolean;
	allLibraries: PlexXMLBoolean;
	filterAll: string;
	filterMovies: string;
	filterMusic: string;
	filterPhotos: string;
	filterTelevision: string;
	Section?: PlexTVSharedServerSection[];
};

export type PlexTVSharedServerSection = {
	id: `${number}` | number;
	key: `${number}` | number;
	title: string;
	type: PlexMediaItemType;
	shared: PlexXMLBoolean;
};

export type PlexTVSharedServersPage = {
	MediaContainer: {
		friendlyName: string;
		identifier: string; // "com.plexapp.plugins.plex"
		machineIdentifier: string;
		size: `${number}` | number;
		SharedServer?: PlexTVSharedServer[];
	}
};
