
import * as pseuLetterboxd from './letterboxd';
import * as plexTypes from '../plex/types';

const pseuplex = {
	letterboxd: {
		sectionID: -1,
		sectionGuid: "910db620-6c87-475c-9c33-0308d50f01b0",
		sectionTitle: "Letterboxd Films",

		metadata: {
			basePath: '/pseuplex/letterboxd/metadata',
			cache: pseuLetterboxd.metadataCache,
			get: async (slugs: string[]): Promise<plexTypes.PlexMetadataPage> => {
				const metadataItems = await Promise.all(slugs.map((slug) => {
					return pseuLetterboxd.metadataCache.fetch(slug);
				}));
				const transformOpts: pseuLetterboxd.LetterboxdToPlexOptions = {
					letterboxdMetadataBasePath: pseuplex.letterboxd.metadata.basePath
				};
				const metadatas = metadataItems.map((item) => {
					return pseuLetterboxd.filmInfoToPlexMetadata(item, transformOpts);
				});
				return {
					MediaContainer: {
						size: metadatas.length,
						allowSync: false,
						//augmentationKey: '/library/metadata/augmentations/1',
						librarySectionID: pseuplex.letterboxd.sectionID,
						librarySectionTitle: pseuplex.letterboxd.sectionTitle,
						librarySectionUUID: pseuplex.letterboxd.sectionGuid,
						Metadata: metadatas
					}
				};
			}
		},
		
		hubs: {
			userFollowingActivity: {
				path: '/pseuplex/letterboxd/hubs/following',
				lists: {} as {[key: string]: pseuLetterboxd.LetterboxdUserFollowingActivityFeedHub},
				get: (letterboxdUsername: string): pseuLetterboxd.LetterboxdUserFollowingActivityFeedHub => {
					// TODO fetch profile
					let list = pseuplex.letterboxd.hubs.userFollowingActivity.lists[letterboxdUsername];
					if(!list) {
						list = new pseuLetterboxd.LetterboxdUserFollowingActivityFeedHub({
							hubPath: `${pseuplex.letterboxd.hubs.userFollowingActivity.path}?letterboxdUsername=${letterboxdUsername}`,
							context: `hub.custom.letterboxdfollowing.${letterboxdUsername}`,
							letterboxdMetadataBasePath: pseuplex.letterboxd.metadata.basePath,
							letterboxdUsername: letterboxdUsername,
							defaultItemCount: 16,
							style: plexTypes.PlexHubStyle.Shelf,
							promoted: true,
							uniqueItemsOnly: true,
							verbose: true
						});
						pseuplex.letterboxd.hubs.userFollowingActivity.lists[letterboxdUsername] = list;
					}
					return list;
				}
			}
		}
	}
};

export default pseuplex;
