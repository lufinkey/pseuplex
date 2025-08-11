import type {
	PseuplexApp,
	PseuplexPlugin,
	PseuplexPluginClass,
	PseuplexReadOnlyResponseFilters,
} from 'pseuplex';
import express from 'express';

export default (class ExamplePlugin implements PseuplexPlugin {
	static slug = 'example';
	readonly slug = ExamplePlugin.slug;
	readonly app: PseuplexApp;

	constructor(app: PseuplexApp) {
		this.app = app;
	}

	responseFilters?: PseuplexReadOnlyResponseFilters = {
		// define any functions to modify plex server responses
		promotedHubs: (resData, context) => {
			// add "hello world" to all the promoted hub titles
			if(resData.MediaContainer.Hub) {
				for(const hub of resData.MediaContainer.Hub) {
					if(hub.title) {
						hub.title = `Hello World - ${hub.title}`;
					}
				}
			}
		}
	}

	defineRoutes(router: express.Express) {
		// define any custom routes here
	}

} satisfies PseuplexPluginClass);
