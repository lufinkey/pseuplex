
import {
	PlexXMLBoolean
} from './common';

export type PlexTVDevice = {
	name: string; // "Server Name"
	product: string; // "Plex Media Server"
	productVersion: string;
	platform: string; // "Linux"
	platformVersion: string;
	device: string; // "PC", "Docker Container"
	clientIdentifier: string; // for servers, this is the same as the machine identifier
	createdAt: `${number}` | number;
	lastSeenAt: `${number}` | number;
	provides: string; // "server"
	owned: PlexXMLBoolean;
	ownerId?: `${number}` | number;
	accessToken: string;
	publicAddress: string;
	httpsRequired: PlexXMLBoolean;
	synced?: PlexXMLBoolean;
	relay?: PlexXMLBoolean;
	dnsRebindingProtection?: PlexXMLBoolean;
	natLoopbackSupport: PlexXMLBoolean;
	publicAddressMatches: PlexXMLBoolean;
	presence?: PlexXMLBoolean;
	PlexTVDeviceConnection?: PlexTVDeviceConnection[]
};

export type PlexTVDeviceConnection = {
	protocol: string; // "http", "https"
	address: string;
	port: `${number}` | number;
	uri: string;
	local: PlexXMLBoolean;
};

export type PlexTVResourcesPage = {
	MediaContainer: {
		size: `${number}` | number;
		Device?: PlexTVDevice[]
	}
};
