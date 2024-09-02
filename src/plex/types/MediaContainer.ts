
import { PlexPluginIdentifier } from './common';

export type PlexMediaContainer = {
	size: number;
	totalSize?: number;
	offset?: number;
	allowSync?: boolean;
	augmentationKey?: string; // "/library/metadata/augmentations/1" (these are the "recommended feeds")
	identifier?: PlexPluginIdentifier; // "com.plexapp.plugins.library"
};
