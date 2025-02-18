import * as plexTypes from '../types';

export const removeFileParamsFromMetadataParams = (params: plexTypes.PlexMetadataPageParams) => {
	if(!params) {
		return params;
	}
	const newParams = {...params};
	for(const key in [
		'checkFiles',
		'asyncCheckFiles',
		'refreshAnalysis',
		'asyncRefreshAnalysis',
		'refreshLocalMediaAgent',
		'asyncRefreshLocalMediaAgent',
		'asyncAugmentMetadata'
	]) {
		delete newParams[key];
	}
}
