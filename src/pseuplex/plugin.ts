
import http from 'http';
import express from 'express';
import * as plexTypes from '../plex/types';
import { IncomingPlexAPIRequest } from '../plex/requesthandling';
import { PseuplexMetadataChildrenPage, PseuplexMetadataPage, PseuplexRequestContext } from './types';
import { PseuplexHubProvider } from './hub';
import { PseuplexMetadataProvider, PseuplexRelatedHubsSource } from './metadata';
import {
	PseuplexMetadataIDParts,
	PseuplexPartialMetadataIDString
} from './metadataidentifier';
import { PseuplexAllSectionsSource, PseuplexSection } from './section';
import { PseuplexRouterApp } from './router';


export type PseuplexResponseFilterContext = {
	userReq: IncomingPlexAPIRequest;
	userRes: express.Response;
	proxyRes?: http.IncomingMessage;
	previousFilterPromises?: Promise<void>[];
};

export type PseuplexSectionsFilterContext = PseuplexResponseFilterContext & {
	from: PseuplexAllSectionsSource;
};

export type PseuplexMetadataResponseFilterContext = PseuplexResponseFilterContext & {
	metadataIds: PseuplexMetadataIDParts[];
};

export type PseuplexMetadataChildrenResponseFilterContext = PseuplexResponseFilterContext & {
	metadataId: PseuplexMetadataIDParts;
};

export type PseuplexMetadataRelatedHubsResponseFilterContext = PseuplexResponseFilterContext & {
	metadataId: PseuplexMetadataIDParts;
	from: PseuplexRelatedHubsSource;
};

export type PseuplexMetadataFromProviderResponseFilterContext = PseuplexResponseFilterContext & {
	metadataIds: PseuplexPartialMetadataIDString[];
	metadataProvider: PseuplexMetadataProvider;
};

export type PseuplexMetadataRelatedHubsFromProviderResponseFilterContext = PseuplexResponseFilterContext & {
	metadataId: PseuplexPartialMetadataIDString;
	metadataProvider: PseuplexMetadataProvider;
	from: PseuplexRelatedHubsSource;
};

export type PseuplexSectionHubsResponseFilterContext = PseuplexResponseFilterContext & {
	sectionId: string;
};

export type PseuplexResponseFilter<TResponseData, TContext extends PseuplexResponseFilterContext = PseuplexResponseFilterContext> = (resData: TResponseData, context: TContext) => void | Promise<void>;
export type PseuplexResponseFilters = {
	mediaProviders?: PseuplexResponseFilter<plexTypes.PlexServerMediaProvidersPage>;
	sections?: PseuplexResponseFilter<plexTypes.PlexLibrarySectionsPage, PseuplexSectionsFilterContext>;
	hubs?: PseuplexResponseFilter<plexTypes.PlexLibraryHubsPage>;
	promotedHubs?: PseuplexResponseFilter<plexTypes.PlexLibraryHubsPage>;
	sectionHubs?: PseuplexResponseFilter<plexTypes.PlexSectionHubsPage, PseuplexSectionHubsResponseFilterContext>;
	metadata?: PseuplexResponseFilter<PseuplexMetadataPage, PseuplexMetadataResponseFilterContext>;
	metadataChildren?: PseuplexResponseFilter<PseuplexMetadataChildrenPage, PseuplexMetadataChildrenResponseFilterContext>;
	metadataRelatedHubs?: PseuplexResponseFilter<plexTypes.PlexHubsPage, PseuplexMetadataRelatedHubsResponseFilterContext>;
	findGuidInLibrary?: PseuplexResponseFilter<plexTypes.PlexMetadataPage, PseuplexResponseFilterContext>;
};
export type PseuplexResponseFilterName = keyof PseuplexResponseFilters;
export type PseuplexReadOnlyResponseFilters = {
	readonly [filterName in PseuplexResponseFilterName]?: PseuplexResponseFilters[filterName];
};


export interface PseuplexPlugin {
	readonly metadataProviders?: PseuplexMetadataProvider[];
	readonly hubs?: { readonly [hubName: string]: PseuplexHubProvider };
	readonly responseFilters?: PseuplexReadOnlyResponseFilters;

	defineRoutes?: (router: PseuplexRouterApp) => void;
	defineFallbackRoutes?: (router: PseuplexRouterApp) => void;
	getSections?: (context: PseuplexRequestContext) => Promise<PseuplexSection[]>;
	shouldListenToPlexServerNotifications?: () => boolean;
	onPlexServerNotification?: (notification: plexTypes.PlexNotificationMessage) => void;
};
