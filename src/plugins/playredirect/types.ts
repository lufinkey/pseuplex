export interface PlayRedirectConfig {
	enabled?: boolean;
	redirectToMetadataId: string; // e.g., "26" for /library/metadata/26
	redirectToTitle?: string; // Optional custom title to show in media info
	enabledForPlugins?: string[]; // Which plugins to apply redirect to, e.g., ["justwatch", "letterboxd"]
}

export interface PlayRedirectPluginConfig {
	playRedirect?: PlayRedirectConfig;
}
