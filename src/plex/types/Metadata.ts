
import {
	PlexContentRating,
	PlexMediaItemType,
	PlexXMLBoolean
} from './common';
import { PlexHubWithItems } from './Hub';
import {
	PlexMedia
} from './Media';
import {
	PlexMediaContainer
} from './MediaContainer';

export type PlexMetadataPageParams = {
	includeConcerts?: PlexXMLBoolean;
	includeExtras?: PlexXMLBoolean;
	includeOnDeck?: PlexXMLBoolean;
	includePopularLeaves?: PlexXMLBoolean;
	includePreferences?: PlexXMLBoolean;
	includeReviews?: PlexXMLBoolean;
	includeChapters?: PlexXMLBoolean;
	includeStations?: PlexXMLBoolean;
	includeExternalMetadata?: PlexXMLBoolean;
	asyncAugmentMetadata?: PlexXMLBoolean;
	checkFiles?: PlexXMLBoolean;
	asyncCheckFiles?: PlexXMLBoolean;
	refreshAnalysis?: PlexXMLBoolean;
	asyncRefreshAnalysis?: PlexXMLBoolean;
	refreshLocalMediaAgent?: PlexXMLBoolean;
	asyncRefreshLocalMediaAgent?: PlexXMLBoolean;
	includeUserState?: PlexXMLBoolean;
	includeRelated?: PlexXMLBoolean;
};

export type PlexMetadataChildrenPageParams = {
	excludeAllLeaves?: boolean;
	'X-Plex-Container-Start'?: number;
	'X-Plex-Container-Size'?: number;
};

export type PlexMetadataCollection = {
	art: string,
	guid: string,
	key: string,
	summary: string,
	thumb: string,
	tag: string,
};

export type PlexMetadataItem = {
	guid?: string; // "plex://episode/6rv4x76r8x9bqb98xqt9qbt29r"
	key: string; // "/library/metadata/20205"
	primaryExtraKey?: string; // "/library/metadata/5d9f3556d5fd3f001ee16790/extras/6204278b78fdd60048294e93"
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
	chapterSource?: string; // "media"

	studio?: string; // "United Artists"
	viewOffset?: number;
	skipCount?: number;
	expiresAt?: number;
	attribution?: string; // "shout-factory"
	publicPagesURL?: string; // "https://watch.plex.tv/show/<TVSHOW-SLUG>/season/1/episode/4"
	availabilityId?: string;
	streamingMediaId?: string;
	userState?: boolean;
	childCount?: number;

	Guid?: PlexGuid[];
	Genre?: PlexGenre[];
	Media?: PlexMedia[];
	Review?: PlexReview[];
	Director?: PlexPerson[];
	Producer?: PlexPerson[];
	Writer?: PlexPerson[];
	Role?: PlexPerson[];
	Collection?: PlexMetadataCollection[];
	Related?: {Hub?: PlexHubWithItems[]};
	UltraBlurColors?: PlexUltraBlurColors;
	Country?: PlexCountry[];
	Rating?: PlexRating[];
	Field?: PlexMetadataField[];
	Image?: PlexMetadataImage[];

	librarySectionTitle?: string; // "My TV Shows"
	librarySectionID?: string | number; // 2
	librarySectionKey?: string; // "/library/sections/2"
	
	parentGuid?: string; // "plex://season/5464cnhtcb071t52015c02"
	parentKey?: string; // "/library/metadata/20201"
	parentSlug?: string; // "beastars"
	parentRatingKey?: string; // "20205"
	parentTitle?: string; // "Season 1"
	parentIndex?: number; // 1
	parentThumb?: string; // "/library/metadata/20205/thumb/98535429"

	grandparentGuid?: string; // "plex://show/0374ctv2rv1c123c40cv01t3"
	grandparentKey?: string; // "/library/metadata/20198"
	grandparentRatingKey?: string; // "20198"
	grandparentSlug?: string; // 'pokemon'
	grandparentThumb?: string; // "/library/metadata/20205/thumb/98535429"
	grandparentArt?: string; // "/library/metadata/20198/art/179430404"
	grandparentTheme?: string; // "/library/metadata/20198/theme/45343402402354"
};

export type PlexMetadataPage = {
	MediaContainer: PlexMediaContainer & {
		librarySectionID?: string | number;
		librarySectionTitle?: string;
		librarySectionUUID?: string; // only included on PMS results
		Metadata: PlexMetadataItem | PlexMetadataItem[]
	}
};

export type PlexMetadataChildrenPage = PlexMetadataPage & {
	MediaContainer: {
		nocache?: boolean;
		key?: string; // "12345"
		parentIndex?: number;
		parentTitle?: string; // "Pokemon"
		parentYear?: number;
		title1?: string; // "My TV Shows"
		title2?: string; // "Pokemon"
		viewGroup?: PlexMediaItemType; // "season"
		theme?: string; // "/library/metadata/12345/theme/1234567890"
		thumb?: string; // "/library/metadata/12345/thumb/1234567890"
		summary?: string;
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
	image?: string; // "rottontomatoes://image.review.fresh", "rottontomatoes://image.review.rotton"
	link: string;
	source: string; // "Observer", "Wall Street Journal", "RogerEbert.com"
};

export type PlexPerson = {
	key?: string; // "/library/people/012365071260xt01rt23n0" < this will always point to a plex discover endpoint
	id?: number | string; // 195049 or "012365071260xt01rt23n0"
	slug: string; // "chris-pratt"
	filter?: string; // "director=195049" or "director=012365071260xt01rt23n0" < use this if you want to point to pms server instead of discover
	tag: string; // "Chris Pratt"
	tagKey?: string; // "o827tvx98bxtfi2r8297e342".
	thumb?: string;
	role?: string; // "Director", "Mario"
	type?: 'person'
};

export type PlexGenre = {
	filter: string; // "genre=4" on pms, "genre=287145bx19xbbtq" on discover
	id: number | string; // 4 on pms, "287145bx19xbbtq" on discover
	tag: string; // "Thriller", "Animation" etc
	key?: string; // "/library/categories/thriller"
	ratingKey?: string; // "genre_287145bx19xbbtq"
	slug?: string; // "thriller"
	type?: string; // "hub"
	context?: string; // "tag.genre"
};

export type PlexUltraBlurColors = {
	topLeft: string;
	topRight: string;
	bottomRight: string;
	bottomLeft: string;
};

export type PlexCountry = {
	id: number; // 53
	filter: string; // "country=53"
	tag: string; // "United States of America"
};

export type PlexRating = {
	image: string; // "imdb://image.rating"
	value: number; // 7.6
	type: string; // "audience"
};

export type PlexMetadataField = {
	locked: boolean; // true
	name: string; // "thumb"
};

export type PlexMetadataImage = {
	alt: string; // "Mission: Impossible - The Final Reckoning"
	type: string; // "coverPoster",
	url: string; // "/library/metadata/24/thumb/1748132115"
};
