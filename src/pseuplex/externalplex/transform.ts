import qs from 'querystring';
import * as plexTypes from '../../plex/types';
import {
	PseuplexMetadataItem,
	PseuplexMetadataSource,
	PseuplexRequestContext
} from '../types';
import { PseuplexMetadataTransformOptions } from '../metadata';
import {
	PseuplexPartialMetadataIDParts,
	stringifyPseuplexMetadataID,
	stringifyPartialPseuplexMetadataID,
	parsePseuplexMetadataIDStringFromItem,
	stringifyPseuplexMetadataKeyFromIDString
} from '../metadataidentifier';
import { nonexistantMediaItems } from '../media';

export const createPartialExternalPlexMetadataIdParts = (opts: {serverURL: string, metadataId: string}): PseuplexPartialMetadataIDParts => {
	return {
		directory: opts.serverURL,
		id: opts.metadataId
	};
};

export const createPartialExternalPlexMetadataId = (opts: {serverURL: string, metadataId: string}): string => {
	return stringifyPartialPseuplexMetadataID(createPartialExternalPlexMetadataIdParts(opts));
};

export const createFullExternalPlexMetadataId = (opts:{serverURL: string, metadataId: string, asUrl: boolean}): string => {
	return stringifyPseuplexMetadataID({
		isURL: opts.asUrl,
		source: PseuplexMetadataSource.PlexServer,
		directory: opts.serverURL,
		id: opts.metadataId
	});
};

export const transformExternalPlexMetadata = (metadataItem: plexTypes.PlexMetadataItem, serverURL: string, context: PseuplexRequestContext, transformOpts: PseuplexMetadataTransformOptions): PseuplexMetadataItem => {
	const pseuMetadataItem = metadataItem as PseuplexMetadataItem;
	delete pseuMetadataItem.Media;
	delete pseuMetadataItem.userState;
	delete pseuMetadataItem.Collection;
	delete pseuMetadataItem.primaryExtraKey;
	delete pseuMetadataItem.availabilityId;
	delete pseuMetadataItem.streamingMediaId;
	for(const person of [
		...(pseuMetadataItem.Writer ?? []),
		...(pseuMetadataItem.Role ?? []),
		...(pseuMetadataItem.Director ?? []),
		...(pseuMetadataItem.Producer ?? []),
	]) {
		if(!person.tagKey) {
			if(person.id) {
				person.tagKey = `${person.id}`;
			}
		}
	}
	const extMetadataId = parsePseuplexMetadataIDStringFromItem(pseuMetadataItem);
	if(extMetadataId) {
		const fullMetadataId = createFullExternalPlexMetadataId({
			serverURL,
			metadataId: extMetadataId,
			asUrl: false
		});
		pseuMetadataItem.ratingKey = fullMetadataId;
		pseuMetadataItem.key = stringifyPseuplexMetadataKeyFromIDString(fullMetadataId);
		pseuMetadataItem.Pseuplex = {
			isOnServer: false,
			unavailable: true,
			metadataIds: {},
			externalPlexMetadataIds: {
				[serverURL]: extMetadataId
			},
		};
	} else {
		console.error("Failed to parse metadataId from external plex metadata item");
	}
	// dont include this for the older (non react native) Android app
	pseuMetadataItem.Media = nonexistantMediaItems({
		unavailable: transformOpts.includeMetadataUnavailability,
	}, context);
	return pseuMetadataItem;
};
