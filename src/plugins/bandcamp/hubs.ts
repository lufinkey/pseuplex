import { Bandcamp } from 'bandcamp-retriever';
import { ListFetchInterval } from '../../fetching/LoadableList';
import * as plexTypes from '../../plex/types';
import {
	getMetadataTransformOptionsForHub,
	PseuplexHubMetadataTransformOptions,
	PseuplexHubSectionInfo,
} from '../../pseuplex';
import { Logger } from '../../logging';
import { BandcampFanFeedHub } from "./fanfeedhub";
import { BandcampMetadataProvider } from './metadata';


export const createFanFeedHub = async (options: (PseuplexHubMetadataTransformOptions & {
	bandcampClient: Bandcamp
	hubPath: string,
	style: plexTypes.PlexHubStyle,
	promoted: boolean,
	uniqueItemsOnly: boolean,
	bandcampMetadataProvider: BandcampMetadataProvider,
	listStartFetchInterval?: ListFetchInterval,
	section?: PseuplexHubSectionInfo,
	matchToPlexServerMetadata?: boolean,
	logger?: Logger,
})) => {
	// TODO include request executor
	const fanInfo = await options.bandcampClient._getCurrentFanInfo();
	if(!fanInfo) {
		throw new Error(`Failed to get fan info from bandcamp`);
	}
	return new BandcampFanFeedHub({
		bandcampClient: options.bandcampClient,
		hubPath: options.hubPath,
		title: `Fan Feed on Bandcamp (${fanInfo.name})`,
		type: plexTypes.PlexMediaItemType.Movie,
		hubIdentifier: `custom.bandcamp.fanfeed.${fanInfo.username}`,
		context: 'hub.custom.bandcamp.fanfeed',
		defaultItemCount: 16,
		style: options.style,
		promoted: options.promoted,
		uniqueItemsOnly: options.uniqueItemsOnly,
		metadataTransformOptions: getMetadataTransformOptionsForHub(options.bandcampMetadataProvider.basePath, options),
		bandcampMetadataProvider: options.bandcampMetadataProvider,
		listStartFetchInterval: options.listStartFetchInterval,
		section: options.section,
		matchToPlexServerMetadata: options.matchToPlexServerMetadata,
		logger: options.logger,
	});
};
