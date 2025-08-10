import {
	PseuplexPlugin,
	PseuplexRequestContext,
	PseuplexResponseFilterContext,
	PseuplexReadOnlyResponseFilters
} from '../../pseuplex';
import * as plexTypes from '../../plex/types';
import { isNullOrEmpty, forArrayOrSingle } from '../../utils/misc';
import { PlayRedirectConfig, PlayRedirectPluginConfig } from './types';
import { PlayRedirectTransformer } from './transformer';

export default class PlayRedirectPlugin implements PseuplexPlugin {
	static slug = 'playRedirect';
	readonly slug = PlayRedirectPlugin.slug;
	readonly app: any; // PseuplexApp type not available in this scope
	private transformer?: PlayRedirectTransformer;

	constructor(app: any) {
		this.app = app;
		this.initialize();
	}

	get config(): PlayRedirectPluginConfig {
		return this.app.config;
	}

	private initialize(): void {
		const config = this.config.playRedirect;
		
		if (config?.enabled && config.redirectToMetadataId) {
			this.transformer = new PlayRedirectTransformer(
				config.redirectToMetadataId,
				config.redirectToTitle,
				undefined, // plexMetadataClient will be set later
				config.enabledForPlugins || ['letterboxd'] // Default to letterboxd for backward compatibility
			);
			
			// Set the Plex client for fetching target metadata (fallback)
			this.transformer.setPlexClient(this.app.plexMetadataClient);
			
			// Set local server info for primary metadata fetching
			this.transformer.setPlexServerInfo(
				this.app.plexServerURL,
				this.app.plexAdminAuthContext
			);
			
			const enabledPlugins = config.enabledForPlugins || ['letterboxd'];
			console.log(`PlayRedirect plugin enabled - redirecting unavailable content from [${enabledPlugins.join(', ')}] to: /library/metadata/${config.redirectToMetadataId}`);
		} else {
			console.log('PlayRedirect plugin disabled or not configured');
		}
	}

	/**
	 * Check if a metadata ID should be redirected during play queue resolution
	 */
	async getPlayQueueRedirectAsync(metadataId: string, context?: any): Promise<string | null> {
		if (!this.transformer) {
			return null;
		}

		const config = this.config.playRedirect;
		if (!config?.enabled || !config.redirectToMetadataId) {
			return null;
		}

		// Check if this plugin is enabled for redirects
		const enabledPlugins = config.enabledForPlugins || ['letterboxd'];
		
		// Check if the metadata ID matches any of the enabled plugins
		const isEnabledPlugin = enabledPlugins.some(plugin => metadataId.startsWith(`${plugin}:`));
		
		if (!isEnabledPlugin) {
			return null;
		}

		// For JustWatch items, check if they're actually available on the server
		if (metadataId.startsWith('justwatch:')) {
			try {
				// Get the metadata to check if it's available
				const metadataProvider = this.app.metadataProviders['justwatch'];
				if (metadataProvider) {
					const partialMetadataId = metadataId.replace('justwatch:', '');
					const metadataResult = await metadataProvider.get([partialMetadataId], {
						context: context || {},
						includePlexDiscoverMatches: false,
						includeUnmatched: false,
						transformMatchKeys: false,
						qualifiedMetadataIds: true,
						metadataBasePath: '/library/metadata',
					});

					const metadata = Array.isArray(metadataResult.MediaContainer.Metadata) 
						? metadataResult.MediaContainer.Metadata[0] 
						: metadataResult.MediaContainer.Metadata;

					// Check if the item has Media (meaning it's available)
					if (metadata && metadata.Media && metadata.Media.length > 0) {
						console.log(`PlayRedirect: JustWatch item ${metadataId} is available on server - NOT redirecting`);
						return null; // Don't redirect - it's available
					}
				}
			} catch (error) {
				console.warn(`PlayRedirect: Error checking availability for ${metadataId}:`, error);
			}
		}

		// For letterboxd items or unavailable justwatch items, redirect
		console.log(`PlayRedirect: Redirecting play queue for ${metadataId} to metadata ID ${config.redirectToMetadataId}`);
		return config.redirectToMetadataId;
	}

	/**
	 * Check if a metadata ID should be redirected during play queue resolution (sync version for backward compatibility)
	 */
	getPlayQueueRedirect(metadataId: string): string | null {
		// For backward compatibility, use the async version but only for letterboxd items
		// JustWatch items need async checking so they'll be handled by the async version
		if (metadataId.startsWith('letterboxd:')) {
			const config = this.config.playRedirect;
			if (config?.enabled && config.redirectToMetadataId) {
				console.log(`PlayRedirect: Redirecting play queue for ${metadataId} to metadata ID ${config.redirectToMetadataId}`);
				return config.redirectToMetadataId;
			}
		}
		return null;
	}

	responseFilters?: PseuplexReadOnlyResponseFilters = {
		metadata: async (
			resData: plexTypes.PlexMetadataPage,
			context: PseuplexResponseFilterContext
		) => {
			if (!this.transformer || isNullOrEmpty(resData.MediaContainer.Metadata)) {
				return;
			}

			const metadataArray = Array.isArray(resData.MediaContainer.Metadata) 
				? resData.MediaContainer.Metadata 
				: [resData.MediaContainer.Metadata];

			for (const metadataItem of metadataArray) {
				if (this.transformer!.shouldTransformItem(metadataItem)) {
					const transformedItem = await this.transformer!.transformUnavailableItem(
						metadataItem,
						{ plexAuthContext: context.userReq.plex.authContext }
					);
					
					// Update the item in place
					Object.assign(metadataItem, transformedItem);
					
					console.log(`PlayRedirect: Transformed unavailable item "${metadataItem.title}" to redirect to metadata ID ${this.config.playRedirect!.redirectToMetadataId}`);
				}
			}
		},

		metadataChildren: async (
			resData: plexTypes.PlexMetadataChildrenPage,
			context: PseuplexResponseFilterContext
		) => {
			if (!this.transformer || isNullOrEmpty(resData.MediaContainer.Metadata)) {
				return;
			}

			const metadataArray = Array.isArray(resData.MediaContainer.Metadata) 
				? resData.MediaContainer.Metadata 
				: [resData.MediaContainer.Metadata];

			for (const metadataItem of metadataArray) {
				if (this.transformer!.shouldTransformItem(metadataItem)) {
					const transformedItem = await this.transformer!.transformUnavailableItem(
						metadataItem,
						{ plexAuthContext: context.userReq.plex.authContext }
					);
					
					// Update the item in place
					Object.assign(metadataItem, transformedItem);
					
					console.log(`PlayRedirect: Transformed unavailable child item "${metadataItem.title}" to redirect to metadata ID ${this.config.playRedirect!.redirectToMetadataId}`);
				}
			}
		},

		hubs: async (
			resData: plexTypes.PlexLibraryHubsPage,
			context: PseuplexResponseFilterContext
		) => {
			if (!this.transformer || isNullOrEmpty(resData.MediaContainer.Hub)) {
				return;
			}

			const hubArray = Array.isArray(resData.MediaContainer.Hub) 
				? resData.MediaContainer.Hub 
				: [resData.MediaContainer.Hub];

			for (const hub of hubArray) {
				if (isNullOrEmpty(hub.Metadata)) {
					continue;
				}

				const metadataArray = Array.isArray(hub.Metadata) 
					? hub.Metadata 
					: [hub.Metadata];

				for (const metadataItem of metadataArray) {
					if (metadataItem && this.transformer!.shouldTransformItem(metadataItem)) {
						const transformedItem = await this.transformer!.transformUnavailableItem(
							metadataItem,
							{ plexAuthContext: context.userReq.plex.authContext }
						);
						
						// Update the item in place
						Object.assign(metadataItem, transformedItem);
						
						console.log(`PlayRedirect: Transformed unavailable hub item "${metadataItem.title}" to redirect to metadata ID ${this.config.playRedirect!.redirectToMetadataId}`);
					}
				}
			}
		},

		promotedHubs: async (
			resData: plexTypes.PlexLibraryHubsPage,
			context: PseuplexResponseFilterContext
		) => {
			if (!this.transformer || isNullOrEmpty(resData.MediaContainer.Hub)) {
				return;
			}

			const hubArray = Array.isArray(resData.MediaContainer.Hub) 
				? resData.MediaContainer.Hub 
				: [resData.MediaContainer.Hub];

			for (const hub of hubArray) {
				if (isNullOrEmpty(hub.Metadata)) {
					continue;
				}

				const metadataArray = Array.isArray(hub.Metadata) 
					? hub.Metadata 
					: [hub.Metadata];

				for (const metadataItem of metadataArray) {
					if (metadataItem && this.transformer!.shouldTransformItem(metadataItem)) {
						const transformedItem = await this.transformer!.transformUnavailableItem(
							metadataItem,
							{ plexAuthContext: context.userReq.plex.authContext }
						);
						
						// Update the item in place
						Object.assign(metadataItem, transformedItem);
						
						console.log(`PlayRedirect: Transformed unavailable promoted hub item "${metadataItem.title}" to redirect to metadata ID ${this.config.playRedirect!.redirectToMetadataId}`);
					}
				}
			}
		},

		sectionHubs: async (
			resData: plexTypes.PlexLibraryHubsPage,
			context: PseuplexResponseFilterContext
		) => {
			if (!this.transformer || isNullOrEmpty(resData.MediaContainer.Hub)) {
				return;
			}

			const hubArray = Array.isArray(resData.MediaContainer.Hub) 
				? resData.MediaContainer.Hub 
				: [resData.MediaContainer.Hub];

			for (const hub of hubArray) {
				if (isNullOrEmpty(hub.Metadata)) {
					continue;
				}

				const metadataArray = Array.isArray(hub.Metadata) 
					? hub.Metadata 
					: [hub.Metadata];

				for (const metadataItem of metadataArray) {
					if (metadataItem && this.transformer!.shouldTransformItem(metadataItem)) {
						const transformedItem = await this.transformer!.transformUnavailableItem(
							metadataItem,
							{ plexAuthContext: context.userReq.plex.authContext }
						);
						
						// Update the item in place
						Object.assign(metadataItem, transformedItem);
						
						console.log(`PlayRedirect: Transformed unavailable section hub item "${metadataItem.title}" to redirect to metadata ID ${this.config.playRedirect!.redirectToMetadataId}`);
					}
				}
			}
		}
	};
}
