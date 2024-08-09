
import * as pseuLetterboxd from './letterboxd';
import * as plexTypes from '../plex/types';
import {
	XML_ATTRIBUTES_CHAR } from '../constants';

const pseuplex = {
	letterboxd: {
		sectionID: -1,
		sectionGuid: "910db620-6c87-475c-9c33-0308d50f01b0",
		sectionTitle: "Letterboxd Films",
		metadata: {
			basePath: '/pseuplex/letterboxd/metadata',
			get: async (slugs: string[]) => {
				const metadatas = await pseuLetterboxd.getLetterboxdMetadataItems(slugs, {
					letterboxdMetadataBasePath: pseuplex.letterboxd.metadata.basePath
				});
				return {
					MediaContainer: {
						[XML_ATTRIBUTES_CHAR]: {
							size: metadatas.length,
							allowSync: false,
							augmentationKey: '/library/metadata/augmentations/1',
							librarySectionID: pseuplex.letterboxd.sectionID,
							librarySectionTitle: pseuplex.letterboxd.sectionTitle,
							librarySectionUUID: pseuplex.letterboxd.sectionGuid
						},
						Metadata: metadatas
					}
				};
			}
		},
		
		hubs: {
			userFollowingActivity: {
				path: '/pseuplex/letterboxd/hubs/activity/following',
				get: async (params: pseuLetterboxd.LetterboxdUserFeedHubParams) => {
					return {
						MediaContainer: {
							[XML_ATTRIBUTES_CHAR]: {
								size: 1,
								allowSync: false,
								librarySectionID: pseuplex.letterboxd.sectionID,
								librarySectionTitle: pseuplex.letterboxd.sectionTitle,
								librarySectionUUID: pseuplex.letterboxd.sectionGuid
							},
							Hub: [
								await pseuLetterboxd.letterboxdUserFollowingActivityFeedHub(params, {
									title: `${params.username}'s Letterboxd Following Feed`,
									context: 'hub.letterboxd.following',
									hubPath: pseuplex.letterboxd.hubs.userFollowingActivity.path,
									style: plexTypes.PlexHubStyle.Hero,
									letterboxdMetadataBasePath: pseuplex.letterboxd.hubs.userFollowingActivity.path
								})
							]
						}
					};
				}
			}
		}
	}
};

export default pseuplex;
