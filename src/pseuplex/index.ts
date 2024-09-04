
import qs from 'querystring';
import { CachedFetcher } from '../fetching/CachedFetcher';
import * as plexTypes from '../plex/types';
import * as plexServerAPI from '../plex/api';
import { parseMetadataIDFromKey } from '../plex/utils';
import {
	PseuplexMetadataSource,
	PseuplexMetadataPage,
	PseuplexMetadataItem
} from './types';
import {
	PseuplexPartialMetadataIDString,
	stringifyPartialMetadataID,
	parseMetadataID,
	PseuplexMetadataIDParts,
	PseuplexMetadataIDString,
	stringifyMetadataID
} from './metadataidentifier';
import {
	PseuplexMetadataParams,
	PseuplexMetadataProvider
} from './metadata';
import {
	PseuplexHub,
	PseuplexHubProvider
} from './hub';
import {  } from './hub';
import {
	LetterboxdMetadataProvider,
	createLetterboxdUserFollowingFeedHub,
	createSimilarItemsHub
} from './letterboxd';
import {
	httpError
} from '../utils';


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
			userFollowingActivity: new class extends PseuplexHubProvider {
				path = '/pseuplex/letterboxd/hubs/following';
				override fetch(letterboxdUsername: string): PseuplexHub | Promise<PseuplexHub> {
					// TODO validate that the profile exists
					return createLetterboxdUserFollowingFeedHub(letterboxdUsername, {
						hubPath: `${this.path}?letterboxdUsername=${letterboxdUsername}`,
						style: plexTypes.PlexHubStyle.Shelf,
						promoted: true,
						uniqueItemsOnly: true,
						letterboxdMetadataProvider: pseuplex.letterboxd.metadata
					});
				}
			}(),

			similar: {
				relativePath: '/similar',
				async get(metadataId: PseuplexPartialMetadataIDString): Promise<PseuplexHub> {
					return createSimilarItemsHub(metadataId, {
						relativePath: pseuplex.letterboxd.hubs.similar.relativePath,
						title: "Similar Films",
						style: plexTypes.PlexHubStyle.Shelf,
						promoted: true,
						letterboxdMetadataProvider: pseuplex.letterboxd.metadata
					});
				}
			}
		}
	},

	getMetadataProvider: (source: PseuplexMetadataSource): (PseuplexMetadataProvider | null) => {
		switch(source) {
			case PseuplexMetadataSource.Letterboxd:
				return pseuplex.letterboxd.metadata;
		}
		return null;
	},
	
	getMetadata: async (metadataIds: (PseuplexMetadataIDParts | PseuplexMetadataIDString)[], params: PseuplexMetadataParams): Promise<PseuplexMetadataPage> => {
		let caughtError: Error | undefined = undefined;
		const providerParams: PseuplexMetadataParams = {
			...params
		};
		if(!providerParams.metadataBasePath) {
			providerParams.metadataBasePath = '/library/metadata';
			if(providerParams.qualifiedMetadataIds == null) {
				providerParams.qualifiedMetadataIds = true;
			}
		}
		const metadataItems = (await Promise.all(metadataIds.map(async (metadataId) => {
			if(typeof metadataId === 'string') {
				metadataId = parseMetadataID(metadataId);
			}
			try {
				let source = metadataId.source;
				if (!source) {
					source = PseuplexMetadataSource.Plex;
				}
				const provider = pseuplex.getMetadataProvider(source);
				if(provider) {
					// fetch from provider
					const partialId = stringifyPartialMetadataID(metadataId);
					return (await provider.get([partialId], providerParams)).MediaContainer.Metadata;
				} else if(source == PseuplexMetadataSource.Plex) {
					// fetch from plex
					const fullMetadataId = stringifyMetadataID(metadataId);
					return [].concat((await plexServerAPI.getLibraryMetadata([fullMetadataId], {
						params: params.plexParams,
						serverURL: params.plexServerURL,
						authContext: params.plexAuthContext
					})).MediaContainer.Metadata).map((metadata: PseuplexMetadataItem) => {
						metadata.Pseuplex = {
							metadataId: fullMetadataId,
							isOnServer: true
						}
						return metadata;
					});
				} else {
					// TODO handle other source type
					return [];
				}
			} catch(error) {
				if(!caughtError) {
					caughtError = error;
				}
			}
		}))).reduce<PseuplexMetadataItem[]>((accumulator, element) => {
			if(element) {
				accumulator = accumulator.concat(element);
			}
			return accumulator;
		}, []);
		if(metadataItems.length == 0) {
			if(caughtError) {
				throw caughtError;
			}
			throw httpError(404, "Not Found");
		}
		return {
			MediaContainer: {
				size: metadataItems.length,
				allowSync: false,
				identifier: plexTypes.PlexPluginIdentifier.PlexAppLibrary,
				Metadata: metadataItems
			}
		};
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
			let metadatas = (await pseuplex.letterboxd.metadata.get(slugs, {
				plexServerURL: options.plexServerURL,
				plexAuthContext: options.plexAuthContext,
				includeDiscoverMatches: false,
				includeUnmatched: false,
				transformMatchKeys: false
			})).MediaContainer.Metadata;
			if(!metadatas) {
				return uri;
			}
			if(!(metadatas instanceof Array)) {
				metadatas = [metadatas];
			}
			if(metadatas.length <= 0) {
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
