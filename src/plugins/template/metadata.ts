
import qs from 'querystring';
import * as plexTypes from '../../plex/types';
import {
	PseuplexMetadataItem,
	PseuplexMetadataProviderBase,
	PseuplexMetadataProviderItemMatchParams,
	PseuplexMetadataTransformOptions,
	PseuplexPartialMetadataIDString,
	PseuplexRequestContext,
	PseuplexProviderFetchMetadataItemOptions,
} from '../../pseuplex';
import * as tmplTransform from './transform';

// replace this object with the object from your custom metadata api
export type TemplateMetadataItem = {
	id: string;
	type: 'movie' | 'tv'
	title: string;
	year: number | string;
	tvdbId: string;
};

export class TemplateMetadataProvider extends PseuplexMetadataProviderBase<TemplateMetadataItem> {
	readonly sourceDisplayName = "Template";
	readonly sourceSlug = 'templatesource'; // replace this with a slug for your source. For example: "letterboxd"

	override async fetchMetadataItem(id: PseuplexPartialMetadataIDString, options: PseuplexProviderFetchMetadataItemOptions): Promise<TemplateMetadataItem> {
		// TODO fetch raw metadata item from id
		return {
			id: 'test1212',
			type: 'movie',
			title: "Shrek",
			year: 2006,
			tvdbId: '325'
		};
	}

	override transformMetadataItem(metadataItem: TemplateMetadataItem, context: PseuplexRequestContext, transformOpts: PseuplexMetadataTransformOptions): PseuplexMetadataItem {
		// transform your source's metadata item into a plex metadata item
		return tmplTransform.templateItemToPlexMetadata(metadataItem, context, transformOpts);
	}

	override idFromMetadataItem(metadataItem: TemplateMetadataItem): PseuplexPartialMetadataIDString {
		// Create a "partial metadata id" for your metadata item.
		// This just means an ID thats only relevant to your provider
		// For example: "film:legend"
		// A "full" metadata id (not partial) would be something like "letterboxd:film:legend"
		return tmplTransform.partialMetadataIdFromTemplateItem(metadataItem);
	}

	override getPlexMatchParams(metadataItem: TemplateMetadataItem): PseuplexMetadataProviderItemMatchParams {
		// TODO give parameters to find a matching plex item from the given metadata item
		let types: plexTypes.PlexMediaItemTypeNumeric[];
		switch(metadataItem.type) {
			case 'movie':
				types = [plexTypes.PlexMediaItemTypeNumeric.Movie];
				break;

			case 'tv':
				types = [plexTypes.PlexMediaItemTypeNumeric.Show];
				break;

			default:
				types = [plexTypes.PlexMediaItemTypeNumeric.Movie, plexTypes.PlexMediaItemTypeNumeric.Show];
				break;
		}
		return {
			// title and year will be used as a fallback if guids can't be matched
			title: metadataItem.title,
			year: metadataItem.year,
			types,
			guids: [
				// guids are the main mechanism for matching plex metadata from external sources
				`tvdb://${metadataItem.tvdbId}`
			]
		};
	}

	override async findMatchForPlexItem(metadataItem: plexTypes.PlexMetadataItem): Promise<TemplateMetadataItem | null> {
		// TODO find matching item from this metadata provider for a given plex item
		return null;
	}
}
