import * as plexTypes from '../../plex/types';
import { parseMetadataIDFromKey } from '../../plex/metadataidentifier';
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
	stringifyPartialMetadataID,
	parseMetadataIdsFromPathParam,
} from '../../pseuplex';
import { httpError } from '../../utils/error';

export enum PasswordLockMetadataID {
	Instructions = 'instructions',
	LoginSuccess = 'loginsuccess',
}

const LockInstructionsItemTitle = "Enter password";
const LockInstructionsItemSummary =
`This client has not yet been authorized for this IP address.
To log in, add this item to a new playlist, and enter the password for the server as the playlist name.
After this is done, restart the app and you should have access.`;

export type PasswordLockMetadataProviderOptions = {
	lockInstructionsThumbEndpoint: string,
	loginSuccessEndpoint: string,
	lockInstructionsItemTitle?: string,
	lockInstructionsItemSummary?: string,
	loginSuccessItemUUID: string,
	loginSuccessTitle?: string,
	loginSuccessSummary?: string,
};

export class PasswordLockMetadataProvider implements PseuplexMetadataProvider {
	readonly sourceDisplayName = "Password Lock";
	readonly sourceSlug = 'passwordlock';
	readonly options: PasswordLockMetadataProviderOptions;

	constructor(options: PasswordLockMetadataProviderOptions) {
		this.options = options;
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
				case PasswordLockMetadataID.Instructions: {
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
						title: this.options.lockInstructionsItemTitle ?? LockInstructionsItemTitle,
						thumb: this.options.lockInstructionsThumbEndpoint,
						summary: this.options.lockInstructionsItemSummary ?? LockInstructionsItemSummary,
						Pseuplex: {
							isOnServer: false,
							unavailable: true,
							metadataIds: {
								[this.sourceSlug]: idString,
							},
						}
					} satisfies Partial<PseuplexMetadataItem>) as PseuplexMetadataItem;
				}

				case PasswordLockMetadataID.LoginSuccess: {
					const fullMetadataId = qualifyPartialMetadataID(idString, this.sourceSlug);
					const playlist = ({
						ratingKey: fullMetadataId,
						key: this.options.loginSuccessEndpoint,
						guid: `com.plexapp.agents.none://${this.options.loginSuccessItemUUID}`,
						type: plexTypes.PlexMediaItemType.Playlist,
						title: this.options.loginSuccessTitle ?? "Success!",
						summary: this.options.loginSuccessSummary ?? "You have successfully logged in",
						smart: false,
						playlistType: plexTypes.PlexPlaylistType.Video,
						composite: undefined!, // TODO add success image
						duration: 7762000,
						leafCount: 1,
						addedAt: 1755571432,
						updatedAt: 1755571432,
					} satisfies plexTypes.PlexPlaylist) as any as PseuplexMetadataItem;
					playlist.Pseuplex = {
						isOnServer: false,
						unavailable: true,
						metadataIds: {
							[this.sourceSlug]: idString,
						}
					};
					return playlist;
				}
			}
			throw httpError(404, `No matching metadata`);
		});
		return {
			MediaContainer: {
				offset: 0,
				size: metadatas.length,
				identifier: plexTypes.PlexPluginIdentifier.PlexAppLibrary,
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
				identifier: plexTypes.PlexPluginIdentifier.PlexAppLibrary,
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
