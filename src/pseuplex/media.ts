import * as plexTypes from '../plex/types';
import { PseuplexRequestContext } from './types';

const nonexistantMediaItem = (opts: {unavailable: boolean}) => {
	return {
		id: 'nonexistant' as any,
		Part: [
			{
				id: 'nonexistant' as any,
				accessible: opts.unavailable ? false : undefined,
				exists: opts.unavailable ? false : undefined,
			} as plexTypes.PlexMediaPart
		]
	} as plexTypes.PlexMedia;
};

export const nonexistantMediaItems = (opts: {unavailable: boolean}, context: PseuplexRequestContext): plexTypes.PlexMedia[] | undefined => {
	// the old native android app has weird behavior around the unavailable button
	//  so we should handle that case
	if(plexTypes.plexUserIsNativeAndroidMobileAppPre2025(context.plexAuthContext)) {
		if(opts.unavailable) {
			return undefined;
		} else {
			return [
				nonexistantMediaItem({
					unavailable: false
				})
			];
		}
	}
	// return media item
	return [
		nonexistantMediaItem(opts)
	];
};
