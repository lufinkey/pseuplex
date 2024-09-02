import qs from 'querystring';
import * as plexTypes from '../../plex/types';
import { parseMetadataIDFromKey } from '../../plex/utils';
import {
	PseuplexMetadataSource,
	PseuplexMetadataItem
} from '../types';
import { PseuplexMetadataTransformOptions } from '../metadata';
import {
	stringifyMetadataID,
	stringifyPartialMetadataID
} from '../metadataidentifier';

export const createPartialMetadataId = (opts:{serverURL: string, metadataId: string}): string => {
	return stringifyPartialMetadataID({
		directory: opts.serverURL,
		id: opts.metadataId
	});
};

export const createFullMetadataId = (opts:{serverURL: string, metadataId: string, asUrl: boolean}): string => {
	return stringifyMetadataID({
		isURL: opts.asUrl,
		source: PseuplexMetadataSource.PlexServer,
		directory: opts.serverURL,
		id: opts.metadataId
	});
};

export const transformExternalPlexMetadata = (metadataItem: plexTypes.PlexMetadataItem, serverURL: string, transformOpts: PseuplexMetadataTransformOptions): PseuplexMetadataItem => {
	const pseuMetadataItem = metadataItem as PseuplexMetadataItem;
	delete pseuMetadataItem.Media;
	delete pseuMetadataItem.userState;
	let metadataId = pseuMetadataItem.ratingKey;
	if(!metadataId) {
		metadataId = parseMetadataIDFromKey(pseuMetadataItem.key, '/library/metadata/')?.id;
		if(metadataId) {
			metadataId = qs.unescape(metadataId);
		}
	}
	let fullMetadataId = createFullMetadataId({
		serverURL,
		metadataId,
		asUrl: false
	});
	pseuMetadataItem.key = `${transformOpts.metadataBasePath}/${transformOpts.qualifiedMetadataId ? fullMetadataId : metadataId}`;
	pseuMetadataItem.Pseuplex = {
		metadataId: fullMetadataId,
		isOnServer: false
	};
	return pseuMetadataItem;
};
