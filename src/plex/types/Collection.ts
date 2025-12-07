import express from 'express';
import {
	PlexMediaItemType,
	PlexMediaItemTypeNumeric,
	PlexPluginIdentifier,
	PlexSortParam
} from './common';
import {
	PlexLibrarySectionContentType,
	PlexLibrarySectionViewGroup
} from './Library';
import { PlexMeta } from './Meta';
import {
	PlexMetadataImage,
	PlexUltraBlurColors
} from './Metadata';
import { parseBooleanQueryParam, parseIntQueryParam, parseStringQueryParam } from '../../utils/queryparams';

export type PlexCollection = {
	ratingKey: string;
	key: string;
	guid: string;
	type: PlexMediaItemType.Collection;
	title: string;
	contentRating: string;
	subtype: PlexMediaItemType;
	summary: string;
	index: number;
	ratingCount: number;
	thumb?: string;
	art?: string;
	addedAt: number;
	updatedAt: number;
	childCount: number;
	minYear?: string;
	maxYear?: string;
	Image: PlexMetadataImage[];
	UltraBlurColors: PlexUltraBlurColors;
};



export enum PlexCollectionsSortField {
	Random = 'random',
	UpdatedAt = 'updatedAt',
	// TODO add other fields
};

export type PlexCollectionsSortParam = PlexSortParam<PlexCollectionsSortField>;

export type PlexCollectionsPageParams = {
	'X-Plex-Container-Start'?: number;
	'X-Plex-Container-Size'?: number;
	subtype?: PlexMediaItemTypeNumeric;
	smart?: boolean;
	sort?: PlexCollectionsSortParam;
	limit?: number;
};

export const parsePlexCollectionsPageParams = (req: express.Request): PlexCollectionsPageParams => {
	const query = req.query ?? {};
	return {
		'X-Plex-Container-Start': parseIntQueryParam(query['X-Plex-Container-Start'] ?? req.header('x-plex-container-start')),
		'X-Plex-Container-Size': parseIntQueryParam(query['X-Plex-Container-Size'] ?? req.header('x-plex-container-size')),
		subtype: parseIntQueryParam(query['subtype']),
		smart: parseBooleanQueryParam(query['smart']),
		sort: parseStringQueryParam(query['sort']) as PlexCollectionsSortParam,
		limit: parseIntQueryParam(query['limit']),
	};
};

export type PlexCollectionsPage = {
	MediaContainer: {
		size: number;
		totalSize: number;
		offset: number;
		allowSync: boolean;
		art?: string; // "/:/resources/movie-fanart.jpg"
		content: PlexLibrarySectionContentType;
		identifier: PlexPluginIdentifier;
		librarySectionID?: number | string;
		librarySectionTitle?: string;
		librarySectionUUID?: string;
		mediaTagPrefix?: string; // "/system/bundle/media/flags/"
		mediaTagVersion?: number; // 1754916256
		thumb?: string; // "/:/resources/movie.png"
		title1: string; // "Movies"
		title2?: string; // "All Movies"
		viewGroup: PlexMediaItemType;
		Meta?: PlexMeta;
		Metadata: PlexCollection[];
	}
};
