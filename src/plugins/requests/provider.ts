
import * as plexTypes from '../../plex/types';
import { PlexServerAccountInfo } from '../../plex/accounts';
import { PseuplexApp, PseuplexConfigBase, PseuplexRequestContext } from '../../pseuplex';
import { RequestInfo } from './types';

export type PlexMediaRequestOptions = {
	season?: number;
	context: PseuplexRequestContext;
};

export interface RequestsProvider {
	readonly slug: string;
	readonly isConfigured: boolean;
	readonly canRequestEpisodes: boolean;
	canPlexUserMakeRequests: (token: string, userInfo: PlexServerAccountInfo) => Promise<boolean>;
	requestPlexItem: (plexItem: plexTypes.PlexMetadataItem, options: PlexMediaRequestOptions) => Promise<RequestInfo>;
}

export type RequestsProviderClass = {
	new(app: PseuplexApp): RequestsProvider;
};


export type RequestsProviders = {
	[providerSlug: string]: RequestsProvider
};
