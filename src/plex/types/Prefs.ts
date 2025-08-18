import { PlexMediaContainer } from './MediaContainer';

export type PlexSetting = {
	id: string;
	label: string;
	summary: string;
	type: 'bool' | 'int' | 'text';
	default: string;
	value: string;
	hidden: boolean;
	advanced: boolean;
	group: string;
	enumValues?: string; // "0:Disabled|1:For recorded items|2:For all items"
};

export type PlexPrefsPage = {
	MediaContainer: {
		size: number;
		Setting: PlexSetting[];
	}
};
