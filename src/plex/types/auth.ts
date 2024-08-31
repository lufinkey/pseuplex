import http from 'http';
import express from 'express';
import { parseURLPath, stringParam } from '../../utils';

export type PlexAuthContext = {
	'X-Plex-Product'?: string;
	'X-Plex-Version'?: string;
	'X-Plex-Client-Identifier'?: string;
	'X-Plex-Platform'?: string;
	'X-Plex-Platform-Version'?: string;
	'X-Plex-Features'?: string;
	'X-Plex-Model'?: string;
	'X-Plex-Device'?: string;
	'X-Plex-Device-Name'?: string;
	'X-Plex-Device-Screen-Resolution'?: string;
	'X-Plex-Token'?: string;
	'X-Plex-Language'?: string;
	'X-Plex-Session-Id'?: string;
	'X-Plex-Drm'?: string;
};

const PlexAuthContextKeys: (keyof PlexAuthContext)[] = [
	'X-Plex-Product',
	'X-Plex-Version',
	'X-Plex-Client-Identifier',
	'X-Plex-Platform',
	'X-Plex-Platform-Version',
	'X-Plex-Features',
	'X-Plex-Model',
	'X-Plex-Device',
	'X-Plex-Device-Name',
	'X-Plex-Device-Screen-Resolution',
	'X-Plex-Token',
	'X-Plex-Language',
	'X-Plex-Session-Id',
	'X-Plex-Drm'
];

export const parseAuthContextFromRequest = (req: express.Request): PlexAuthContext => {
	const authContext: PlexAuthContext = {};
	for(const key of PlexAuthContextKeys) {
		let val = req.query[key];
		if(val == null || (typeof val === 'string' && val.length === 0)) {
			const headerVal = req.header(key.toLowerCase());
			if(headerVal != null) {
				val = headerVal;
			}
		}
		if(val instanceof Array) {
			val = val.join(',');
		} else {
			const valType = typeof val;
			if((valType == 'object' || valType == 'function') && val) {
				console.warn(`Ignoring invalid header ${key} value ${JSON.stringify(val)}`);
				val = undefined;
			}
		}
		if(val != null) {
			authContext[key] = val as string;
		}
	}
	return authContext;
};

export const parsePlexTokenFromRequest = (req: (http.IncomingMessage | express.Request)): string | undefined => {
	let query = (req as express.Request).query;
	if(!query) {
		const urlParts = parseURLPath(req.url);
		query = urlParts.queryItems;
	}
	let plexToken = query ? stringParam(query['X-Plex-Token']) : undefined;
	if(!plexToken) {
		plexToken = stringParam(req.headers['x-plex-token']);
	}
	return plexToken;
};
