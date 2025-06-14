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
	PseuplexRequestContext,
} from '../../pseuplex';
import { BandcampMetadataItem } from './types';
import * as bcTransform from './transform';

export type BandcampMetadataProviderOptions = PseuplexMetadataProviderOptions & {
	bandcampClient: bandcamp.Bandcamp;
};

export class BandcampMetadataProvider extends PseuplexMetadataProviderBase<BandcampMetadataItem> {
	readonly sourceDisplayName = "Bandcamp";
	readonly sourceSlug = PseuplexMetadataSource.Bandcamp;
	readonly bandcampClient: bandcamp.Bandcamp;

	constructor(options: BandcampMetadataProviderOptions) {
		super(options);
		this.bandcampClient = options.bandcampClient;
	}

	override async fetchMetadataItem(id: PseuplexPartialMetadataIDString): Promise<BandcampMetadataItem> {
		const idParts = parsePartialMetadataID(id);
		switch(idParts.directory) {
			case bandcamp.BandcampItemType.Track:
				return await this.bandcampClient.getTrack(idParts.id);
			case bandcamp.BandcampItemType.Album:
				return await this.bandcampClient.getAlbum(idParts.id);
			case bandcamp.BandcampItemType.Artist:
			case bandcamp.BandcampItemType.Label:
				return await this.bandcampClient.getArtist(idParts.id);
			//case bandcamp.BandcampItemType.Fan:
			//	return await this.bandcampClient.getFan(idParts.id);
		}
		return (await this.bandcampClient.getItemFromURL(idParts.id)) as BandcampMetadataItem;
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
