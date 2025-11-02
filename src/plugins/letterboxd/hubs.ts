
import * as letterboxd from 'letterboxd-retriever';
import * as plexTypes from '../../plex/types';
import {
	PseuplexMetadataTransformOptions,
	PseuplexPartialMetadataIDString,
	qualifyPartialMetadataID,
	PseuplexHubSectionInfo,
	PseuplexMetadataPathTransformOptions,
	PseuplexHubMetadataTransformOptions,
	getMetadataTransformOptionsForHub,
} from '../../pseuplex';
import { ListFetchInterval } from '../../fetching/LoadableList';
import { RequestExecutor } from '../../fetching/RequestExecutor';
import * as lbtransform from './transform';
import { LetterboxdMetadataProvider } from './metadata';
import { LetterboxdActivityFeedHub } from './activityfeedhub';
import { LetterboxdFilmsHub } from './filmshub';
import { LetterboxdFilmListHub } from './filmlisthub';
import { Logger } from '../../logging';


export const createUserFollowingFeedHub = (letterboxdUsername: string, options: (PseuplexHubMetadataTransformOptions & {
	hubPath: string,
	style: plexTypes.PlexHubStyle,
	promoted?: boolean,
	uniqueItemsOnly: boolean,
	letterboxdMetadataProvider: LetterboxdMetadataProvider,
	section?: PseuplexHubSectionInfo,
	matchToPlexServerMetadata?: boolean,
	logger?: Logger,
	requestExecutor?: RequestExecutor,
})): LetterboxdActivityFeedHub => {
	const { requestExecutor } = options;
	const metadataTransformOptions = getMetadataTransformOptionsForHub(options.letterboxdMetadataProvider.basePath, options);
	return new LetterboxdActivityFeedHub({
		hubPath: options.hubPath,
		title: `Friends Activity on Letterboxd (${letterboxdUsername})`,
		type: plexTypes.PlexMediaItemType.Movie,
		hubIdentifier: `custom.letterboxd.activity.friends.${letterboxdUsername}`,
		context: 'hub.custom.letterboxd.activity.friends',
		defaultItemCount: 16,
		style: options.style,
		promoted: options.promoted,
		uniqueItemsOnly: options.uniqueItemsOnly,
		metadataTransformOptions,
		letterboxdMetadataProvider: options.letterboxdMetadataProvider,
		section: options.section,
		matchToPlexServerMetadata: options.matchToPlexServerMetadata,
		logger: options.logger,
	}, async (pageToken) => {
		const reqOpts: letterboxd.GetUserFollowingFeedOptions = {
			after: pageToken?.token ?? undefined,
			csrf: pageToken?.csrf ?? undefined
		};
		console.log(`Fetching user following feed for ${letterboxdUsername} (pageToken=${JSON.stringify(pageToken)})`);
		if(requestExecutor) {
			return await requestExecutor.do(async () => {
				return await letterboxd.getUserFollowingFeed(letterboxdUsername, reqOpts);
			});
		} else {
			return await letterboxd.getUserFollowingFeed(letterboxdUsername, reqOpts);
		}
	});
};


export const createSimilarItemsHub = async (metadataId: PseuplexPartialMetadataIDString, options: (PseuplexHubMetadataTransformOptions & {
	relativePath: string,
	title: string,
	style: plexTypes.PlexHubStyle,
	promoted?: boolean,
	letterboxdMetadataProvider: LetterboxdMetadataProvider,
	defaultCount?: number,
	section?: PseuplexHubSectionInfo,
	matchToPlexServerMetadata?: boolean,
	logger?: Logger,
	requestExecutor?: RequestExecutor,
})) => {
	const { requestExecutor } = options;
	const metadataTransformOptions = getMetadataTransformOptionsForHub(options.letterboxdMetadataProvider.basePath, options);
	const filmOpts = lbtransform.getFilmOptsFromPartialMetadataId(metadataId);
	const hubPath = `${options.letterboxdMetadataProvider.basePath}/${metadataId}/${options.relativePath}`;
	return new LetterboxdFilmsHub({
		hubPath: hubPath,
		title: options.title,
		type: plexTypes.PlexMediaItemType.Movie,
		style: options.style,
		hubIdentifier: `${plexTypes.PlexMovieHubIdentifierType.Similar}.letterboxd.${metadataId}`,
		context: `hub.${plexTypes.PlexMovieHubIdentifierType.Similar}.letterboxd`,
		promoted: options.promoted,
		defaultItemCount: options.defaultCount ?? 12,
		uniqueItemsOnly: true,
		listStartFetchInterval: 'never',
		letterboxdMetadataProvider: options.letterboxdMetadataProvider,
		metadataTransformOptions,
		section: options.section,
		matchToPlexServerMetadata: options.matchToPlexServerMetadata,
		logger: options.logger,
	}, async (pageHref: string | null) => {
		let opts: letterboxd.GetSimilarFilmsOptions;
		if(pageHref) {
			opts = {href:pageHref};
		} else {
			opts = filmOpts;
		}
		console.log(`Fetching letterboxd similar items hub for ${metadataId} (pageToken=${JSON.stringify(pageHref)})`);
		if(requestExecutor) {
			return await requestExecutor.do(async () => {
				return await letterboxd.getSimilarFilms(opts);
			});
		} else {
			return await letterboxd.getSimilarFilms(opts);
		}
	});
};


export const createListHub = async (listId: lbtransform.PseuplexLetterboxdListID, options: (PseuplexHubMetadataTransformOptions & {
	path: string,
	style: plexTypes.PlexHubStyle,
	promoted?: boolean,
	letterboxdMetadataProvider: LetterboxdMetadataProvider,
	defaultCount?: number,
	listStartFetchInterval?: ListFetchInterval,
	section?: PseuplexHubSectionInfo,
	matchToPlexServerMetadata?: boolean,
	logger?: Logger,
	requestExecutor?: RequestExecutor,
})) => {
	const { requestExecutor } = options;
	const metadataTransformOptions = getMetadataTransformOptionsForHub(options.letterboxdMetadataProvider.basePath, options);
	const listOpts = lbtransform.getFilmListOptsFromPartialListId(listId);
	return new LetterboxdFilmListHub({
		hubPath: options.path,
		title: `${listOpts.userSlug}'s ${listOpts.listSlug} list`,
		type: plexTypes.PlexMediaItemType.Movie,
		style: options.style,
		hubIdentifier: `${plexTypes.PlexGeneralHubIdentifierType.CustomCollection}.letterboxd.${listId}`,
		context: `hub.${plexTypes.PlexGeneralHubIdentifierType.CustomCollection}.letterboxd`,
		promoted: options.promoted,
		defaultItemCount: options.defaultCount ?? 12,
		uniqueItemsOnly: false,
		listStartFetchInterval: options.listStartFetchInterval,
		letterboxdMetadataProvider: options.letterboxdMetadataProvider,
		metadataTransformOptions,
		section: options.section,
		matchToPlexServerMetadata: options.matchToPlexServerMetadata,
		logger: options.logger,
	}, async (pageHref: string | null) => {
		let opts: letterboxd.GetFilmListOptions;
		if(pageHref) {
			opts = {href:pageHref};
		} else {
			opts = listOpts;
		}
		console.log(`Fetching letterboxd list ${listId} (pageToken=${JSON.stringify(pageHref)})`);
		if(requestExecutor) {
			return requestExecutor.do(async () => {
				return await letterboxd.getFilmList(opts);
			});
		} else {
			return await letterboxd.getFilmList(opts);
		}
	});
};
