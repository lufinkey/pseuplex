import { parseMetadataIDFromKey } from '../plex/metadataidentifier';
import { PseuplexMetadataSource } from './types';
import { parseMetadataID } from './metadataidentifier';

export type PseuplexPrivateToPublicIDsMap = {
	[privateId: string]: (number | string)
};

export class PseuplexIDRemappings {
	private _privateToPublicIds: {[key: string]: number} = {};
	private _publicToPrivateIds: {[id: number]: string} = {};
	private _nextPrivateID: number;
	private _increment: number;

	constructor(nextID: number, increment: number) {
		this._nextPrivateID = nextID;
		this._increment = increment;
	}

	static create() {
		return new PseuplexIDRemappings(Number.MAX_SAFE_INTEGER-1, -1);
	}

	private generatePrivateID(): number {
		const id = this._nextPrivateID;
		this._nextPrivateID += this._increment;
		if(this._nextPrivateID == Number.MAX_SAFE_INTEGER) {
			this._nextPrivateID = Number.MIN_SAFE_INTEGER + 1;
		} else if(this._nextPrivateID == Number.MIN_SAFE_INTEGER) {
			this._nextPrivateID == Number.MAX_SAFE_INTEGER - 1;
		}
		// TODO loop to ensure ID is not being used
		return id;
	}

	getPublicIDFromPrivateID(privateId: string): number {
		let id = this._privateToPublicIds[privateId];
		if(id != null) {
			return id;
		}
		id = this.generatePrivateID();
		this._privateToPublicIds[privateId] = id;
		this._publicToPrivateIds[id] = privateId;
		return id;
	}

	getPrivateIDFromPublicID(id: number | string): string | null {
		return this._publicToPrivateIds[id] ?? null;
	}

	getPublicSanitizedMetadataKey(metadataKey: string, metadataRatingKey: (string | undefined), privateToPublicIds?: PseuplexPrivateToPublicIDsMap | undefined): string {
		// check if ID needs to be mapped
		let metadataKeyParts = parseMetadataIDFromKey(metadataKey, '/library/metadata/');
		let metadataIdString = metadataKeyParts?.id;
		if(!metadataIdString) {
			metadataIdString = metadataRatingKey;
			if(!metadataIdString) {
				// failed to find the ID of the item
				return metadataKey;
			}
		}
		const metadataId = parseMetadataID(metadataIdString);
		if(!metadataId.source || metadataId.source == PseuplexMetadataSource.Plex) {
			// don't map plex IDs
			return metadataKey;
		}
		// map the ID
		const publicId = privateToPublicIds?.[metadataIdString] ?? this.getPublicIDFromPrivateID(metadataIdString);
		const publicMetadataKey = `/library/metadata/${publicId}` + (metadataKeyParts?.relativePath ?? '');
		return publicMetadataKey;
	}

	getPublicSanitizedMetadataRatingKey(metadataRatingKey: string, privateToPublicIds?: PseuplexPrivateToPublicIDsMap | undefined) : string {
		const metadataId = parseMetadataID(metadataRatingKey);
		if(!metadataId.source || metadataId.source == PseuplexMetadataSource.Plex) {
			// don't map plex IDs
			return metadataRatingKey;
		}
		// map the ID
		return (privateToPublicIds?.[metadataRatingKey] ?? this.getPublicIDFromPrivateID(metadataRatingKey)).toString();
	}
}
