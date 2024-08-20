
import {
	PlexContentRating,
	PlexMediaItemType
} from './common';
import {
	PlexMedia
} from './Media';


export type PlexMetadataItem = {
	guid?: string; // "plex://episode/6rv4x76r8x9bqb98xqt9qbt29r"
	key: string; // "/library/metadata/20205"
	slug?: string; // "spartacus"
	type: PlexMediaItemType; // 'episode'
	title: string; // "Some Episode Name"
	originalTitle?: string;
	tagline?: string;
	summary?: string;
	thumb?: string; // "/library/metadata/20205/thumb/98535429"
	art?: string; // "/library/metadata/20198/art/179430404"
	contentRating?: PlexContentRating; // "TV-MA"
	index?: number; // 4
	lastViewedAt?: number; // timestamp since 1970
	includedAt?: number; // timestamp since 1970
	year?: number; // 2012
	duration?: number;
	ratingKey?: string; // "20205"
	rating?: number; // [0.0, 10.0f]
	ratingImage?: string; // "rottontomatoes://image.rating.ripe"
	audienceRating?: number; // [0.0, 10.0f]
	audienceRatingImage?: string; // "imdb://image.rating", "rottontomatoes://image.rating.upright"
	imdbRatingCount?: number;
	originallyAvailableAt?: string; // "2012-03-19"
	addedAt?: number; // 17003248740
	updatedAt?: number; // 23476345400

	studio?: string; // "United Artists"
	viewOffset?: number;
	skipCount?: number;
	expiresAt?: number;
	attribution?: string; // "shout-factory"
	publicPagesURL?: string; // "https://watch.plex.tv/show/<TVSHOW-SLUG>/season/1/episode/4"
	availabilityId?: string;
	streamingMediaId?: string;

	Media?: PlexMedia[];
} & ({} |
	{
		librarySectionTitle: string; // "My TV Shows"
		librarySectionID: number; // 2
		librarySectionKey: string; // "/library/sections/2"
	}
) & ({} |
	({
		parentGuid: string; // "plex://season/5464cnhtcb071t52015c02"
		parentKey: string; // "/library/metadata/20201"
		parentRatingKey: string; // "20205"
		parentTitle: string; // "Season 1"
		parentIndex: number; // 1
		parentThumb: string; // "/library/metadata/20205/thumb/98535429"
	} & ({} |
		{
			grandparentGuid: string; // "plex://show/0374ctv2rv1c123c40cv01t3"
			grandparentKey: string; // "/library/metadata/20198"
			grandparentRatingKey: string; // "20198"
			grandparentSlug: string; // 'pokemon'
			grandparentThumb: string; // "/library/metadata/20205/thumb/98535429"
			grandparentArt: string; // "/library/metadata/20198/art/179430404"
			grandparentTheme?: string; // "/library/metadata/20198/theme/45343402402354"
		}))
);

export type PlexMetadataPage = PlexMetadataItem & {
	// TODO add other properties
};
