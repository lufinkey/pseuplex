
import {
	BooleanQueryParam
} from '../../utils/queryparams';

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
	owned: BooleanQueryParam;
	ownerId?: `${number}` | number;
	accessToken: string;
	publicAddress: string;
	httpsRequired: BooleanQueryParam;
	synced?: BooleanQueryParam;
	relay?: BooleanQueryParam;
	dnsRebindingProtection?: BooleanQueryParam;
	natLoopbackSupport: BooleanQueryParam;
	publicAddressMatches: BooleanQueryParam;
	presence?: BooleanQueryParam;
	PlexTVDeviceConnection?: PlexTVDeviceConnection[]
};

export type PlexTVDeviceConnection = {
	protocol: string; // "http", "https"
	address: string;
	port: `${number}` | number;
	uri: string;
	local: BooleanQueryParam;
};

export type PlexTVResourcesPage = {
	MediaContainer: {
		size: `${number}` | number;
		Device?: PlexTVDevice[]
	}
};
