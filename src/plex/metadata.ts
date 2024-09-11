
import { CachedFetcher } from '../fetching/CachedFetcher';
import * as plexTypes from './types';
import * as plexServerAPI from './api';
import { httpError } from '../utils';

export const createPlexServerIdToGuidCache = (options: {
	plexServerURL: string;
	plexAuthContext: plexTypes.PlexAuthContext;
	onFetchMetadataItem?: (id: string, metadata: plexTypes.PlexMetadataItem) => void;
}) => {
	return new CachedFetcher(async (id: string) => {
		let metadatas = (await plexServerAPI.getLibraryMetadata(id, {
			serverURL: options.plexServerURL,
			authContext: options.plexAuthContext
		}))?.MediaContainer?.Metadata;
		let metadata: plexTypes.PlexMetadataItem;
		if(metadatas instanceof Array) {
			metadata = metadatas[0];
		} else {
			metadata = metadatas;
		}
		if(!metadata) {
			throw httpError(404, "Not Found");
		}
		if(options.onFetchMetadataItem) {
			options.onFetchMetadataItem(id, metadata);
		}
		return metadata.guid;
	});
};
