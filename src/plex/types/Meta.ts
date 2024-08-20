
import {
	PlexMediaItemType
} from './common';

export type PlexMetaType = {
	key: string;
	type: PlexMediaItemType;
	title: string;
	active?: boolean;
};

export type PlexMetaPage = {
	Type: PlexMetaType[]
};
