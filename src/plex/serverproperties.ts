
import * as plexTypes from './types';
import * as plexServerAPI from './api';

export type PlexServerPropertiesStoreOptions = {
	plexServerURL: string,
	plexAuthContext: plexTypes.PlexAuthContext
};

export class PlexServerPropertiesStore {
	_options: PlexServerPropertiesStoreOptions;
	_serverMachineIdentifier: string | Promise<string> | undefined;

	constructor(options: PlexServerPropertiesStoreOptions) {
		this._options = options;
	}

	get plexServerURL(): string {
		return this._options.plexServerURL;
	}

	get plexAuthContext(): plexTypes.PlexAuthContext {
		return this._options.plexAuthContext;
	}

	async getMachineIdentifier(): Promise<string> {
		if(this._serverMachineIdentifier) {
			return await this._serverMachineIdentifier;
		}
		const task = plexServerAPI.getServerIdentity({
			serverURL: this._options.plexServerURL,
			authContext: this._options.plexAuthContext
		}).then((identityPage) => {
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
}
