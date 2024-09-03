
import * as letterboxd from 'letterboxd-retriever';
import * as plexTypes from '../../plex/types';
import { PseuplexMetadataTransformOptions } from '../metadata';
import { LetterboxdMetadataProvider } from './metadata';
import { LetterboxdActivityFeedHub } from './activityfeedhub';

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
		hubIdentifier: `custom.letterboxdfollowing.${letterboxdUsername}`,
		context: 'hub.custom.letterboxdfollowing',
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
