
import {
	PlexContentRating,
	PlexMediaItemType
} from './common';
import {
	PlexMedia
} from './Media';
import {
	PlexMediaContainer
} from './MediaContainer';

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

	Guid?: PlexGuid[];
	Media?: PlexMedia[];
	Review?: PlexReview[];
	Director?: PlexDirector[];
	Writer?: PlexWriter[];
	Role?: PlexRole[];
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

export type PlexMetadataPage = {
	MediaContainer: PlexMediaContainer & {
		Metadata: PlexMetadataItem | PlexMetadataItem[]
	}
};

export type PlexGuid = {
	id: `${string}://${string}`;
};

export type PlexReview = {
	id?: number | string; // 2086
	filter?: string; // "art=2086"
	tag: string; // "Richard Whittaker"
	text: string;
	image: string; // "rottontomatoes://image.review.fresh", "rottontomatoes://image.review.rotton"
	link: string;
	source: string; // "Observer", "Wall Street Journal", "RogerEbert.com"
};

export type PlexPerson = {
	id?: number | string; // 195049
	filter?: string; // "director=195049"
	tag: string; // "Sam Pillsbury"
	tagKey: string; // "o827tvx98bxtfi2r8297e342"
};

export type PlexPersonWithImage = PlexPerson & {
	thumb: string; // "https://metadata-static.plex.tv/people/5d77687febdf2200209c082d.jpg"
};

export type PlexDirector = PlexPerson;
export type PlexWriter = PlexPersonWithImage;
export type PlexRole = PlexPersonWithImage & {
	role: string; // "Lightning McQueen"
};
