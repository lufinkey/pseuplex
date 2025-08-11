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

export const partialMetadataIdFromTemplateItem = (item: any): PseuplexPartialMetadataIDString => {
	// TODO create a partial metadata ID from an item from your source
	return stringifyPartialMetadataID({
		directory: item.type,
		id: item.id,
	});
};

export const fullMetadataIdFromTemplateItem = (item: any, opts?: {asUrl?: boolean}): PseuplexMetadataIDString => {
	// TODO create a full metadata ID from an item from your source
	return stringifyMetadataID({
		isURL: opts?.asUrl,
		source: 'template', //PseuplexMetadataSource.Template,
		directory: item.type,
		id: item.id,
	});
};

export const templateItemToPlexMetadata = (item: any, context: PseuplexRequestContext, options: PseuplexMetadataTransformOptions): PseuplexMetadataItem => {
	// TODO convert your source's metadata to plex metadata
	const partialMetadataId = partialMetadataIdFromTemplateItem(item);
	const fullMetadataId = fullMetadataIdFromTemplateItem(item, {asUrl:false});
	return {
		// guid: fullMetadataIdFromTemplateItem(item, {asUrl:true}),
		key: combinePathSegments(options.metadataBasePath, options.qualifiedMetadataIds ? fullMetadataId : partialMetadataId),
		ratingKey: fullMetadataId,
		type: plexTypes.PlexMediaItemType.Movie,
		//slug: item.slug,
		title: item.name,
		art: item.backdropArtUrl,
		thumb: item.thumbUrl,
		tagline: item.shortDescription,
		summary: item.description,
		year: item.year,
		Pseuplex: {
			isOnServer: false,
			unavailable: true,
			metadataIds: {
				['template'/*PseuplexMetadataSource.Template*/]: partialMetadataId
			}
		},
	};
};
