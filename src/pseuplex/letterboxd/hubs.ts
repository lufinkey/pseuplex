
import * as letterboxd from 'letterboxd-retriever';
import * as plexTypes from '../../plex/types';
import {
	parsePartialMetadataID,
	PseuplexPartialMetadataIDString,
	qualifyPartialMetadataID,
	stringifyMetadataID
} from '../metadataidentifier';
import { PseuplexMetadataTransformOptions } from '../metadata';
import {
	PseuplexHubContext
} from '../hub';
import * as lbtransform from './transform';
import { LetterboxdMetadataProvider } from './metadata';
import { LetterboxdActivityFeedHub } from './activityfeedhub';
import { PseuplexMetadataSource } from '../types';
import { PseuplexFeedHub } from '../feedhub';


export const createUserFollowingFeedHub = (letterboxdUsername: string, options: {
	hubPath: string,
	style: plexTypes.PlexHubStyle,
	promoted: boolean,
	uniqueItemsOnly: boolean,
	metadataTransformOptions?: PseuplexMetadataTransformOptions,
	letterboxdMetadataProvider: LetterboxdMetadataProvider
}): LetterboxdActivityFeedHub => {
	return new LetterboxdActivityFeedHub({
		hubPath: options.hubPath,
		title: `${letterboxdUsername}'s letterboxd friends activity`,
		type: plexTypes.PlexMediaItemType.Movie,
		hubIdentifier: `custom.letterboxd.activity.friends.${letterboxdUsername}`,
		context: 'hub.custom.letterboxd.activity.friends',
		defaultItemCount: 16,
		style: options.style,
		promoted: options.promoted,
		uniqueItemsOnly: options.uniqueItemsOnly,
		metadataTransformOptions: options.metadataTransformOptions ?? {
			metadataBasePath: options.letterboxdMetadataProvider.basePath,
			qualifiedMetadataId: false
		},
		letterboxdMetadataProvider: options.letterboxdMetadataProvider
	}, async (pageToken) => {
		return await letterboxd.getUserFollowingFeed(letterboxdUsername, {
			after: pageToken?.token ?? undefined,
			csrf: pageToken?.csrf ?? undefined
		});
	});
};


export const createSimilarItemsHub = async (metadataId: PseuplexPartialMetadataIDString, options: {
	relativePath: string,
	title: string,
	style: plexTypes.PlexHubStyle,
	promoted: boolean,
	metadataTransformOptions?: PseuplexMetadataTransformOptions,
	letterboxdMetadataProvider: LetterboxdMetadataProvider,
	defaultCount?: number
}) => {
	const metadataTransformOpts: PseuplexMetadataTransformOptions = options.metadataTransformOptions ?? {
		metadataBasePath: options.letterboxdMetadataProvider.basePath,
		qualifiedMetadataId: false
	};
	const filmOpts = lbtransform.getFilmOptsFromPartialMetadataId(metadataId);
	const metadataIdInPath = metadataTransformOpts.qualifiedMetadataId
		? qualifyPartialMetadataID(metadataId, PseuplexMetadataSource.Letterboxd)
		: metadataId;
	const relativePath = options.relativePath.startsWith('/') ? options.relativePath : '/'+options.relativePath;
	const hubPath = `${metadataTransformOpts.metadataBasePath}/${metadataIdInPath}${relativePath}`;
	return new class extends PseuplexFeedHub<letterboxd.Film,void,string> {
		override get metadataBasePath() {
			return metadataTransformOpts.metadataBasePath;
		}

		override parseItemTokenParam(itemToken: string): void {
			return undefined;
		}

		override compareItemTokens(itemToken1: void, itemToken2: void): number {
			return 1;
		}

		override async fetchPage(pageToken: string | null) {
			const page = await letterboxd.getSimilar(filmOpts);
			return {
				items: page.items.map((film) => {
					return {
						id: film.href,
						token: undefined,
						item: film
					};
				}),
				hasMore: false,
				totalItemCount: page.items?.length ?? 0,
				nextPageToken: null
			};
		}

		override async transformItem(item: letterboxd.Film, context: PseuplexHubContext): Promise<plexTypes.PlexMetadataItem> {
			return await lbtransform.transformLetterboxdFilmHubEntry(item, context, options.letterboxdMetadataProvider, metadataTransformOpts);
		}
	}({
		hubPath: hubPath,
		title: options.title,
		type: plexTypes.PlexMediaItemType.Movie,
		style: options.style,
		hubIdentifier: `${plexTypes.PlexMovieHubIdentifierType.Similar}.letterboxd`,
		context: `hub.${plexTypes.PlexMovieHubIdentifierType.Similar}.letterboxd`,
		promoted: options.promoted,
		defaultItemCount: options.defaultCount ?? 12,
		uniqueItemsOnly: true,
		listStartFetchInterval: 'never'
	});
};
