import { PseuplexConfigBase } from '../../pseuplex';

type LetterboxdFlags = {
	letterboxd?: {
		similarItemsEnabled?: boolean;
		friendsActivityHubEnabled?: boolean;
		friendsReviewsEnabled?: boolean;
	},
};
type LetterboxdPerUserPluginConfig = {
	letterboxd?: {
		username?: string;
	},
} & LetterboxdFlags;
export type LetterboxdPluginConfig = PseuplexConfigBase<LetterboxdPerUserPluginConfig> & LetterboxdFlags & {
	plex: {
		assumedTopSectionId?: string | number;
	}
};
