
import qs from 'querystring';
import { CachedFetcher } from '../fetching/CachedFetcher';
import * as plexTypes from '../plex/types';
import { parseMetadataIDFromKey } from '../plex/utils';
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
	},

	resolvePlayQueueURI: async (uri: string, options: {
		plexMachineIdentifier: string,
		plexServerURL: string,
		plexAuthContext: plexTypes.PlexAuthContext
	}): Promise<string> => {
		const uriParts = plexTypes.parsePlayQueueURI(uri);
		if(!uriParts.path || uriParts.machineIdentifier != options.plexMachineIdentifier) {
			return uri;
		}
		const letterboxdMetadataBasePath = pseuplex.letterboxd.metadata.basePath;
		if(uriParts.path.startsWith(letterboxdMetadataBasePath) && uriParts.path[letterboxdMetadataBasePath.length] == '/') {
			// handle letterboxd uri
			const idsStartIndex = letterboxdMetadataBasePath.length+1;
			let idsEndIndex = uriParts.path.indexOf('/', idsStartIndex);
			if(idsEndIndex == -1) {
				idsEndIndex = uriParts.path.length;
			}
			const slugs = uriParts.path.substring(idsStartIndex, idsEndIndex).split(',');
			const metadatas = (await pseuplex.letterboxd.metadata.get(slugs, {
				plexServerURL: options.plexServerURL,
				plexAuthContext: options.plexAuthContext,
				includeDiscoverMatches: false,
				includeUnmatched: false,
				transformMatchKeys: false
			})).MediaContainer.Metadata;
			if(!metadatas || metadatas.length <= 0) {
				return uri;
			} else if(metadatas.length == 1) {
				uriParts.path = `${metadatas[0].key}${uriParts.path.substring(idsEndIndex)}`;
			} else {
				const metadataIds = metadatas?.map((metadata) => {
					return parseMetadataIDFromKey(metadata.key, '/library/metadata/')?.id
				})?.filter((metadataId) => metadataId);
				if(!metadataIds || metadataIds.length == 0) {
					return uri;
				}
				uriParts.path = `/library/metadata/${metadataIds.join(',')}${uriParts.path.substring(idsEndIndex)}`;
			}
			const newUri = plexTypes.stringifyPlayQueueURIParts(uriParts);
			console.log(`mapped uri ${uri} to ${newUri}`);
			return newUri;
		}
		return uri;
	}
};

export default pseuplex;
