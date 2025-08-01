import http from 'http';
import express from 'express';
import { parseURLPath, stringParam } from '../../utils/misc';

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

export const parseAuthContextFromRequest = (req: express.Request | http.IncomingMessage): PlexAuthContext => {
	// get query if needed
	let query: {[key: string]: any} = (req as express.Request).query;
	if(!query) {
		const urlParts = parseURLPath(req.url!);
		query = urlParts.queryItems ?? {};
	}
	// parse each key
	const authContext: PlexAuthContext = {};
	for(const key of PlexAuthContextKeys) {
		// get value from query
		let val = query[key];
		if(val == null || (typeof val === 'string' && val.length === 0)) {
			// get value from header
			const headerVal = req.headers[key.toLowerCase()];
			if(headerVal != null) {
				val = headerVal;
			}
		}
		// join with commas if array
		if(val instanceof Array) {
			val = val.join(',');
		} else {
			// validate that it's not an unsupported value type
			const valType = typeof val;
			if((valType == 'object' || valType == 'function') && val) {
				console.warn(`Ignoring invalid header ${key} value ${JSON.stringify(val)}`);
				val = undefined;
			}
		}
		// add value to auth context if nonnull
		if(val != null) {
			authContext[key] = val as string;
		}
	}
	return authContext;
};

export const parsePlexTokenFromRequest = (req: (http.IncomingMessage | express.Request)): string | undefined => {
	let query: {[key: string]: any} = (req as express.Request).query;
	if(!query) {
		const urlParts = parseURLPath(req.url!);
		query = urlParts.queryItems ?? {};
	}
	let plexToken = query ? stringParam(query['X-Plex-Token']) : undefined;
	if(!plexToken) {
		plexToken = stringParam(req.headers['x-plex-token']);
	}
	return plexToken;
};

export const plexUserIsNativeAndroidMobileAppPre2025 = (authContext: PlexAuthContext) => {
	if(authContext['X-Plex-Product'] === 'Plex for Android (Mobile)') {
		const version = authContext['X-Plex-Version'];
		if(version) {
			const majorVersion = Number.parseInt(version.split('.', 1)[0] || '');
			if(majorVersion && majorVersion < 2025) {
				return true;
			}
		}
	}
	return false;
};

const plexForMobileRegex = /^Plex [fF]or (Android|iOS|tvOS|Mobile)($|\s+)/;

export const plexUserIsReactNativeMobileAppPost2025 = (authContext: PlexAuthContext) => {
	const product = authContext['X-Plex-Product'];
	if(product && plexForMobileRegex.test(product)) {
		const version = authContext['X-Plex-Version'];
		if(version) {
			const majorVersion = Number.parseInt(version.split('.', 1)[0] || '');
			if(majorVersion && majorVersion >= 2025) {
				return true;
			}
		}
	}
	return false;
};
