
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
	PseuplexMetadataProvider,
	PseuplexMetadataProviderParams
} from './metadata';
import {
	PseuplexHub,
	PseuplexHubProvider
} from './hub';
import * as pseuLetterboxd from './letterboxd';
import {
	httpError
} from '../utils';


export type PseuplexGeneralMetadataParams = PseuplexMetadataParams & {
	transformProviderMetadataItem?: (metadataItem: PseuplexMetadataItem, id: PseuplexPartialMetadataIDString, provider: PseuplexMetadataProvider) => PseuplexMetadataItem | Promise<PseuplexMetadataItem>;
	transformPlexMetadataItem?: (metadataItem: PseuplexMetadataItem, plexId: string) => PseuplexMetadataItem | Promise<PseuplexMetadataItem>;
};


const pseuplex = {
	basePath: '/pseuplex',

	letterboxd: {
		sectionID: -1,
		sectionGuid: "910db620-6c87-475c-9c33-0308d50f01b0",
		sectionTitle: "Letterboxd Films",
		
		metadata: new pseuLetterboxd.LetterboxdMetadataProvider({
			basePath: '/pseuplex/letterboxd/metadata'
		}),
		
		hubs: {
			userFollowingActivity: new class extends PseuplexHubProvider {
				path = '/pseuplex/letterboxd/hubs/following';
				override fetch(letterboxdUsername: string): PseuplexHub | Promise<PseuplexHub> {
					// TODO validate that the profile exists
					return pseuLetterboxd.createUserFollowingFeedHub(letterboxdUsername, {
						hubPath: `${this.path}?letterboxdUsername=${letterboxdUsername}`,
						style: plexTypes.PlexHubStyle.Shelf,
						promoted: true,
						uniqueItemsOnly: true,
						letterboxdMetadataProvider: pseuplex.letterboxd.metadata
					});
				}
			}(),

			similar: new class extends PseuplexHubProvider {
				relativePath = '/similar';
				override fetch(metadataId: PseuplexPartialMetadataIDString): PseuplexHub | Promise<PseuplexHub> {
					return pseuLetterboxd.createSimilarItemsHub(metadataId, {
						relativePath: pseuplex.letterboxd.hubs.similar.relativePath,
						title: "Similar Films on Letterboxd",
						style: plexTypes.PlexHubStyle.Shelf,
						promoted: true,
						letterboxdMetadataProvider: pseuplex.letterboxd.metadata,
						defaultCount: 12
					});
				}
			}()
		}
	},

	getMetadataProvider: (source: PseuplexMetadataSource): (PseuplexMetadataProvider | null) => {
		switch(source) {
			case PseuplexMetadataSource.Letterboxd:
				return pseuplex.letterboxd.metadata;
		}
		return null;
	},
	
	getMetadata: async (metadataIds: (PseuplexMetadataIDParts | PseuplexMetadataIDString)[], params: PseuplexGeneralMetadataParams): Promise<PseuplexMetadataPage> => {
		let caughtError: Error | undefined = undefined;
		// create provider params
		const providerParams: PseuplexMetadataProviderParams = {
			...params
		};
		delete (providerParams as PseuplexGeneralMetadataParams).transformProviderMetadataItem;
		delete (providerParams as PseuplexGeneralMetadataParams).transformPlexMetadataItem;
		providerParams.transformMetadataItem = params.transformProviderMetadataItem;
		if(!providerParams.metadataBasePath) {
			providerParams.metadataBasePath = '/library/metadata';
			if(providerParams.qualifiedMetadataIds == null) {
				providerParams.qualifiedMetadataIds = true;
			}
		}
		// get metadata for each id
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
					const metadatas = (await plexServerAPI.getLibraryMetadata([fullMetadataId], {
						params: params.plexParams,
						serverURL: params.plexServerURL,
						authContext: params.plexAuthContext
					})).MediaContainer.Metadata;
					// transform metadata
					let metadataItem = ((metadatas instanceof Array) ? metadatas[0] : metadatas) as PseuplexMetadataItem;
					if(!metadataItem) {
						return [];
					}
					metadataItem.Pseuplex = {
						metadataId: fullMetadataId,
						isOnServer: true
					}
					if(params.transformPlexMetadataItem) {
						metadataItem = await params.transformPlexMetadataItem(metadataItem, fullMetadataId);
					}
					return metadataItem;
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
