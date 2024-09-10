
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
	PseuplexHub,
	PseuplexHubContext,
	PseuplexHubPage,
	PseuplexHubPageParams
} from '../hub';
import * as lbtransform from './transform';
import { LetterboxdMetadataProvider } from './metadata';
import {
	LetterboxdHub,
	LetterboxdHubPage
} from './hub';
import { LetterboxdActivityFeedHub } from './activityfeedhub';
import { PseuplexMetadataSource } from '../types';


export const createLetterboxdUserFollowingFeedHub = (letterboxdUsername: string, options: {
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
		return letterboxd.getUserFollowingFeed(letterboxdUsername, {
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
	return new class extends LetterboxdHub {
		override async fetchPage(params: PseuplexHubPageParams, context: PseuplexHubContext): Promise<LetterboxdHubPage> {
			const page = await letterboxd.getSimilar(filmOpts);
			let pageItems = page.items;
			let hasMore = false;
			const totalCount = pageItems.length;
			const start = Math.max(params.start ?? 0, 0);
			if(params.count == null && options.defaultCount != null) {
				params.count = options.defaultCount;
			}
			if((params.start ?? 0) > 0 || (params.count != null)) {
				const end = params.count != null ? start+Math.max(params.count ?? 0, 0) : undefined;
				if(end != null && end < pageItems.length) {
					hasMore = true;
				}
				pageItems = pageItems.slice(start, end);
			}
			return {
				items: pageItems,
				hasMore,
				totalItemCount: totalCount
			};
		}
	}({
		hubPath: hubPath,
		title: options.title,
		type: plexTypes.PlexMediaItemType.Movie,
		style: options.style,
		hubIdentifier: `${plexTypes.PlexMovieHubIdentifierType.Similar}.letterboxd`,
		context: `hub.${plexTypes.PlexMovieHubIdentifierType.Similar}.letterboxd`,
		promoted: options.promoted,
		metadataTransformOptions: metadataTransformOpts,
		letterboxdMetadataProvider: options.letterboxdMetadataProvider
	});
};
