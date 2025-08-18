
import qs from 'querystring';
import * as plexTypes from '../../plex/types';
import {
	parsePartialMetadataID,
	PseuplexMetadataChildrenPage,
	PseuplexMetadataChildrenProviderParams,
	PseuplexMetadataItem,
	PseuplexMetadataPage,
	PseuplexMetadataProvider,
	PseuplexMetadataProviderParams,
	PseuplexPartialMetadataIDsFromKey,
	PseuplexRelatedHubsParams,
	qualifyPartialMetadataID,
	stringifyMetadataID,
	stringifyPartialMetadataID,
} from '../../pseuplex';
import { httpError } from '../../utils/error';
import { parseMetadataIDFromKey } from '../../plex/metadataidentifier';
import { parseMetadataIdsFromPathParam } from '../../pseuplex/requesthandling';

export enum PasswordLockMetadataID {
	Instructions = 'instructions',
}

export class PasswordLockMetadataProvider implements PseuplexMetadataProvider {
	readonly sourceDisplayName = "Password Lock";
	readonly sourceSlug = 'passwordlock';

	constructor() {
		//
	}

	async get(ids: string[], options: PseuplexMetadataProviderParams): Promise<PseuplexMetadataPage> {
		const metadataBasePath = options.metadataBasePath || '/library/metadata';
		const qualifiedMetadataIds = options.qualifiedMetadataIds ?? true;
		const metadatas = ids.map((idString): PseuplexMetadataItem => {
			const idParts = parsePartialMetadataID(idString);
			if(idParts.directory) {
				throw httpError(400, "Invalid metadata");
			}
			switch(idParts.id) {
				case PasswordLockMetadataID.Instructions:
					// return password instructions metadata
					const fullMetadataId = qualifyPartialMetadataID(idString, this.sourceSlug);
					return ({
						type: plexTypes.PlexMediaItemType.Movie,
						key: `${metadataBasePath}/${
							qualifiedMetadataIds
								? fullMetadataId
								: stringifyPartialMetadataID(idParts)
						}`,
						ratingKey: fullMetadataId,
						title: "Instructions",
						Pseuplex: {
							isOnServer: false,
							unavailable: true,
							metadataIds: {
								[this.sourceSlug]: idString,
							},
						}
					} satisfies Partial<PseuplexMetadataItem>) as PseuplexMetadataItem;
			}
			throw httpError(404, `No matching metadata`);
		});
		return {
			MediaContainer: {
				offset: 0,
				size: metadatas.length,
				Metadata: metadatas,
			}
		};
	}
	
	async getChildren(id: string, options: PseuplexMetadataChildrenProviderParams): Promise<PseuplexMetadataChildrenPage> {
		throw httpError(500, "No children can be fetched from this provider");
	}
	
	async getRelatedHubs(id: string, options: PseuplexRelatedHubsParams): Promise<plexTypes.PlexHubsPage> {
		return {
			MediaContainer: {
				offset: 0,
				size: 0,
				totalSize: 0,
				Hub: []
			}
		};
	}

	metadataIdsFromKey(metadataKey: string): PseuplexPartialMetadataIDsFromKey | null {
		const metadataKeyParts = parseMetadataIDFromKey(metadataKey, '/library/metadata', false);
		if(!metadataKeyParts) {
			return null;
		}
		const ids = parseMetadataIdsFromPathParam(metadataKeyParts.id).filter((id) => {
			return id.source == this.sourceSlug;
		});
		if(ids.length == 0) {
			return null;
		}
		const idStrings = ids.map((id) => {
			return stringifyPartialMetadataID(id);
		});
		return {
			ids: idStrings,
			relativePath: metadataKeyParts.relativePath
		};
	}
}
