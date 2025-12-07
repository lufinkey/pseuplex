import * as plexTypes from '../../plex/types';
import { IncomingPlexAPIRequest } from '../../plex/requesthandling';
import {
	PseuplexApp,
	PseuplexMetadataProvider,
	PseuplexPlugin,
	PseuplexPluginClass,
	PseuplexReadOnlyResponseFilters,
	PseuplexRouterApp,
} from '../../pseuplex';
import { HideSectionsPluginConfig } from './config';
import { HideSectionsPluginDef } from './plugindef';

export default (class HideSectionsPlugin implements HideSectionsPluginDef, PseuplexPlugin {
	static slug = 'hidesections';
	readonly slug = HideSectionsPlugin.slug;
	readonly app: PseuplexApp;

	constructor(app: PseuplexApp) {
		this.app = app;
	}

	get metadataProviders(): PseuplexMetadataProvider[] {
		return [
			//this.metadata // if you want the plugin to define a custom metadata provider
		];
	}

	get config(): HideSectionsPluginConfig {
		return this.app.config as HideSectionsPluginConfig;
	}

	responseFilters?: PseuplexReadOnlyResponseFilters = {
		mediaProviders: (resData, context) => {
			const sectionsFeature = resData.MediaContainer?.MediaProvider?.[0]?.Feature?.find((f) => f.type == plexTypes.PlexFeatureType.Content) as plexTypes.PlexContentFeature;
			if(sectionsFeature) {
				const hiddenSections = this.getHiddenSectionsForRequest(context.userReq);
				if(hiddenSections && hiddenSections.length > 0) {
					sectionsFeature.Directory = sectionsFeature.Directory?.filter((d) => (d.id == null || hiddenSections.findIndex((s) => (d.id == s)) == -1));
				}
			}
		},
		sections: (resData, context) => {
			if(resData.MediaContainer.Directory) {
				const hiddenSections = this.getHiddenSectionsForRequest(context.userReq);
				if(hiddenSections && hiddenSections.length > 0) {
					const originalCount = resData.MediaContainer.Directory.length;
					resData.MediaContainer.Directory = resData.MediaContainer.Directory.filter((d) => (d.key == null || hiddenSections.findIndex((s) => (d.key == s)) == -1));
					const newCount = resData.MediaContainer.Directory.length;
					const removedCount = originalCount - newCount;
					if(resData.MediaContainer.size) {
						resData.MediaContainer.size -= removedCount;
					}
					if(resData.MediaContainer.totalSize) {
						resData.MediaContainer.totalSize -= removedCount;
					}
				}
			}
		}
	}



	getHiddenSectionsForRequest(userReq: IncomingPlexAPIRequest) {
		const userHideSections = this.config.perUser?.[userReq.plex.userInfo.email]?.hideSections;
		const genHideSections = this.config.hideSections;
		let hiddenSections: (string | number)[] | undefined = genHideSections?.ids;
		if(userHideSections) {
			if(userHideSections.override) {
				hiddenSections = userHideSections.ids;
			} else if(userHideSections.ids) {
				hiddenSections = (hiddenSections ?? []).concat(userHideSections.ids);
			}
		}
		return hiddenSections;
	}

} satisfies PseuplexPluginClass);
