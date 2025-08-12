import qs from 'querystring';
import * as plexTypes from '../../plex/types';
import { parseMetadataIDFromKey } from '../../plex/metadataidentifier';
import {
	PseuplexMetadataItem,
	PseuplexMetadataSource,
	PseuplexRequestContext
} from '../types';
import { PseuplexMetadataTransformOptions } from '../metadata';
import {
	PseuplexPartialMetadataIDParts,
	stringifyMetadataID,
	stringifyPartialMetadataID
} from '../metadataidentifier';
import { nonexistantMediaItems } from '../media';

export const createPartialExternalPlexMetadataIdParts = (opts: {serverURL: string, metadataId: string}): PseuplexPartialMetadataIDParts => {
	return {
		directory: opts.serverURL,
		id: opts.metadataId
	};
};

export const createPartialExternalPlexMetadataId = (opts: {serverURL: string, metadataId: string}): string => {
	return stringifyPartialMetadataID(createPartialExternalPlexMetadataIdParts(opts));
};

export const createFullExternalPlexMetadataId = (opts:{serverURL: string, metadataId: string, asUrl: boolean}): string => {
	return stringifyMetadataID({
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
	let metadataId = pseuMetadataItem.ratingKey;
	if(!metadataId) {
		metadataId = parseMetadataIDFromKey(pseuMetadataItem.key, '/library/metadata/')?.id;
		if(metadataId) {
			metadataId = qs.unescape(metadataId);
		}
	}
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
	if(metadataId) {
		const partialMetadataId = createPartialExternalPlexMetadataId({
			serverURL,
			metadataId,
		});
		const fullMetadataId = createFullExternalPlexMetadataId({
			serverURL,
			metadataId,
			asUrl: false
		});
		pseuMetadataItem.ratingKey = fullMetadataId;
		pseuMetadataItem.key = `${transformOpts.metadataBasePath}/${transformOpts.qualifiedMetadataIds ? fullMetadataId : partialMetadataId}`;
		pseuMetadataItem.Pseuplex = {
			isOnServer: false,
			unavailable: true,
			metadataIds: {},
			externalPlexMetadataIds: {
				[serverURL]: metadataId
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
