import * as plexTypes from '../../plex/types';
import * as plexServerAPI from '../../plex/api';
import { PseuplexMetadataItem } from '../../pseuplex';

/**
 * Plugin that replaces "Unavailable" status with a playable redirect
 * to another media item when content is not available on the server.
 */
export class PlayRedirectTransformer {
	private targetMediaCache?: plexTypes.PlexMedia[];
	private plexServerURL?: string;
	private plexAuthContext?: plexTypes.PlexAuthContext;

	constructor(
		private redirectToMetadataId: string,
		private redirectToTitle?: string,
		private plexMetadataClient?: any, // Will be set later
		private enabledForPlugins?: string[] // Which plugins to apply redirect to
	) {}

	setPlexClient(plexMetadataClient: any) {
		this.plexMetadataClient = plexMetadataClient;
	}

	setPlexServerInfo(serverURL: string, authContext: plexTypes.PlexAuthContext): void {
		this.plexServerURL = serverURL;
		this.plexAuthContext = authContext;
	}

	/**
	 * Fetches the actual Media/Part structure from the target metadata ID
	 */
	private async getTargetMedia(
		context: { plexAuthContext?: plexTypes.PlexAuthContext }
	): Promise<plexTypes.PlexMedia[]> {
		if (this.targetMediaCache && this.targetMediaCache.length > 0) {
			return [...this.targetMediaCache];
		}

		// Use local server API instead of metadata provider
		if (this.plexServerURL && this.plexAuthContext) {
			try {
				console.log(`PlayRedirect: Fetching target metadata ${this.redirectToMetadataId} from local server`);
				
				// Fetch from local server using plexServerAPI
				const targetMetadata = await plexServerAPI.getLibraryMetadata(this.redirectToMetadataId, {
					serverURL: this.plexServerURL,
					authContext: this.plexAuthContext,
					params: {}
				});

				const targetItem = Array.isArray(targetMetadata.MediaContainer.Metadata) 
					? targetMetadata.MediaContainer.Metadata[0] 
					: targetMetadata.MediaContainer.Metadata;

				if (targetItem?.Media && targetItem.Media.length > 0) {
					console.log(`PlayRedirect: Successfully fetched Media from local server for metadata ${this.redirectToMetadataId}`);
					// Cache and return the actual Media structure
					this.targetMediaCache = [...targetItem.Media];
					return [...targetItem.Media];
				}
			} catch (error) {
				console.warn(`PlayRedirect: Failed to fetch target metadata ${this.redirectToMetadataId} from local server:`, error);
			}
		}

		// Fallback: try with plexMetadataClient if local server fails
		if (this.plexMetadataClient) {
			try {
				console.log(`PlayRedirect: Trying metadata provider as fallback for ${this.redirectToMetadataId}`);
				
				// Fetch the target metadata to get its Media/Part structure
				const targetMetadata = await this.plexMetadataClient.getMetadata(
					this.redirectToMetadataId,
					undefined,
					{ authContext: context.plexAuthContext }
				);

				const targetItem = Array.isArray(targetMetadata.MediaContainer.Metadata) 
					? targetMetadata.MediaContainer.Metadata[0] 
					: targetMetadata.MediaContainer.Metadata;

				if (targetItem?.Media && targetItem.Media.length > 0) {
					console.log(`PlayRedirect: Successfully fetched Media from metadata provider for ${this.redirectToMetadataId}`);
					// Cache and return the actual Media structure
					this.targetMediaCache = [...targetItem.Media];
					return [...targetItem.Media];
				}
			} catch (error) {
				console.warn(`PlayRedirect: Failed to fetch target metadata ${this.redirectToMetadataId} from metadata provider:`, error);
			}
		}

		// Final fallback to simple redirect structure
		console.log(`PlayRedirect: Using fallback Media structure for ${this.redirectToMetadataId}`);
		const fallbackMedia = [{
			id: parseInt(this.redirectToMetadataId) || 1,
			Part: [{
				id: parseInt(this.redirectToMetadataId) || 1,
				key: `/library/parts/${this.redirectToMetadataId}/1/file.redirect`,
				accessible: true,
				exists: true,
				file: `redirect://library/metadata/${this.redirectToMetadataId}`,
				duration: 0,
				size: 1
			} as plexTypes.PlexMediaPart]
		} as plexTypes.PlexMedia];

		this.targetMediaCache = fallbackMedia;
		return fallbackMedia;
	}

	/**
	 * Transforms unavailable metadata items to show a play button that redirects
	 * to the configured media item instead of showing "Unavailable"
	 */
	async transformUnavailableItem(
		metadataItem: PseuplexMetadataItem,
		context: { plexAuthContext?: plexTypes.PlexAuthContext }
	): Promise<PseuplexMetadataItem> {
		// Only transform if the item is marked as unavailable
		if (!metadataItem.Pseuplex?.unavailable) {
			return metadataItem;
		}

		// Get the actual Media structure from the target metadata
		const redirectMedia = await this.getTargetMedia(context);

		// If a custom title is provided, add it to the video resolution field
		if (this.redirectToTitle && redirectMedia.length > 0) {
			redirectMedia[0].videoResolution = this.redirectToTitle;
		}

		// Update the metadata item to be playable
		const transformedItem = {
			...metadataItem,
			Media: redirectMedia,
			Pseuplex: {
				...metadataItem.Pseuplex,
				unavailable: false, // No longer unavailable since it's playable
				isRedirect: true,   // Custom flag to indicate this is a redirect
				redirectsTo: this.redirectToMetadataId
			}
		};

		return transformedItem;
	}

	/**
	 * Check if a metadata item should be transformed
	 */
	shouldTransformItem(metadataItem: plexTypes.PlexMetadataItem | undefined): metadataItem is PseuplexMetadataItem {
		if (!metadataItem) return false;
		const pseuItem = metadataItem as PseuplexMetadataItem;
		
		// Only transform if the item is marked as unavailable
		if (!pseuItem.Pseuplex?.unavailable) return false;
		
		// Check if this item's key matches any of the enabled plugins
		const enabledPlugins = this.enabledForPlugins || ['letterboxd']; // Default to letterboxd for backward compatibility
		const itemKey = metadataItem.key || metadataItem.ratingKey || '';
		
		// Check if the metadata key matches any of the enabled plugins (e.g., /library/metadata/letterboxd:film:...)
		const shouldTransform = enabledPlugins.some(plugin => itemKey.includes(`${plugin}:`));
		
		return shouldTransform;
	}
}
