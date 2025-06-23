import {
	BandcampAlbum,
	BandcampFanFeed$Item,
	BandcampItemType,
	BandcampTrack
} from 'bandcamp-retriever';
import * as plexTypes from '../../plex/types';
import {
	PseuplexMetadataIDString,
	PseuplexMetadataItem,
	PseuplexMetadataSource,
	PseuplexMetadataTransformOptions,
	PseuplexPartialMetadataIDString,
	PseuplexRequestContext,
	stringifyMetadataID,
	stringifyPartialMetadataID
} from '../../pseuplex';
import { combinePathSegments } from '../../utils/misc';
import { BandcampMetadataItem } from './types';

type BandcampItemPropsForID = {
	type: BandcampItemType
	url: string
}

export const partialMetadataIdFromBandcampItem = (item: BandcampItemPropsForID): PseuplexPartialMetadataIDString => {
	return stringifyPartialMetadataID({
		directory: item.type,
		id: item.url,
	});
};

export const fullMetadataIdFromBandcampItem = (item: BandcampItemPropsForID, opts?: {asUrl?: boolean}): PseuplexMetadataIDString => {
	return stringifyMetadataID({
		isURL: opts?.asUrl,
		source: PseuplexMetadataSource.Bandcamp,
		directory: item.type,
		id: item.url,
	});
};

export const plexTypeFromBandcampItemType = (itemType: BandcampItemType): plexTypes.PlexMediaItemType => {
	switch(itemType) {
		case BandcampItemType.Track:
			return plexTypes.PlexMediaItemType.Track;
		case BandcampItemType.Album:
			return plexTypes.PlexMediaItemType.Album;
		case BandcampItemType.Artist:
		case BandcampItemType.Label:
			return plexTypes.PlexMediaItemType.Artist;
	}
	throw new Error(`Invalid or unsupported bandcamp item type ${itemType}`);
};

export const yearFromBandcampItem = (item: BandcampMetadataItem): (number | undefined) => {
	const trackOrAlbum = (item as (BandcampAlbum | BandcampTrack));
	if(trackOrAlbum.releaseDate) {
		try {
			const releaseDateParsed = new Date(trackOrAlbum.releaseDate);
			return releaseDateParsed.getFullYear();
		} catch(error) {
			console.error(error);
		}
	}
	return undefined;
}

export const bandcampItemToPlexMetadata = (item: BandcampMetadataItem, context: PseuplexRequestContext, options: PseuplexMetadataTransformOptions): PseuplexMetadataItem => {
	const partialMetadataId = partialMetadataIdFromBandcampItem(item);
	const fullMetadataId = fullMetadataIdFromBandcampItem(item, {asUrl:false});
	return {
		// guid: fullMetadataIdFromBandcampItem(item, {asUrl:true}),
		key: combinePathSegments(options.metadataBasePath, options.qualifiedMetadataIds ? fullMetadataId : partialMetadataId),
		ratingKey: fullMetadataId,
		type: plexTypeFromBandcampItemType(item.type),
		title: item.name,
		art: item.images[0]?.url,
		summary: item.description,
		year: yearFromBandcampItem(item),
		Pseuplex: {
			isOnServer: false,
			unavailable: true, // TODO set based on playabale tracks
			metadataIds: {
				[PseuplexMetadataSource.Bandcamp]: partialMetadataId
			}
		},
	};
};

export const fanFeedItemToPlexMetadata = (item: BandcampFanFeed$Item, options: PseuplexMetadataTransformOptions): PseuplexMetadataItem => {
	const partialMetadataId = partialMetadataIdFromBandcampItem(item);
	const fullMetadataId = fullMetadataIdFromBandcampItem(item, {asUrl:false});
	return {
		// guid: fullMetadataIdFromBandcampItem(item, {asUrl:true}),
		key: combinePathSegments(options.metadataBasePath, options.qualifiedMetadataIds ? fullMetadataId : partialMetadataId),
		ratingKey: fullMetadataId,
		type: plexTypeFromBandcampItemType(item.type),
		title: item.name,
		art: item.images[0]?.url,
		Pseuplex: {
			isOnServer: false,
			unavailable: true, // TODO determine based on item properties
			metadataIds: {
				[PseuplexMetadataSource.Bandcamp]: partialMetadataId
			}
		},
	};
};
