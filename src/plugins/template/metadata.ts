
import qs from 'querystring';
import * as plexTypes from '../../plex/types';
import {
	PseuplexMetadataItem,
	PseuplexMetadataProviderBase,
	PseuplexMetadataProviderItemMatchParams,
	PseuplexMetadataTransformOptions,
	PseuplexPartialMetadataIDString,
	PseuplexRequestContext,
} from '../../pseuplex';
import * as tmplTransform from './transform';


export type TemplateMetadataItem = {
	id: string;
	type: 'movie' | 'tv'
	title: string;
	year: number | string;
	tvdbId: string;
};

export class TemplateMetadataProvider extends PseuplexMetadataProviderBase<TemplateMetadataItem> {
	readonly sourceDisplayName = "Template";
	readonly sourceSlug = '<metadata_source_name>';

	override async fetchMetadataItem(id: PseuplexPartialMetadataIDString): Promise<TemplateMetadataItem> {
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
		return tmplTransform.templateItemToPlexMetadata(metadataItem, context, transformOpts);
	}

	override idFromMetadataItem(metadataItem: TemplateMetadataItem): PseuplexPartialMetadataIDString {
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
			title: metadataItem.title,
			year: metadataItem.year,
			types,
			guids: [
				`tvdb://${metadataItem.tvdbId}`
			]
		};
	}

	override async findMatchForPlexItem(metadataItem: plexTypes.PlexMetadataItem): Promise<TemplateMetadataItem | null> {
		// TODO find matching item from this metadata provider for a given plex item
		return null;
	}
}
