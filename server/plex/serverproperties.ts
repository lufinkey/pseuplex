
import * as plexTypes from './types';
import * as plexServerAPI from './api';

export type PlexServerPropertiesStoreOptions = plexServerAPI.PlexAPIRequestOptions & {
	authContext: plexTypes.PlexAuthContext
};

export class PlexServerPropertiesStore {
	readonly requestOptions: PlexServerPropertiesStoreOptions;
	_serverMachineIdentifier: string | Promise<string> | undefined;
	_librarySections: plexTypes.PlexLibrarySectionsPage | Promise<plexTypes.PlexLibrarySectionsPage> | undefined;

	constructor(options: PlexServerPropertiesStoreOptions) {
		this.requestOptions = options;
	}

	async getMachineIdentifier(): Promise<string> {
		if(this._serverMachineIdentifier) {
			return await this._serverMachineIdentifier;
		}
		const task = plexServerAPI.getServerIdentity(this.requestOptions).then((identityPage) => {
			const machineId = identityPage?.MediaContainer?.machineIdentifier;
			if(!machineId) {
				throw new Error("Missing machineIdentifier in response");
			}
			return machineId;
		});
		let serverId: string | undefined = undefined;
		try {
			this._serverMachineIdentifier = task;
			serverId = await task;
		} finally {
			this._serverMachineIdentifier = serverId;
		}
		return serverId;
	}

	async getLibrarySections(): Promise<plexTypes.PlexLibrarySectionsPage> {
		if(this._librarySections) {
			return await this._librarySections;
		}
		const task = plexServerAPI.getLibrarySections(this.requestOptions);
		let sections: plexTypes.PlexLibrarySectionsPage | undefined = undefined;
		try {
			this._librarySections = task;
			sections = await task;
		} finally {
			this._librarySections = sections;
		}
		return sections;
	}

	async getLibrarySection(id: string | number): Promise<plexTypes.PlexLibrarySection | null> {
		const key = `/library/sections/${id}`;
		const sections = (await this.getLibrarySections()).MediaContainer.Directory;
		for(const section of sections) {
			if(section.key == key || section.key == id || (section as any as plexTypes.PlexContentDirectory).id == id) {
				return section;
			}
		}
		return null;
	}
}
