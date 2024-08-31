
import * as letterboxd from 'letterboxd-retriever';
import * as plexTypes from '../../plex/types';
import { LetterboxdActivityFeedHub } from './activityfeedhub';

export const createLetterboxdUserFollowingFeedHub = (letterboxdUsername: string, options: {
	hubPath: string,
	letterboxdMetadataBasePath: string,
	style: plexTypes.PlexHubStyle,
	promoted: boolean,
	uniqueItemsOnly: boolean
}) => {
	return new LetterboxdActivityFeedHub({
		hubPath: options.hubPath,
		title: `${letterboxdUsername}'s letterboxd friends activity`,
		context: `hub.custom.letterboxdfollowing.${letterboxdUsername}`,
		letterboxdMetadataBasePath: options.letterboxdMetadataBasePath,
		defaultItemCount: 16,
		style: options.style,
		promoted: options.promoted,
		uniqueItemsOnly: options.uniqueItemsOnly,
		fetchPage: async (pageToken) => {
			return letterboxd.getUserFollowingFeed(letterboxdUsername, {
				after: pageToken?.token ?? undefined,
				csrf: pageToken?.csrf ?? undefined
			});
		}
	});
};
