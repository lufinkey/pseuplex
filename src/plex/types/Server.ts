
export type PlexServerIdentityPage = {
	MediaContainer: {
		size: number;
		claimed: boolean;
		machineIdentifier: string;
		version: string;
	}
};

export type PlexMediaProvidersPage = {
	MediaContainer: {
		size: number;
		allowCameraUpload: boolean;
		allowChannelAccess: boolean;
		allowMediaDeletion: boolean;
		allowSharing: boolean;
		allowSync: boolean;
		allowTuners: boolean;
		backgroundProcessing: boolean;
		certificate: boolean;
		companionProxy: boolean;
		countryCode: string;
		diagnostics: string;
		eventStream: boolean;
		friendlyName: string;
		livetv: number;
		machineIdentifier: string;
		musicAnalysis: number;
		myPlex: boolean;
		myPlexMappingState: string;
		myPlexSigninState: string;
		myPlexSubscription: boolean;
		myPlexUsername: string;
		offlineTranscode: number;
		ownerFeatures: string;
		platform: string;
		platformVersion: string;
		pluginHost: boolean;
		pushNotifications: boolean;
		readOnlyLibraries: boolean;
		streamingBrainABRVersion: number;
		streamingBrainVersion: number;
		sync: boolean;
		transcoderActiveVideoSessions: number;
		transcoderAudio: boolean;
		transcoderLyrics: boolean;
		transcoderSubtitles: boolean;
		transcoderVideo: boolean;
		transcoderVideoBitrates: string;
		transcoderVideoQualities: string;
		transcoderVideoResolutions: string;
		updatedAt: number;
		updater: boolean;
		version: string;
		voiceSearch: boolean;
		MediaProvider: PlexMediaProvider[];
	};
};

export type PlexMediaProvider = {
	identifier: string;
	title: string;
	types: string;
	protocols: string;
	Feature: PlexMediaProviderFeature[];
};

export type PlexMediaProviderFeature = {
	key: string;
	type: string;
};

export type PlexMediaProviderAction = {
	id: string;
	key: string;
}

