import { PseuplexConfigBase } from '../../pseuplex';

type RequestsFlags = {
	requests?: {
		enabled?: boolean;
		requestableSeasons?: boolean;
		partiallyAvailableOverlay?: boolean;
	},
};
type RequestsPerUserPluginConfig = {
	//
} & RequestsFlags;
export type RequestsPluginConfig = PseuplexConfigBase<RequestsPerUserPluginConfig> & RequestsFlags & {
	plex: {
		requestedMoviesLibraryId?: string | number;
		requestedTVShowsLibraryId?: string | number;
	}
};
