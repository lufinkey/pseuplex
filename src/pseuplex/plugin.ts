
import http from 'http';
import express from 'express';
import * as plexTypes from '../plex/types';
import { IncomingPlexAPIRequest } from '../plex/requesthandling';
import { PseuplexMetadataPage, PseuplexRequestContext } from './types';
import { PseuplexHubProvider } from './hub';
import { PseuplexMetadataProvider, PseuplexRelatedHubsSource } from './metadata';
import { PseuplexMetadataIDParts, PseuplexPartialMetadataIDParts } from './metadataidentifier';
import { PseuplexSection } from './section';


export type PseuplexResponseFilterContext = {
	userReq: IncomingPlexAPIRequest;
	userRes: express.Response;
	proxyRes?: http.IncomingMessage;
	previousFilterPromises?: Promise<void>[];
};

export type PseuplexMetadataRelatedHubsResponseFilterContext = PseuplexResponseFilterContext & {
	metadataId: PseuplexMetadataIDParts;
	from: PseuplexRelatedHubsSource;
};

export type PseuplexMetadataFromProviderResponseFilterContext = PseuplexResponseFilterContext & {
	metadataProvider: PseuplexMetadataProvider;
};

export type PseuplexMetadataRelatedHubsFromProviderResponseFilterContext = PseuplexResponseFilterContext & {
	metadataId: PseuplexPartialMetadataIDParts;
	metadataProvider: PseuplexMetadataProvider;
	from: PseuplexRelatedHubsSource;
};

export type PseuplexResponseFilter<TResponseData, TContext extends PseuplexResponseFilterContext = PseuplexResponseFilterContext> = (resData: TResponseData, context: TContext) => void | Promise<void>;
export type PseuplexResponseFilters = {
	mediaProviders?: PseuplexResponseFilter<plexTypes.PlexServerMediaProvidersPage>;
	hubs?: PseuplexResponseFilter<plexTypes.PlexLibraryHubsPage>;
	promotedHubs?: PseuplexResponseFilter<plexTypes.PlexLibraryHubsPage>;
	metadata?: PseuplexResponseFilter<PseuplexMetadataPage>;
	metadataRelatedHubs?: PseuplexResponseFilter<plexTypes.PlexHubsPage, PseuplexMetadataRelatedHubsResponseFilterContext>;
	findGuidInLibrary?: PseuplexResponseFilter<plexTypes.PlexMetadataPage, PseuplexResponseFilterContext>;

	metadataFromProvider?: PseuplexResponseFilter<PseuplexMetadataPage, PseuplexMetadataFromProviderResponseFilterContext>;
	metadataRelatedHubsFromProvider?: PseuplexResponseFilter<plexTypes.PlexHubsPage, PseuplexMetadataRelatedHubsFromProviderResponseFilterContext>;
};
export type PseuplexResponseFilterName = keyof PseuplexResponseFilters;
export type PseuplexReadOnlyResponseFilters = {
	readonly [filterName in PseuplexResponseFilterName]?: PseuplexResponseFilters[filterName];
};


export interface PseuplexPlugin {
	readonly metadataProviders?: PseuplexMetadataProvider[];
	readonly hubs?: { readonly [hubName: string]: PseuplexHubProvider };
	readonly responseFilters?: PseuplexReadOnlyResponseFilters;

	defineRoutes?: (router: express.Express) => void;
	hasSections?: (context: PseuplexRequestContext) => Promise<boolean>;
	getSections?: (context: PseuplexRequestContext) => Promise<PseuplexSection[]>;
	shouldListenToPlexServerNotifications?: () => boolean;
	onPlexServerNotification?: (notification: plexTypes.PlexNotificationMessage) => void;
};
