
export enum ActivityActionType {
	Watched = 'watched',
	Rewatched = 'rewatched',
	LikedReview = 'liked-review',
	AddedToWatchlist = 'added-to-watchlist'
}

export interface ActivityFeedViewing {
	username: string;
	userDisplayName: string;
	href: string;
	rating?: number | undefined; // 0-10
	text?: string;
	liked?: boolean;
}

export interface ActivityFeedFilm {
	imageURL?: string | undefined;
	name: string;
	slug: string;
	href: string;
	year?: string;
}

export interface ActivityFeedEntry {
	id: string;
	userImageURL: string;
	userHref: string;
	username: string;
	userDisplayName: string;
	action: ActivityActionType;
	viewing?: ActivityFeedViewing | undefined;
	film?: ActivityFeedFilm | undefined;
	time: Date;
}

export interface ActivityFeedPage {
	items: ActivityFeedEntry[];
	csrf: string;
	end: boolean;
}
