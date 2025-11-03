import * as plexTypes from '../../../plex/types';
import {
	PseuplexHub,
	PseuplexHubPage,
	PseuplexHubPageParams,
	PseuplexHubSectionInfo,
	PseuplexMetadataProvider,
	PseuplexMetadataTransformOptions,
	PseuplexRequestContext
} from '../../../pseuplex';
import { PasswordLockMetadataID, PasswordLockMetadataProvider } from '../metadata';
import { arrayFromArrayOrSingle } from '../../../utils/misc';

export class PasswordLockedSectionIntroHub extends PseuplexHub {
	readonly path: string;
	readonly title: string;
	readonly metadataProvider: PasswordLockMetadataProvider;
	readonly metadataTransformOptions: PseuplexMetadataTransformOptions;
	section?: PseuplexHubSectionInfo | undefined;

	constructor(options: {
		path: string,
		title: string,
		metadataProvider: PasswordLockMetadataProvider,
		metadataTransformOptions: PseuplexMetadataTransformOptions,
		section?: PseuplexHubSectionInfo,
	}) {
		super();
		this.path = options.path;
		this.title = options.title;
		this.metadataProvider = options.metadataProvider;
		this.metadataTransformOptions = options.metadataTransformOptions;
		this.section = options.section;
	}

	async get(params: PseuplexHubPageParams, context: PseuplexRequestContext): Promise<PseuplexHubPage> {
		return {
			hub: {
				key: this.path,
				title: this.title,
				type: plexTypes.PlexMediaItemType.Movie,
				hubIdentifier: `hub.custom.lockedpasswordsection.intro${this.section?.id != null ? `.${this.section.id}` : ''}`,
				context: `hub.custom.lockedpasswordsection.intro`,
				style: plexTypes.PlexHubStyle.Shelf,
				promoted: true,
			},
			items: arrayFromArrayOrSingle((await this.metadataProvider.get([
				PasswordLockMetadataID.Instructions
			], {
				...this.metadataTransformOptions,
				context,
				includeUnmatched: true,
			})).MediaContainer.Metadata),
			offset: 0,
			more: false,
			totalItemCount: 1
		};
	}
}
