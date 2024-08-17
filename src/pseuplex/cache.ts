

type ProviderCache<TMetadataItem> = {
	metadataItems: {
		[key: string]: (TMetadataItem | Promise<TMetadataItem>)
	},
	feeds: {
		[key: string]: {
			//
		}
	}
};
