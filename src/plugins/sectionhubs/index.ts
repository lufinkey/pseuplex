import express from 'express';
import * as plexTypes from '../../plex/types';
import {
	PseuplexApp,
	PseuplexPlugin,
	PseuplexPluginClass,
	PseuplexReadOnlyResponseFilters,
	PseuplexRequestContext,
	PseuplexHub
} from '../../pseuplex';
import { SectionHubConfig, SectionHubsPluginConfig } from './config';

export default (class SectionHubsPlugin implements PseuplexPlugin {
	static slug = 'sectionhubs';
	readonly slug = SectionHubsPlugin.slug;
	readonly app: PseuplexApp;

	constructor(app: PseuplexApp) {
		this.app = app;
	}

	get config(): SectionHubsPluginConfig {
		return this.app.config;
	}

	responseFilters?: PseuplexReadOnlyResponseFilters = {
		sectionHubs: async (resData, context) => {
			// Section ID is now provided directly in context
			const sectionId = context.sectionId;
			await this._addSectionHubsIfNeeded(resData, sectionId, context);
		}
	}

	private async _addSectionHubsIfNeeded(resData: plexTypes.PlexLibraryHubsPage, sectionId: string, context: any): Promise<void> {
		console.log(`SectionHubs: Processing section ${sectionId}`);
		
		if (!sectionId) {
			console.log(`SectionHubs: No section ID found`);
			return; // Not a section hubs request
		}

		// Get hubs for this section
		const sectionHubs = await this._getHubsForSection(sectionId, context.userReq.plex.requestParams, context.userReq.plex.authContext, context.userReq.plex.userInfo);
		console.log(`SectionHubs: Found ${sectionHubs.length} hubs for section ${sectionId}`);
		
		if (sectionHubs.length === 0) {
			return; // No hubs to add
		}

		// Convert hubs to hub entries with position information
		const hubEntriesWithPositions = await Promise.all(sectionHubs.map(async (hubWithPosition) => {
			const hubPageParams = {
				count: context.userReq.plex.requestParams.count,
				includeMeta: context.userReq.plex.requestParams.includeMeta,
				excludeFields: context.userReq.plex.requestParams.excludeFields
			};
			const hubEntry = await hubWithPosition.hub.getHubListEntry(hubPageParams, {
				plexUserInfo: context.userReq.plex.userInfo,
				plexAuthContext: context.userReq.plex.authContext,
				plexServerURL: this.app.plexServerURL
			});
			console.log(`SectionHubs: Created hub entry for position ${hubWithPosition.position}: ${hubEntry.title}`);
			return {
				hubEntry,
				position: hubWithPosition.position
			};
		}));

		// Start with existing Plex hubs
		let finalHubs = [...(resData.MediaContainer.Hub ?? [])];
		console.log(`SectionHubs: Starting with ${finalHubs.length} existing hubs`);

		// Insert/append section hubs based on their position
		for (const {hubEntry, position} of hubEntriesWithPositions) {
			if (position !== undefined && position >= 0) {
				// Insert at specific position
				const insertIndex = Math.min(position, finalHubs.length);
				finalHubs.splice(insertIndex, 0, hubEntry);
				console.log(`SectionHubs: Inserted hub "${hubEntry.title}" at position ${insertIndex}`);
			} else {
				// Append at the end
				finalHubs.push(hubEntry);
				console.log(`SectionHubs: Appended hub "${hubEntry.title}" at end`);
			}
		}

		// Update the response
		resData.MediaContainer.Hub = finalHubs;
		resData.MediaContainer.size = finalHubs.length;
		if (resData.MediaContainer.totalSize != null) {
			resData.MediaContainer.totalSize = finalHubs.length;
		}
		
		console.log(`SectionHubs: Final result has ${finalHubs.length} hubs`);
	}

	private async _getHubsForSection(sectionId: string, reqParams: any, authContext: any, userInfo: any): Promise<Array<{hub: PseuplexHub, position?: number}>> {
		const sectionConfig = this.config.sections?.[sectionId];
		if (!sectionConfig || 
			sectionConfig.enabled === false ||
			!sectionConfig.hubs || 
			sectionConfig.hubs.length === 0) {
			return [];
		}

		const hubs: Array<{hub: PseuplexHub, position?: number}> = [];
		const context: PseuplexRequestContext = {
			plexUserInfo: userInfo,
			plexAuthContext: authContext,
			plexServerURL: this.app.plexServerURL
		};

		for(const hubConfig of sectionConfig.hubs) {
			try {
				console.log(`SectionHubs: Looking for plugin "${hubConfig.plugin}"`);
				const plugin = this.app.plugins[hubConfig.plugin];
				if(!plugin) {
					console.warn(`No plugin with slug ${hubConfig.plugin}`);
					continue;
				}
				console.log(`SectionHubs: Found plugin ${hubConfig.plugin}, looking for hub "${hubConfig.hub}"`);
				const hubProvider = plugin.hubs?.[hubConfig.hub];
				if(!hubProvider) {
					console.warn(`No hub with slug ${hubConfig.hub} in plugin ${hubConfig.plugin}`);
					continue;
				}
				console.log(`SectionHubs: Found hub provider, getting hub with arg:`, hubConfig.arg);
				// Convert arg to string if it's an object (for plugins like JustWatch)
				const argString = typeof hubConfig.arg === 'object' ? JSON.stringify(hubConfig.arg) : hubConfig.arg;
				const hub = await hubProvider.get(argString);
				if(!hub) {
					console.warn(`No hub from arg ${JSON.stringify(hubConfig.arg)} for hub ${hubConfig.hub} in plugin ${hubConfig.plugin}`);
					continue;
				}
				hubs.push({
					hub,
					position: hubConfig.position
				});
			} catch(error) {
				console.error(`Hub ${hubConfig.hub} ${hubConfig.arg ? `(${hubConfig.arg}) ` : ''} from plugin ${hubConfig.plugin} failed:`);
				console.error(error);
			}
		}
		return hubs;
	}

} as PseuplexPluginClass);
