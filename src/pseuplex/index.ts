
import {
	getLetterboxdMetadataItems,
	LetterboxdFeedHubParams,
	LetterboxdUserFollowingActivityFeedHub
} from './letterboxd';
import * as plexTypes from '../plex/types';

const letterboxdUserFollowingActivityLists: {
	[key: string]: LetterboxdUserFollowingActivityFeedHub
} = {};

const pseuplex = {
	letterboxd: {
		sectionID: -1,
		sectionGuid: "910db620-6c87-475c-9c33-0308d50f01b0",
		sectionTitle: "Letterboxd Films",

		metadata: {
			basePath: '/pseuplex/letterboxd/metadata',
			get: async (slugs: string[]): Promise<plexTypes.PlexMediaContainerPage> => {
				const metadatas = await getLetterboxdMetadataItems(slugs, {
					letterboxdMetadataBasePath: pseuplex.letterboxd.metadata.basePath
				});
				return {
					size: metadatas.length,
					allowSync: false,
					//augmentationKey: '/library/metadata/augmentations/1',
					librarySectionID: pseuplex.letterboxd.sectionID,
					librarySectionTitle: pseuplex.letterboxd.sectionTitle,
					librarySectionUUID: pseuplex.letterboxd.sectionGuid,
					Metadata: metadatas
				};
			}
		},
		
		hubs: {
			userFollowingActivity: {
				path: '/pseuplex/letterboxd/hubs/following',
				get: (letterboxdUsername: string): LetterboxdUserFollowingActivityFeedHub => {
					// TODO fetch profile
					let list = letterboxdUserFollowingActivityLists[letterboxdUsername];
					if(!list) {
						list = new LetterboxdUserFollowingActivityFeedHub({
							hubPath: `${pseuplex.letterboxd.hubs.userFollowingActivity.path}?letterboxdUsername=${letterboxdUsername}`,
							context: `hub.custom.letterboxdfollowing.${letterboxdUsername}`,
							letterboxdMetadataBasePath: pseuplex.letterboxd.metadata.basePath,
							letterboxdUsername: letterboxdUsername,
							defaultItemCount: 16,
							style: plexTypes.PlexHubStyle.Shelf,
							promoted: true,
							uniqueItemsOnly: true
						});
						letterboxdUserFollowingActivityLists[letterboxdUsername] = list;
					}
					return list;
				}
			}
		}
	}
};

export default pseuplex;
