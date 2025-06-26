import qs from 'querystring';
import * as bandcamp from 'bandcamp-retriever';
import * as plexTypes from '../../plex/types';
import {
	PseuplexMetadataItem,
	PseuplexMetadataProviderBase,
	PseuplexMetadataTransformOptions,
	PseuplexPartialMetadataIDString,
	PseuplexMetadataSource,
	PseuplexMetadataProviderOptions,
	parsePartialMetadataID,
	PseuplexMetadataProviderItemMatchParams,
	PseuplexProviderFetchMetadataItemOptions,
	PseuplexRequestContext,
} from '../../pseuplex';
import { BandcampMetadataItem } from './types';
import * as bcTransform from './transform';
import { BandcampPluginDef } from './plugindef';

export type BandcampMetadataProviderOptions = PseuplexMetadataProviderOptions & {
	plugin: BandcampPluginDef;
};

export class BandcampMetadataProvider extends PseuplexMetadataProviderBase<BandcampMetadataItem> {
	readonly sourceDisplayName = "Bandcamp";
	readonly sourceSlug = PseuplexMetadataSource.Bandcamp;
	readonly plugin: BandcampPluginDef;

	constructor(options: BandcampMetadataProviderOptions) {
		super(options);
		this.plugin = options.plugin;
	}

	override async fetchMetadataItem(id: PseuplexPartialMetadataIDString, options: PseuplexProviderFetchMetadataItemOptions): Promise<BandcampMetadataItem> {
		const bandcampClient = this.plugin.bandcampClientForPlexUser(options.context.plexUserInfo);
		const idParts = parsePartialMetadataID(id);
		switch(idParts.directory) {
			case bandcamp.BandcampItemType.Track:
				return await bandcampClient.getTrack(idParts.id);
			case bandcamp.BandcampItemType.Album:
				return await bandcampClient.getAlbum(idParts.id);
			case bandcamp.BandcampItemType.Artist:
			case bandcamp.BandcampItemType.Label:
				return await bandcampClient.getArtist(idParts.id);
			//case bandcamp.BandcampItemType.Fan:
			//	return await this.bandcampClient.getFan(idParts.id);
		}
		return (await bandcampClient.getItemFromURL(idParts.id)) as BandcampMetadataItem;
	}

	override transformMetadataItem(metadataItem: BandcampMetadataItem, context: PseuplexRequestContext, options: PseuplexMetadataTransformOptions): PseuplexMetadataItem {
		return bcTransform.bandcampItemToPlexMetadata(metadataItem, context, options);
	}

	override idFromMetadataItem(metadataItem: BandcampMetadataItem): PseuplexPartialMetadataIDString {
		return bcTransform.partialMetadataIdFromBandcampItem(metadataItem);
	}

	override getPlexMatchParams(metadataItem: BandcampMetadataItem): (PseuplexMetadataProviderItemMatchParams | null) {
		// TODO fetch musicbrainz id and return it in the guids
		return null;
	}

	override async findMatchForPlexItem(metadataItem: plexTypes.PlexMetadataItem): Promise<BandcampMetadataItem | null> {
		// TODO find matching item from this metadata provider for a given plex item
		return null;
	}
}
