import {
	JustWatchTitle,
	JustWatchPopularTitlesResponse,
	JustWatchSingleTitleResponse,
	JustWatchPopularTitlesVariables,
	JustWatchSingleTitleVariables,
	JustWatchCountry,
	JustWatchLanguage,
	JustWatchSortBy,
	JustWatchObjectType,
	JustWatchAPIResponse
} from './apitypes';
import { Logger } from '../../logging';
import { httpResponseError } from '../../utils/error';

export type JustWatchAPIRequestOptions = {
	logger?: Logger;
};

const JUSTWATCH_API_URL = 'https://apis.justwatch.com/graphql';

const POPULAR_TITLES_QUERY = `query GetPopularTitles($backdropProfile: BackdropProfile, $country: Country!, $first: Int! = 70, $format: ImageFormat, $language: Language!, $after: String, $popularTitlesFilter: TitleFilter, $popularTitlesSortBy: PopularTitlesSorting! = POPULAR, $profile: PosterProfile, $sortRandomSeed: Int! = 0, $watchNowFilter: WatchNowOfferFilter!, $offset: Int = 0, $creditsRole: CreditRole! = DIRECTOR) {
  popularTitles(
    country: $country
    filter: $popularTitlesFilter
    first: $first
    sortBy: $popularTitlesSortBy
    sortRandomSeed: $sortRandomSeed
    offset: $offset
    after: $after
  ) {
    __typename
    edges {
      cursor
      node {
        ...PopularTitleGraphql
        __typename
      }
      __typename
    }
    pageInfo {
      startCursor
      endCursor
      hasPreviousPage
      hasNextPage
      __typename
    }
    totalCount
  }
}

fragment PopularTitleGraphql on MovieOrShow {
  __typename
  id
  objectId
  objectType
  content(country: $country, language: $language) {
      externalIds {
        tmdbId
    imdbId
      }
   title
    fullPath
    originalReleaseYear
    shortDescription
    interactions {
      likelistAdditions
      dislikelistAdditions
      __typename
    }
    scoring {
      imdbVotes
      imdbScore
      tmdbPopularity
      tmdbScore
      tomatoMeter
      certifiedFresh
      jwRating
      __typename
    }
    interactions {
      votesNumber
      __typename
    }
    dailymotionClips: clips(providers: [DAILYMOTION]) {
      sourceUrl
      externalId
      provider
      streamUrl
      __typename
    }
    posterUrl(profile: $profile, format: $format)
    ... on MovieOrShowOrSeasonContent {
      backdrops(profile: $backdropProfile, format: $format) {
        backdropUrl
        __typename
      }
      __typename
    }
    isReleased
    credits(role: $creditsRole) {
      name
      personId
      __typename
    }
    runtime
    genres {
      translation(language: $language)
      shortName
      __typename
    }
    __typename
  }
  likelistEntry {
    createdAt
    __typename
  }
  dislikelistEntry {
    createdAt
    __typename
  }
  watchlistEntryV2 {
    createdAt
    __typename
  }
  customlistEntries {
    createdAt
    __typename
  }
  freeOffersCount: offerCount(
    country: $country
    platform: WEB
    filter: {monetizationTypes: [FREE, ADS]}
  )
  watchNowOffer(country: $country, platform: WEB, filter: $watchNowFilter) {
    ...WatchNowOffer
    __typename
  }
  ... on Movie {
    seenlistEntry {
      createdAt
      __typename
    }
    __typename
  }
  ... on Show {
    tvShowTrackingEntry {
      createdAt
      __typename
    }
    seenState(country: $country) {
      seenEpisodeCount
      progress
      __typename
    }
    __typename
  }
}

fragment WatchNowOffer on Offer {
  __typename
  id
  standardWebURL
  preAffiliatedStandardWebURL
  streamUrl
  package {
    id
    icon
    packageId
    clearName
    shortName
    technicalName
    iconWide(profile: S160)
    hasRectangularIcon(country: $country, platform: WEB)
    __typename
  }
  retailPrice(language: $language)
  retailPriceValue
  lastChangeRetailPriceValue
  currency
  presentationType
  monetizationType
  availableTo
  dateCreated
  newElementCount
}`;

const SINGLE_TITLE_QUERY = `query GetTitle($country: Country!, $language: Language!, $titleId: ID!) {
  node(id: $titleId) {
    ... on MovieOrShow {
      id
      objectId
      objectType
      content(country: $country, language: $language) {
        externalIds {
          tmdbId
          imdbId
        }
        title
        fullPath
        originalReleaseYear
        shortDescription
        scoring {
          imdbVotes
          imdbScore
          tmdbPopularity
          tmdbScore
          tomatoMeter
          certifiedFresh
          jwRating
        }
        posterUrl(profile: S718, format: JPG)
        backdrops(profile: S1920, format: JPG) {
          backdropUrl
        }
        isReleased
        runtime
        genres {
          translation(language: $language)
          shortName
        }
      }
    }
  }
}`;

const justWatchFetch = async <T>(options: {
	method?: 'GET' | 'POST';
	query: string;
	variables: Record<string, any>;
	operationName: string;
	logger?: Logger;
}): Promise<T> => {
	const { method = 'POST', query, variables, operationName, logger } = options;
	
	const reqBody = JSON.stringify({
		operationName,
		variables,
		query
	});

	const reqOpts: RequestInit = {
		method,
		headers: {
			'Content-Type': 'application/json',
		},
		body: reqBody
	};

	logger?.logOutgoingRequest(JUSTWATCH_API_URL, reqOpts);
	const response = await fetch(JUSTWATCH_API_URL, reqOpts);
	await logger?.logOutgoingRequestResponse(response, reqOpts);

	if (!response.ok) {
		response.body?.cancel();
		throw httpResponseError(JUSTWATCH_API_URL, response);
	}

	const responseData = await response.json() as JustWatchAPIResponse<T>;
	
	if (responseData.errors && responseData.errors.length > 0) {
		const error = responseData.errors[0];
		throw new Error(`JustWatch API error: ${error.message}`);
	}

	if (!responseData.data) {
		throw new Error('JustWatch API returned no data');
	}

	return responseData.data;
};

/**
 * Get popular titles from JustWatch
 */
export const getPopularTitles = async (params: {
	first?: number;
	objectType?: JustWatchObjectType;
	packages?: string[];
	country?: JustWatchCountry;
	language?: JustWatchLanguage;
	sortBy?: JustWatchSortBy;
	after?: string;
	genres?: string[];
	excludeGenres?: string[];
	monetizationTypes?: string[];
}, options: JustWatchAPIRequestOptions = {}): Promise<JustWatchPopularTitlesResponse['data']> => {
	const variables: JustWatchPopularTitlesVariables = {
		first: params.first || 15,
		popularTitlesSortBy: params.sortBy || JustWatchSortBy.Popular,
		sortRandomSeed: 0,
		offset: null,
		creditsRole: 'DIRECTOR',
		after: params.after || '',
		popularTitlesFilter: {
			ageCertifications: [],
			excludeGenres: params.excludeGenres || [],
			excludeProductionCountries: [],
			objectTypes: params.objectType ? [params.objectType] : [JustWatchObjectType.Movie],
			productionCountries: [],
			subgenres: [],
			genres: params.genres || [],
			packages: (params.packages || []).map(pkg => pkg.toLowerCase()),
			excludeIrrelevantTitles: false,
			presentationTypes: [],
			monetizationTypes: params.monetizationTypes || [],
			searchQuery: ''
		},
		watchNowFilter: {
			packages: (params.packages || []).map(pkg => pkg.toLowerCase()),
			monetizationTypes: params.monetizationTypes || []
		},
		language: params.language || JustWatchLanguage.English,
		country: params.country || JustWatchCountry.Netherlands
	};

	const response = await justWatchFetch<JustWatchPopularTitlesResponse['data']>({
		query: POPULAR_TITLES_QUERY,
		variables,
		operationName: 'GetPopularTitles',
		logger: options.logger
	});

	return response;
};

/**
 * Get a single title by ID from JustWatch
 */
export const getTitle = async (titleId: string, params: {
	country?: JustWatchCountry;
	language?: JustWatchLanguage;
} = {}, options: JustWatchAPIRequestOptions = {}): Promise<JustWatchTitle | null> => {
	const variables: JustWatchSingleTitleVariables = {
		titleId,
		language: params.language || JustWatchLanguage.English,
		country: params.country || JustWatchCountry.Netherlands
	};

	const response = await justWatchFetch<JustWatchSingleTitleResponse['data']>({
		query: SINGLE_TITLE_QUERY,
		variables,
		operationName: 'GetTitle',
		logger: options.logger
	});

	return response.node as JustWatchTitle || null;
};
