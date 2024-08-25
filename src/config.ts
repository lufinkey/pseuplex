
import fs from 'fs';

export interface Config {
	port: number;
	plex: {
		host: string;
		port: number;
		token: string;
	},
	ssl: {
		keyPath: string,
		certPath: string
	},
	perUser: {
		[email: string]: {
			letterboxdUsername?: string | null;
		}
	}
}

export const readConfigFile = (path: string): Config => {
	const data = fs.readFileSync(path, 'utf8');
	const cfg: Config = JSON.parse(data);
	if(!cfg || typeof cfg !== 'object') {
		throw new Error("Invalid config file");
	}
	if(!cfg.perUser) {
		cfg.perUser = {};
	}
	return cfg;
};
