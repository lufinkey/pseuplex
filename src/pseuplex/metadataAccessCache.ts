import { PseuplexMetadataProvider } from './metadata';
import { qualifyPartialMetadataID } from './metadataidentifier';
import { PseuplexMetadataItem, PseuplexRequestContext } from './types';

export type PseuplexMetadataAccessCacheOptions = {
	limitPerToken?: number;
};

const TokenAndClientIdDivider = '|';
type TokenAndClientIdString = `${string}${typeof TokenAndClientIdDivider}${string}`;

type TokenAndClientId = {
	token: string;
	clientId: string;
};

export class PseuplexMetadataAccessCache {
	limitPerToken: number;
	
	private readonly _clientAccessLogs: {
		[token: string]: {
			[clientId: string]: {
				[plexGuid: string]: {
					// metadata ids to key array
					[metadataId: string]: Set<string>
				}
			}
		}
	} = {};

	private readonly _plexGuidAccessors: {
		[plexGuid: string]: Set<TokenAndClientIdString>;
	} = {};

	constructor(options?: PseuplexMetadataAccessCacheOptions) {
		this.limitPerToken = options?.limitPerToken ?? 20;
	}

	cachePluginMetadataAccessIfNeeded(metadataProvider: PseuplexMetadataProvider, metadataId: string, metadataKey: string, metadatas: PseuplexMetadataItem | PseuplexMetadataItem[] | undefined, context: PseuplexRequestContext) {
		if(!metadatas) {
			return;
		}
		let metadataItem: PseuplexMetadataItem | undefined;
		if(metadatas instanceof Array) {
			if(metadatas.length == 1) {
				metadataItem = metadatas[0];
			}
		} else {
			metadataItem = metadatas;
		}
		const plexGuid = metadataItem?.guid;
		if(!plexGuid) {
			return;
		}
		const fullMetadataId = qualifyPartialMetadataID(metadataId, metadataProvider.sourceSlug);
		this.addMetadataAccessEntry(plexGuid, fullMetadataId, metadataKey, context);
	}
	
	addMetadataAccessEntry(plexGuid: string, metadataId: string, metadataKey: string, context: PseuplexRequestContext) {
		// get token and client id
		const { plexAuthContext } = context;
		const token = plexAuthContext['X-Plex-Token'];
		if(!token) {
			console.warn("tokenless auth context probably shouldn't be pushing metadata access...");
			return;
		}
		const clientId = plexAuthContext['X-Plex-Client-Identifier'] ?? '';
		const tokenAndClientIdString: TokenAndClientIdString = `${token}${TokenAndClientIdDivider}${clientId ?? ''}`;
		// get guid mapping for token and client id
		let clientMap = this._clientAccessLogs[token];
		if(!clientMap) {
			clientMap = {};
			this._clientAccessLogs[token] = clientMap;
		}
		let guidMap = clientMap[clientId];
		if(!guidMap) {
			guidMap = {};
			clientMap[clientId] = guidMap;
		}
		let metadataIdMap = guidMap[plexGuid];
		if(!metadataIdMap) {
			metadataIdMap = {};
			guidMap[plexGuid] = metadataIdMap;
		}
		let keyEntries = metadataIdMap[metadataId];
		if(keyEntries) {
			keyEntries.add(metadataKey);
			// delete and re-add guid mapping, so it moves to the end of the keys array
			delete guidMap[plexGuid];
			guidMap[plexGuid] = metadataIdMap;
		} else {
			// guid mapping doesn't exist
			// add new entry list
			keyEntries = new Set([metadataKey]);
			metadataIdMap[metadataId] = keyEntries;
		}
		// add to accessors
		let guidAccessors = this._plexGuidAccessors[plexGuid];
		if(!guidAccessors) {
			guidAccessors = new Set();
			this._plexGuidAccessors[plexGuid] = guidAccessors;
		}
		guidAccessors.add(tokenAndClientIdString);
		// delete entries over limit
		const guidKeys = Object.keys(guidMap);
		if(guidKeys.length > this.limitPerToken) {
			const overAmount = guidKeys.length - this.limitPerToken;
			for(const guidKey of guidKeys.slice(0, overAmount)) {
				// remove guid mapping and delete from accessors map
				const otherGuidAccessors = this._plexGuidAccessors[guidKey];
				delete guidMap[guidKey];
				if(otherGuidAccessors) {
					otherGuidAccessors.delete(tokenAndClientIdString);
					if(otherGuidAccessors.size == 0) {
						delete this._plexGuidAccessors[guidKey];
					}
				}
			}
		}
	}

	getMetadataIdMapForGuidAndClient(plexGuid: string, token: string, clientId: string): {
		[metadataId: string]: Set<string>,
	} | undefined {
		return this._clientAccessLogs[token]?.[clientId]?.[plexGuid];
	}

	getMetadataAccessorsForGuid(plexGuid: string): TokenAndClientId[] | undefined {
		const accessorStrings = this._plexGuidAccessors[plexGuid];
		if(!accessorStrings) {
			return undefined;
		}
		const accessors: TokenAndClientId[] = [];
		for(const accessorString of accessorStrings) {
			const divIndex = accessorString.indexOf(TokenAndClientIdDivider);
			if(divIndex == -1) {
				console.error(`Malformed accessorString ${accessorString}`);
				continue;
			}
			const token = accessorString.substring(0, divIndex);
			const clientId = accessorString.substring(divIndex+1);
			accessors.push({
				token,
				clientId
			});
		}
		return accessors;
	}

	forEachAccessorForGuid(guid: string, callback: (args: {token:string, clientId: string, metadataIds: string[], metadataIdsMap: {[metadataId: string]: Set<string>}}) => void) {
		const accessors = this.getMetadataAccessorsForGuid(guid);
		if(accessors) {
			for(const {token,clientId} of accessors) {
				const metadataIdsMap = this.getMetadataIdMapForGuidAndClient(guid,token,clientId);
				if(!metadataIdsMap) {
					console.error(`metadata ids map was undefined for guid ${guid}, even though it was listed as an accessor`);
					continue;
				}
				const metadataIds = Object.keys(metadataIdsMap);
				if(metadataIds.length == 0) {
					console.error(`0 metadata ids for guid ${guid}, even though it was listed as an accessor`);
					continue;
				}
				callback({token, clientId, metadataIds, metadataIdsMap});
			}
		}
	}
}
