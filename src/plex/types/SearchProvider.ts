import { PlexPluginIdentifier } from './common';

export enum PlexTVSearchProviderType {
	Discover = 'discover',
	plexAvailableOnDemand = 'plexAVOD',
	plexTVOnDemand = 'plexTVOD',
	plexFAST = 'plexFAST'
};

export type PlexTVSearchProvider = {
	enabled: boolean;
	id: PlexTVSearchProviderType;
	title: string;
	Requires: PlexTVSearchProviderRequires[];
}

export enum PlexTVSearchProviderRequiresType {
	Provider = 'provider',
	OptOut = 'optOut',
	FeatureFlag = 'featureFlag'
}

export type PlexTVSearchProviderRequires = {
	type: PlexTVSearchProviderRequiresType;
	value: string;
}

export type PlexTVSearchProvidersPage = {
	MediaContainer: {
		identifier: PlexPluginIdentifier;
		size: number;
		SearchProvider: PlexTVSearchProvider[];
	}
}
