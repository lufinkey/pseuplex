
import {
	PlexMediaItemType
} from '../../plex/types';
import { BooleanQueryParam } from '../../utils/queryparams';

export type PlexTVSharedServer = {
	id: `${number}` | number;
	username: string;
	email: string;
	userID: `${number}` | string;
	accessToken: string;
	name: string; // server name
	invitedAt: `${number}` | number;
	acceptedAt: `${number}` | number;
	allowSync: BooleanQueryParam;
	allowCameraUpload: BooleanQueryParam;
	allowChannels: BooleanQueryParam;
	allowTuners: BooleanQueryParam;
	allowSubtitleAdmin: BooleanQueryParam;
	owned: BooleanQueryParam;
	allLibraries: BooleanQueryParam;
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
	shared: BooleanQueryParam;
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

export type PlexTVAccessTokensPage = PlexTVAccessTokenInfo[];

export type PlexTVAccessTokenInfo = {
	type: PlexTVAccessTokenType;
	token: string;
	owned: boolean
	device?: string;
	title?: string;
	createdAt: string; // "2025-11-01T19:48:28Z"
	// invited: PlexTVAccessTokenInvite
	// settings: PlexTVAccessTokenSettings
	// sections: PlexTVAccessTokenSection[]
};

export enum PlexTVAccessTokenType {
	Device = 'device',
	Server = 'server'
}
