
import * as letterboxd from 'letterboxd-retriever';
import * as plexTypes from '../../plex/types';
import { PseuplexMetadataTransformOptions } from '../metadata';
import { LetterboxdActivityFeedHub } from './activityfeedhub';
import { LetterboxdMetadataProvider } from './metadata';

export const createLetterboxdUserFollowingFeedHub = (letterboxdUsername: string, options: {
	hubPath: string,
	style: plexTypes.PlexHubStyle,
	promoted: boolean,
	uniqueItemsOnly: boolean,
	metadataTransformOptions?: PseuplexMetadataTransformOptions,
	letterboxdMetadataProvider: LetterboxdMetadataProvider
}) => {
	return new LetterboxdActivityFeedHub({
		hubPath: options.hubPath,
		title: `${letterboxdUsername}'s letterboxd friends activity`,
		hubIdentifier: `custom.letterboxdfollowing.${letterboxdUsername}`,
		context: 'hub.custom.letterboxdfollowing',
		defaultItemCount: 16,
		style: options.style,
		promoted: options.promoted,
		uniqueItemsOnly: options.uniqueItemsOnly,
		metadataTransformOptions: options.metadataTransformOptions,
		letterboxdMetadataProvider: options.letterboxdMetadataProvider,
		fetchPage: async (pageToken) => {
			return letterboxd.getUserFollowingFeed(letterboxdUsername, {
				after: pageToken?.token ?? undefined,
				csrf: pageToken?.csrf ?? undefined
			});
		}
	});
};
