
import { CachedFetcher } from '../fetching/CachedFetcher';
import * as plexTypes from '../plex/types';
import {
	LetterboxdMetadataProvider,
	LetterboxdActivityFeedHub,
	createLetterboxdUserFollowingFeedHub
} from './letterboxd';

const pseuplex = {
	basePath: '/pseuplex',

	letterboxd: {
		sectionID: -1,
		sectionGuid: "910db620-6c87-475c-9c33-0308d50f01b0",
		sectionTitle: "Letterboxd Films",
		
		metadata: new LetterboxdMetadataProvider({
			basePath: '/pseuplex/letterboxd/metadata'
		}),
		
		hubs: {
			userFollowingActivity: {
				path: '/pseuplex/letterboxd/hubs/following',
				cache: new CachedFetcher<LetterboxdActivityFeedHub>(async (letterboxdUsername: string) => {
					// TODO validate that the profile exists
					return createLetterboxdUserFollowingFeedHub(letterboxdUsername, {
						hubPath: `${pseuplex.letterboxd.hubs.userFollowingActivity.path}?letterboxdUsername=${letterboxdUsername}`,
						letterboxdMetadataBasePath: pseuplex.letterboxd.metadata.basePath,
						style: plexTypes.PlexHubStyle.Shelf,
						promoted: true,
						uniqueItemsOnly: true
					});
				}),
				get: (letterboxdUsername: string): Promise<LetterboxdActivityFeedHub> => {
					return pseuplex.letterboxd.hubs.userFollowingActivity.cache.getOrFetch(letterboxdUsername);
				}
			}
		}
	}
};

export default pseuplex;
