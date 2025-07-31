
// general

export type ResultsPage<T> = {
	pageInfo: {
		page: number;
		pages: number;
		results: number;
	},
	results: T[]
};

export enum Language {
	English = 'en'
}



// providers

export type WatchProvider = {
	iso_3166_1: string;
	link: string;
	buy?: WatchProviderDetails[];
	flatrate?: WatchProviderDetails[];
};

export type WatchProviderDetails = {
	displayPriority: number;
	logoPath: string;
	id: number;
	name: string;
};



// user

export type User = {
	id: number;
	email: string; // "hey@itsme.com"
	username: string;
	plexId?: number;
	plexToken?: string;
	plexUsername?: string;
	userType: number;
	permissions: number;
	avatar?: string;
	createdAt: string; // "2020-09-02T05:02:23.000Z"
	updatedAt: string; // "2020-09-02T05:02:23.000Z"
	requestCount: number;
};

export enum UsersSortType {
	Created = 'created',
	Updated = 'updated',
	Requests = 'requests',
	DisplayName = 'displayname'
};



// requests

export enum MediaRequestStatus {
	PendingApproval = 1,
	Approved = 2,
	Declined = 3
};

export type MediaRequestItem = {
	id: number;
	status: MediaRequestStatus;
	media: (MediaItemInfo & {
		requests: string[];
	}),
	createdAt: string; // "2020-09-12T10:00:27.000Z"
	updatedAt: string; // "2020-09-12T10:00:27.000Z"
	requestedBy: User;
	modifiedBy: User;
	is4k: boolean;
	serverId: number;
	profileId: number;
	rootFolder: string;
};

export type MediaRequestInfo = {
	id: number;
	status: MediaRequestStatus;
	media: string;
	createdAt: string; // "2020-09-12T10:00:27.000Z"
	updatedAt: string; // "2020-09-12T10:00:27.000Z"
	requestedBy: User;
	modifiedBy: User;
	is4k: boolean;
	serverId: number;
	profileId: number;
	rootFolder: string;
};



// people

export enum Gender {
	Unknown = 0,
	Female = 1,
	Male = 2
}

export type CastMember = {
	id: number;
	castId: number;
	character: string;
	creditId: string;
	gender: Gender;
	name: string;
	order: number;
	profilePath: string;
};

export type CrewMember = {
	id: number;
	creditId: string;
	gender: Gender;
	name: string;
	job: string;
	department: string;
	profilePath: string;
};



// media

export enum MediaType {
	Movie = 'movie',
	TV = 'tv'
};

export enum MediaStatus {
	Unknown = 1,
	Pending = 2,
	Processing = 3,
	PartiallyAvailable = 4,
	Available = 5
};

export type MediaItemInfo = {
	id: number;
	tmdbId: number;
	tvdbId: number;
	status: MediaStatus;
	createdAt: string; // "2020-09-12T10:00:27.000Z"
	updatedAt: string; // "2020-09-12T10:00:27.000Z"
}



// movie

export type Movie = {
	id: number;
	imdbId: string;
	adult: boolean;
	backdropPath: string;
	posterPath: string;
	budget: number;
	genres: {
		id: number; name: string
	}[];
	homepage: string;
	relatedVideos: {
		url: string;
		key: string;
		name: string;
		size: number;
		type: string;
		site: string;
	}[];
	originalLanguage: string;
	originalTitle: string;
	overview: string;
	popularity: number;
	productionCompanies: {
		id: number;
		logoPath: string;
		originCountry: string;
		name: string;
	}[];
	productionCountries: {
		iso_3166_1: string;
		name: string;
	}[];
	releaseDate: string;
	releases: {
		results: {
			iso_3166_1: string;
			rating: string;
			release_dates: {
				certification: string;
				iso_639_1: string;
				note: string;
				release_date: string;
				type: number;
			}[];
		}[];
	};
	revenue: number;
	runtime: number;
	spokenLanguages: {
		englishName: string;
		iso_639_1: string;
		name: string;
	}[];
	status: string;
	tagline: string;
	title: string;
	video: boolean;
	voteAverage: number;
	voteCount: number;
	credits: {
		cast: CastMember[];
		crew: CrewMember[];
	};
	collection?: {
		id: number;
		name: string;
		posterPath: string;
		backdropPath: string;
	};
	externalIds: {
		facebookId: string;
		freebaseId: string;
		freebaseMid: string;
		imdbId: string;
		instagramId: string;
		tvdbId: number;
		tvrageId: number;
		twitterId: string;
	};
	mediaInfo: (MediaItemInfo & {
		requests: MediaRequestInfo[];
	});
	watchProviders: WatchProvider[][];
};



// TV

export type TVShow = {
	id: number;
	backdropPath: string;
	posterPath: string;
	contentRatings: {
		results: { iso_3166_1: string; rating: string }[];
	};
	createdBy: {
		id: number;
		name: string;
		gender: number;
		profilePath: string;
	}[];
	episodeRunTime: number[];
	firstAirDate: string;
	genres: { id: number; name: string }[];
	homepage: string;
	inProduction: boolean;
	languages: string[];
	lastAirDate: string;
	lastEpisodeToAir: TVEpisode;
	name: string;
	nextEpisodeToAir: TVEpisode;
	networks: TVNetwork[];
	numberOfEpisodes: number;
	numberOfSeason: number;
	originCountry: string[];
	originalLanguage: string;
	originalName: string;
	overview: string;
	popularity: number;
	productionCompanies: TVNetwork[];
	productionCountries: {
		iso_3166_1: string;
		name: string
	}[];
	spokenLanguages: {
		englishName: string;
		iso_639_1: string;
		name: string
	}[];
	seasons: TVSeason[];
	status: string;
	tagline: string;
	type: string;
	voteAverage: number;
	voteCount: number;
	credits: {
		cast: CastMember[];
		crew: CrewMember[];
	};
	externalIds: {
		facebookId: string;
		freebaseId: string;
		freebaseMid: string;
		imdbId: string;
		instagramId: string;
		tvdbId: number;
		tvrageId: number;
		twitterId: string;
	};
	keywords: {
		id: number;
		name: string
	}[];
	mediaInfo: (MediaItemInfo & {
		requests: MediaRequestInfo[];
	});
	watchProviders: WatchProvider[][];
};

export type TVEpisode = {
	id: number;
	name: string;
	airDate: string;
	episodeNumber: number;
	overview: string;
	productionCode: string;
	seasonNumber: number;
	showId: number;
	stillPath: string;
	voteAverage: number;
	voteCount: number;
};

export type TVNetwork = {
	id: number;
	logoPath: string;
	originCountry: string;
	name: string;
};

export type TVSeason = {
	id: number;
	airDate: string;
	episodeCount: number;
	name: string;
	overview: string;
	posterPath: string;
	seasonNumber: number;
	episodes: TVEpisode[];
};
