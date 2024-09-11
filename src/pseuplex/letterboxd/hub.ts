
import * as letterboxd from 'letterboxd-retriever';
import * as plexTypes from '../../plex/types';
import {
	PseuplexHub,
	PseuplexHubContext,
	PseuplexHubPage,
	PseuplexHubPageParams
} from '../hub';
import { PseuplexMetadataTransformOptions } from '../metadata';
import { LetterboxdMetadataProvider } from './metadata';
import * as lbtransform from './transform';

export type LetterboxdHubOptions = {
	hubPath: string,
	title: string,
	type: plexTypes.PlexMediaItemType,
	style: plexTypes.PlexHubStyle,
	hubIdentifier: plexTypes.PlexHubIdentifier,
	context: plexTypes.PlexHubContext,
	promoted: boolean,
	metadataTransformOptions: PseuplexMetadataTransformOptions,
	letterboxdMetadataProvider: LetterboxdMetadataProvider
};

export type LetterboxdHubPage = {
	items:letterboxd.Film[],
	hasMore: boolean,
	totalItemCount?: number
};

export abstract class LetterboxdHub<TOptions extends LetterboxdHubOptions = LetterboxdHubOptions> extends PseuplexHub {
	_options: TOptions;
	
	constructor(options: TOptions) {
		super();
		this._options = options;
	}

	get metadataBasePath() {
		return this._options.metadataTransformOptions.metadataBasePath;
	}

	abstract fetchPage(params: PseuplexHubPageParams, context: PseuplexHubContext): Promise<LetterboxdHubPage>;

	override async get(params: PseuplexHubPageParams, context: PseuplexHubContext): Promise<PseuplexHubPage> {
		const opts = this._options;
		const page = (params.count == null || params.count > 0) ? await this.fetchPage(params, context) : null;
		return {
			hub: {
				key: opts.hubPath,
				title: opts.title,
				type: opts.type,
				hubIdentifier: opts.hubIdentifier,
				context: opts.context,
				style: opts.style,
				promoted: opts.promoted
			},
			items: page != null ? await Promise.all(page.items.map(async (item) => {
				const metadataId = lbtransform.partialMetadataIdFromFilm(item);
				const metadataItem = lbtransform.filmToPlexMetadata(item, opts.metadataTransformOptions);
				return await opts.letterboxdMetadataProvider.attachPlexDataIfAble(metadataId, metadataItem, {
					plexServerURL: context.plexServerURL,
					plexAuthContext: context.plexAuthContext
				});
			})) : [],
			offset: Math.max(params.start ?? 0, 0),
			more: page?.hasMore ?? true,
			totalCount: page?.totalItemCount ?? undefined
		};
	}
}
