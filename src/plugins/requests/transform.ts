import * as plexTypes from '../../plex/types';
import { parsePlexMetadataGuid } from '../../plex/metadataidentifier';
import {
	PseuplexMetadataSource,
	PseuplexPartialMetadataIDString,
	stringifyPseuplexMetadataID,
	stringifyPartialPseuplexMetadataID,
	parsePartialPseuplexMetadataID,
	parsePseuplexMetadataKey,
	stringifyPseuplexMetadataKeyFromIDString
} from '../../pseuplex';

export const ChildrenRelativePath = '/children';
export const SeasonRelativePath = '/season/';
export const SeasonIDComponentPortion = 'season';

export type RequestMetadataItemIDComponentParts = {
	mediaType: plexTypes.PlexMediaItemType,
	plexId: string,
	season?: number,
}

export type RequestPartialMetadataIDParts = {
	requestProviderSlug: string,
} & RequestMetadataItemIDComponentParts;

export type RequestMetadataKeyParts = {
	basePath: string;
	id: RequestPartialMetadataIDParts;
	relativePath?: string;
};

const createRequestMetadataItemIdComponent = (idParts: RequestMetadataItemIDComponentParts) => {
	return `${idParts.mediaType}:${idParts.plexId}`
		+ (idParts.season != null ? `:${SeasonIDComponentPortion}${idParts.season}` : '');
};

const parseRequestMetadataItemIdComponent = (idString: string): RequestMetadataItemIDComponentParts => {
	const idParts = idString.split(':');
	if(idParts.length < 2) {
		throw new Error(`Invalid request id component ${idString}`);
	}
	const mediaType = idParts[0] as plexTypes.PlexMediaItemType; // TODO validate media type?
	const plexId = idParts[1];
	let season: number | undefined = undefined;
	if(idParts.length > 2) {
		if(idParts.length > 3) {
			console.error(`Unknown request id component format ${JSON.stringify(idString)}`);
		}
		const childString = idParts[2];
		// parse season
		if(childString.startsWith(SeasonIDComponentPortion)) {
			const seasonString = childString.substring(SeasonIDComponentPortion.length);
			season = Number.parseInt(seasonString);
			if(Number.isNaN(season)) {
				season = undefined;
			}
		} else {
			console.error(`Unrecognized child portion ${JSON.stringify(childString)}`);
		}
	}
	return {
		mediaType,
		plexId,
		season,
	};
};

export const createRequestMetadataId = (idParts: RequestPartialMetadataIDParts) => {
	return stringifyPseuplexMetadataID({
		source: PseuplexMetadataSource.Request,
		directory: idParts.requestProviderSlug,
		id: createRequestMetadataItemIdComponent(idParts),
	});
};

export const createRequestPartialMetadataId = (idParts: RequestPartialMetadataIDParts) => {
	return stringifyPartialPseuplexMetadataID({
		directory: idParts.requestProviderSlug,
		id: createRequestMetadataItemIdComponent(idParts)
	});
};

export const parseUnqualifiedRequestItemMetadataKey = (metadataKey: string, basePath: string, warnOnFailure: boolean = true): RequestMetadataKeyParts | null => {
	if(!metadataKey) {
		if(warnOnFailure) {
			console.error(new Error(`Null metadata id passed to parseMetadataIDFromKey`));
		}
		return null;
	}
	if(!metadataKey.startsWith(basePath)) {
		if(warnOnFailure) {
			console.warn(`Unrecognized metadata key ${metadataKey}`);
		}
		return null;
	}
	if(metadataKey.length == basePath.length) {
		if(warnOnFailure) {
			console.warn(`Metadata key is the same as the base path ${metadataKey}`);
		}
		return null;
	}
	let reqProviderStart = basePath.length;
	if(!basePath.endsWith('/')) {
		if(metadataKey[basePath.length] != '/') {
			if(warnOnFailure) {
				console.warn(`Unrecognized metadata key ${metadataKey}`);
			}
			return null;
		}
		reqProviderStart += 1;
	}
	const reqProviderEnd = metadataKey.indexOf('/', reqProviderStart);
	if(reqProviderEnd == -1) {
		if(warnOnFailure) {
			console.warn(`Unrecognized metadata key ${metadataKey}`);
		}
		return null;
	}
	const mediaTypeStart = reqProviderEnd+1;
	const mediaTypeEnd = metadataKey.indexOf('/', mediaTypeStart);
	if(mediaTypeEnd == -1) {
		if(warnOnFailure) {
			console.warn(`Unrecognized metadata key ${metadataKey}`);
		}
		return null;
	}
	const plexIdStart = mediaTypeEnd+1;
	let plexIdEnd = metadataKey.indexOf('/', plexIdStart);
	let couldHaveMore = false;
	if(plexIdEnd == -1) {
		plexIdEnd = metadataKey.length;
	} else if(plexIdEnd < metadataKey.length-1) {
		couldHaveMore = true;
	}
	const idParts: RequestPartialMetadataIDParts = {
		requestProviderSlug: metadataKey.slice(reqProviderStart, reqProviderEnd),
		mediaType: metadataKey.slice(mediaTypeStart, mediaTypeEnd) as plexTypes.PlexMediaItemType,
		plexId: metadataKey.slice(plexIdStart, plexIdEnd),
	};
	const keyParts: RequestMetadataKeyParts = {
		basePath,
		id: idParts,
	};
	if(!couldHaveMore) {
		return keyParts;
	}
	let relativePathStart = plexIdEnd;
	const nextPartStart = relativePathStart+1;
	const nextPartEnd = metadataKey.indexOf('/', nextPartStart);
	if(nextPartEnd != -1) {
		const nextPart = metadataKey.slice(nextPartStart, nextPartEnd);
		if(nextPart == SeasonIDComponentPortion) {
			const seasonValStart = nextPartEnd+1;
			let seasonValEnd = metadataKey.indexOf('/', seasonValStart);
			if(seasonValEnd == -1) {
				seasonValEnd = metadataKey.length;
			}
			const seasonValString = metadataKey.slice(seasonValStart, seasonValEnd);
			let seasonVal = Number.parseInt(seasonValString);
			if(Number.isNaN(seasonVal)) {
				seasonVal = seasonValString as any;
			}
			idParts.season = seasonVal;
			relativePathStart = seasonValEnd;
		}
	}
	keyParts.relativePath = metadataKey.slice(relativePathStart);
	return keyParts;
};

export const parsePartialRequestMetadataId = (metadataId: PseuplexPartialMetadataIDString): RequestPartialMetadataIDParts => {
	const metadataIdParts = parsePartialPseuplexMetadataID(metadataId);
	if(!metadataIdParts.directory) {
		throw new Error(`Missing request provider slug on metadata id ${metadataId}`);
	}
	const idParts = parseRequestMetadataItemIdComponent(metadataIdParts.id);
	return {
		requestProviderSlug: metadataIdParts.directory,
		...idParts,
	};
};

export type TransformRequestMetadataOptions = {
	parentKey?: string,
	parentRatingKey?: string,
	requestProviderSlug: string,
	children?: boolean,
	transformRatingKey: boolean;
};

export const setMetadataItemKeyToRequestKey = (metadataItem: plexTypes.PlexMetadataItem, opts: TransformRequestMetadataOptions) => {
	let itemGuid = metadataItem.guid;
	let season: number | undefined = undefined;
	if(metadataItem.type == plexTypes.PlexMediaItemType.Season) {
		itemGuid = metadataItem.parentGuid;
		season = metadataItem.index;
	}
	const guidParts = parsePlexMetadataGuid(itemGuid!);
	if(!guidParts) {
		console.error("Unable to set metadata item key to request key");
		return;
	}
	const metadataItemKey = parsePseuplexMetadataKey(metadataItem.key);
	let relativePath = metadataItemKey?.relativePath;
	if(opts?.children != null) {
		if(opts.children) {
			relativePath = '/children';
		} else if(relativePath == '/children') {
			relativePath = undefined;
		}
	}
	const metadataId = createRequestMetadataId({
		requestProviderSlug: opts.requestProviderSlug,
		mediaType: guidParts.type as plexTypes.PlexMediaItemType,
		plexId: guidParts.id,
		season,
	});
	metadataItem.key = stringifyPseuplexMetadataKeyFromIDString(metadataId, relativePath);
	if(opts.transformRatingKey) {
		metadataItem.ratingKey = metadataId;
	}
	if(opts.parentKey) {
		metadataItem.parentKey = opts.parentKey;
	}
	if(opts.parentRatingKey) {
		metadataItem.parentRatingKey = opts.parentRatingKey;
	}
};

export type TransformRequestableChildMetadataOptions = TransformRequestMetadataOptions & {
	overlayedImageEndpoint: string | undefined;
	requested: boolean;
};

export const transformRequestableChildMetadata = (metadataItem: plexTypes.PlexMetadataItem, opts: TransformRequestableChildMetadataOptions) => {
	setMetadataItemKeyToRequestKey(metadataItem, opts);
	metadataItem.title = `Request: ${metadataItem.title}`;
	if(metadataItem.type == plexTypes.PlexMediaItemType.Season && opts.overlayedImageEndpoint) {
		const thumb = metadataItem.thumb || metadataItem.parentThumb || metadataItem.grandparentThumb;
		if(thumb) {
			const overlayName = opts.requested ? 'requestedSeason' : 'requestSeason';
			metadataItem.thumb = `${opts.overlayedImageEndpoint}?overlay=${overlayName}&url=${encodeURIComponent(thumb)}`;
		}
	}
};

export const addPartiallyAvailableBannerIfNeeded = (serverMetadataItem: plexTypes.PlexMetadataItem, discoverMetadataItem: plexTypes.PlexMetadataItem, opts: {
	overlayedImageEndpoint: string,
}): boolean => {
	const serverChildCount = serverMetadataItem.childCount ?? serverMetadataItem.leafCount;
	const discoverChildCount = discoverMetadataItem.childCount ?? discoverMetadataItem.leafCount;
	if(serverChildCount && discoverChildCount && serverChildCount < discoverChildCount) {
		const thumb = serverMetadataItem.thumb || discoverMetadataItem.thumb;
		if(thumb) {
			serverMetadataItem.thumb = `${opts.overlayedImageEndpoint}?overlay=partiallyAvailable&url=${encodeURIComponent(thumb)}`;
		}
		return true;
	}
	return false;
};
