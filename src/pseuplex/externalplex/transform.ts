
import * as plexTypes from '../../plex/types';
import { PseuplexMetadataItem } from '../types';

export const transformExternalPlexMetadata = (metadataItem: plexTypes.PlexMetadataItem, serverURL: string): PseuplexMetadataItem => {
	const pseuMetadataItem = metadataItem as PseuplexMetadataItem;
	delete pseuMetadataItem.Media;
	pseuMetadataItem.Pseuplex = {
		isOnServer: false
	};
	return pseuMetadataItem;
};
