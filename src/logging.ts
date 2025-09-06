import http from 'http';
import stream from 'stream';
import express from 'express';
import type { PlexServerAccountInfo } from './plex/accounts';
import { PlexNotificationSender, PlexNotificationSenderTypeToName } from './plex/notifications';
import { urlFromClientRequest } from './utils/requests';
import {
	expressRequestDebugString,
	requestIsEncrypted
} from './utils/requesthandling';
import type { WebSocketEventMap } from './utils/websocket';
import type * as overseerrTypes from './plugins/requests/providers/overseerr/apitypes';

export type GeneralLoggingOptions = {
	logTimestamps?: boolean;
	logLogLevel?: boolean;
	logDebug?: boolean;
	logFullURLs?: boolean;
	logWatchedPaths?: boolean;
};

export type PlexLoggingOptions = {
	logPlexTokenInfo?: boolean;
};

export type OutgoingRequestsLoggingOptions = {
	logOutgoingRequests?: boolean;
	logOutgoingRequestBody?: boolean;
	logOutgoingRequestFailures?: boolean;
	logOutgoingResponses?: boolean;
	logOutgoingResponseBody?: boolean;
};

export type IncomingRequestsLoggingOptions = {
	logUserRequests?: boolean;
	logUserRequestHeaders?: boolean;
	logUserResponses?: boolean;
	logUserResponseHeaders?: boolean;
	logUserResponseBody?: boolean;
	logUnsecureUserRequests?: boolean;
};

export type ProxyRequestsLoggingOptions = {
	logProxyRequests?: boolean;
	logProxyRequestHeaders?: boolean;
	logProxyResponses?: boolean;
	logProxyResponseHeaders?: boolean;
	logProxyResponseBody?: boolean;
	logProxyErrorResponseBody?: boolean;
};

export type WebsocketLoggingOptions = {
	logWebsocketConnections?: boolean;
	logWebsocketErrors?: boolean;
};

export type NotificationLoggingOptions = {
	logAdminNotificationsFromServer?: boolean;
	logSentPlexNotifications?: boolean;
};

export type OverseerrLoggingOptions = {
	logOverseerrUsers?: boolean;
	logOverseerrUserMatches?: boolean;
	logOverseerrUserMatchFailures?: boolean;
};

export type LoggingOptions =
	GeneralLoggingOptions
	& PlexLoggingOptions
	& OutgoingRequestsLoggingOptions
	& IncomingRequestsLoggingOptions
	& ProxyRequestsLoggingOptions
	& WebsocketLoggingOptions
	& NotificationLoggingOptions
	& OverseerrLoggingOptions;

export class Logger {
	options: LoggingOptions;

	constructor(options: LoggingOptions) {
		this.options = options;
	}

	logDebug(message: string) {
		if(!this.options.logDebug) {
			return false;
		}
		console.log(message);
		return true;
	}

	urlString(urlString: string) {
		if(this.options.logFullURLs) {
			return urlString;
		}
		const queryIndex = urlString.indexOf('?');
		if(queryIndex != -1) {
			return urlString.substring(0, queryIndex);
		}
		return urlString;
	};

	logWatchingDirectory(directoryPath) {
		if(!this.options.logWatchedPaths) {
			return;
		}
		console.log(`Watching directory ${directoryPath}`);
	}

	logStoppedWatchingDirectory(directoryPath) {
		if(!this.options.logWatchedPaths) {
			return;
		}
		console.log(`Stopped watching directory ${directoryPath}`);
	}

	logWatchingFile(filePath) {
		if(!this.options.logWatchedPaths) {
			return;
		}
		console.log(`Watching file ${filePath}`);
	}

	logStoppedWatchingFile(filePath) {
		if(!this.options.logWatchedPaths) {
			return;
		}
		console.log(`Stopped watching file ${filePath}`);
	}

	logWatchedFileChanged(eventType, filePath, filename) {
		if(!this.options.logWatchedPaths) {
			return;
		}
		console.log(`\nFile ${eventType} ${filename} detected: ${filePath}`);
	}

	logWatchedDirectoryFileChanged(eventType, directoryPath, filename) {
		if(!this.options.logWatchedPaths) {
			return;
		}
		console.log(`\nDirectory file ${eventType} detected: ${directoryPath}/${filename}`);
	}

	logOutgoingRequest(url: string, options: RequestInit) {
		if(!this.options.logOutgoingRequests) {
			return;
		}
		const shouldLogBody = this.options.logOutgoingRequestBody && options.body;
		console.log(`Sending request ${options.method || 'GET'} ${url}${shouldLogBody ? " with body:" : ""}`);
		// TODO log headers if needed
		if(shouldLogBody) {
			console.log(options.body);
		}
	}

	logOutgoingRequestResponse(res: Response, reqOptions: RequestInit, resData: any): boolean {
		if(res.ok) {
			if(!this.options.logOutgoingResponses) {
				return false;
			}
			console.log(`Got response ${res.status} for ${reqOptions.method || 'GET'} ${res.url}: ${res.statusText}`);
			if(resData && this.options.logOutgoingResponseBody) {
				if(typeof resData === 'string') {
					console.log(`Response body:\n${resData}`);
				} else {
					console.log(`Response body:\n${JSON.stringify(resData)}`);
				}
			}
		} else {
			if(!(this.options.logOutgoingRequestFailures || this.options.logOutgoingResponses)) {
				return false;
			}
			console.error(`Got response ${res.status} for ${reqOptions.method || 'GET'} ${res.url}: ${res.statusText}`);
			if(reqOptions.body && !(this.options.logOutgoingRequests && this.options.logOutgoingRequestBody)) {
				console.error(`Request body: ${reqOptions.body}`);
			}
			if(resData) {
				if(typeof resData === 'string') {
					console.log(`Response body:\n${resData}`);
				} else {
					console.log(`Response body:\n${JSON.stringify(resData)}`);
				}
			}
		}
		return true;
	}

	logIncomingUserRequest(userReq: express.Request) {
		const secure = requestIsEncrypted(userReq);
		if(!(this.options.logUserRequests || (this.options.logUnsecureUserRequests && !secure))) {
			return;
		}
		console.log(`\n\x1b${secure ? '[42m🔒 ' : '[43m'}User ${userReq.method} ${this.urlString(userReq.originalUrl)}\x1b[0m`);
		if(this.options.logUserRequestHeaders) {
			const reqHeaderList = userReq.rawHeaders;
			for(let i=0; i<reqHeaderList.length; i++) {
				const headerKey = reqHeaderList[i];
				i++;
				const headerVal = reqHeaderList[i];
				console.log(`\t${headerKey}: ${headerVal}`);
			}
		}
	}

	logIncomingUserRequestResponse(userReq: express.Request, userRes: express.Response, bodyString: string | undefined) {
		if(!this.options.logUserResponses) {
			return;
		}
		const shouldLogBody = this.options.logUserResponseBody && bodyString;
		console.log(`\nUser response ${userRes.statusCode} for ${userReq.method} ${this.urlString(userReq.originalUrl)}`);
		if(this.options.logUserResponseHeaders) {
			const userResHeaders = userRes.getHeaders();
			for(const headerKey of Object.keys(userResHeaders)) {
				console.log(`\t${headerKey}: ${userResHeaders[headerKey]}`);
			}
		}
		if(shouldLogBody) {
			console.log(bodyString);
		}
		console.log();
	}

	logProxyingRequest(userReq: express.Request, proxyReqOpts: http.RequestOptions, url: string) {
		if(!this.options.logProxyRequests) {
			return;
		}
		// TODO use remapped method
		console.log(`\nProxy ${userReq.method} ${this.urlString(url)}`);
		if(this.options.logProxyRequestHeaders && proxyReqOpts.headers) {
			const proxyReqHeaders = Object.keys(proxyReqOpts.headers);
			for(let i=0; i<proxyReqHeaders.length; i++) {
				const headerKey = proxyReqHeaders[i];
				const headerVal = proxyReqOpts.headers[headerKey];
				console.log(`\t${headerKey}: ${headerVal}`);
			}
		}
	}

	logProxyRequest(userReq: express.Request, proxyReq: http.ClientRequest) {
		if(!this.options.logProxyRequests) {
			return;
		}
		const proxyUrl = urlFromClientRequest(proxyReq);
		console.log(`\nProxy ${proxyReq.method} ${this.urlString(proxyUrl)}`);
		if(this.options.logProxyRequestHeaders) {
			const proxyReqHeaders = proxyReq.getHeaders();
			for(const headerKey in proxyReqHeaders) {
				console.log(`\t${headerKey}: ${proxyReqHeaders[headerKey]}`);
			}
		}
	}

	logProxyResponse(userReq: express.Request, userRes: express.Response, proxyReq: http.ClientRequest, proxyRes: http.IncomingMessage, proxyResDataString: string | undefined): boolean {
		const isErrorResponse = !proxyRes.statusCode || proxyRes.statusCode < 200 || proxyRes.statusCode >= 300;
		if(!(this.options.logProxyResponses
			|| (this.options.logProxyErrorResponseBody && isErrorResponse))
		) {
			return false;
		}
		const proxyUrl = urlFromClientRequest(proxyReq);
		console.log(`\nProxy Response ${proxyRes.statusCode} for ${proxyReq.method} ${this.urlString(proxyUrl)}`);
		if(this.options.logProxyResponseHeaders) {
			const proxyResHeaderList = proxyRes.rawHeaders;
			for(let i=0; i<proxyResHeaderList.length; i++) {
				const headerKey = proxyResHeaderList[i];
				i++;
				const headerVal = proxyResHeaderList[i];
				console.log(`\t${headerKey}: ${headerVal}`);
			}
		}
		if((this.options.logProxyResponseBody || (this.options.logProxyErrorResponseBody && isErrorResponse)) && proxyResDataString) {
			console.log(proxyResDataString);
		}
		return true;
	}

	logProxyAndUserResponse(userReq: express.Request, userRes: express.Response, proxyRes: http.IncomingMessage, headers: http.IncomingHttpHeaders | http.OutgoingHttpHeaders | undefined, resDataString: string | undefined): boolean {
		const isErrorResponse = !proxyRes.statusCode || proxyRes.statusCode < 200 || proxyRes.statusCode >= 300;
		if(!(this.options.logUserResponses || this.options.logProxyResponses
			|| (this.options.logProxyErrorResponseBody && isErrorResponse))
		) {
			return false;
		}
		console.log(`\nResponse ${userRes.statusCode} for ${userReq.method} ${this.urlString(userReq.originalUrl)}`);
		if(this.options.logUserResponseHeaders) {
			const userResHeaders = userRes.getHeaders();
			for(const headerKey of Object.keys(userResHeaders)) {
				if(headers?.[headerKey]) {
					continue;
				}
				console.log(`\t${headerKey}: ${userResHeaders[headerKey]}`);
			}
			if(headers) {
				for(const headerKey in Object.keys(headers)) {
					console.log(`\t${headerKey}: ${headers[headerKey]}`);
				}
			}
		}
		if((this.options.logUserResponseBody || this.options.logProxyResponseBody || ((this.options.logProxyErrorResponseBody || this.options.logUserResponseBody) && isErrorResponse)) && resDataString) {
			console.log(resDataString);
		}
		console.log();
		return true;
	}

	logIncomingUserUpgradeRequest(req: http.IncomingMessage, socket: stream, head: Buffer): boolean {
		if(!(this.options.logUserRequests || this.options.logWebsocketConnections)) {
			return false;
		}
		console.log(`\n\x1b[104mupgrade ${req.headers['upgrade'] ?? ''} ${req.method ?? ''} ${req.url}\x1b[0m`);
		if(this.options.logUserRequestHeaders) {
			const reqHeaderList = req.rawHeaders;
			for(let i=0; i<reqHeaderList.length; i++) {
				const headerKey = reqHeaderList[i];
				i++;
				const headerVal = reqHeaderList[i];
				console.log(`\t${headerKey}: ${headerVal}`);
			}
		}
		if(req.headers['upgrade']?.toLowerCase().trim() == 'websocket') {
			socket.once('close', () => {
				this.logIncomingWebsocketClosed(req);
			})
		}
		return true;
	}

	logIncomingWebsocketClosed(req: http.IncomingMessage): boolean {
		if(!(this.options.logUserRequests || this.options.logWebsocketConnections)) {
			return false;
		}
		console.log(`\nclosed socket ${req.url}`);
		return true;
	}

	logServerWebsocketFailedToOpen(error: WebSocketEventMap['error'], firstAttempt: boolean): boolean {
		if(!(this.options?.logWebsocketErrors || firstAttempt)) {
			return false;
		}
		console.error(`Plex server websocket failed to open:`);
		console.error(error);
		return true;
	}

	logServerWebsocketClosedWithError(error: WebSocketEventMap['error']): boolean {
		if(!(this.options?.logWebsocketErrors)) {
			return false;
		}
		console.error(`Plex server websocket closed with an error:`);
		console.error(error);
		return true;
	}

	logAdminWebsocketMessageFromServer(event: WebSocketEventMap['message']): boolean {
		if(!this.options.logAdminNotificationsFromServer) {
			return false;
		}
		console.log(`\nGot websocket message from server:\n${event.data}`);
		return true;
	}

	logSentPlexNotificationToUser(socketInfo: PlexNotificationSender, dataString: string): boolean {
		if(!this.options.logSentPlexNotifications) {
			return false;
		}
		const sourceName = PlexNotificationSenderTypeToName[socketInfo.type];
		console.log(`\nSending ${sourceName.toLowerCase()} notification to token ${socketInfo.token}:\n${dataString}`);
		return true;
	}

	logPlexRequestHandlerFailed(userReq: express.Request, userRes: express.Response, error: Error): boolean {
		console.error(`Plex request handler failed\n${expressRequestDebugString(userReq)}`);
		console.error(error);
		return true;
	}

	logPlexTokenRegistered(plexToken: string, accountInfo: PlexServerAccountInfo) {
		if(!this.options.logPlexTokenInfo) {
			return;
		}
		// TODO add colored logs
		console.log(`Registered plex token ${plexToken}: ${JSON.stringify(accountInfo, null, '\t')}`);
	}

	logPlexTokenUnregistered(plexToken: string, accountInfo: PlexServerAccountInfo) {
		if(!this.options.logPlexTokenInfo) {
			return;
		}
		// TODO add colored logs
		console.log(`Unregistered plex token ${plexToken}: ${JSON.stringify(accountInfo, null, '\t')}`);
	}

	logOverseerrUserMatched(plexToken: string, accountInfo: PlexServerAccountInfo, overseerrUser: overseerrTypes.User) {
		if(!this.options.logOverseerrUserMatches) {
			return;
		}
		const overseerrUserName = overseerrUser.username ?? overseerrUser.plexUsername ?? overseerrUser.email ?? overseerrUser.plexId;
		// TODO add colored logs
		console.log(`Registered overseerr user ${overseerrUserName} to plex token ${plexToken} (${accountInfo.email})`);
	}

	logOverseerrUserNotMatched(plexToken: string, accountInfo: PlexServerAccountInfo) {
		if(!this.options.logOverseerrUserMatchFailures) {
			return;
		}
		// TODO add colored logs
		console.warn(`Failed to register overseerr user to plex token ${plexToken} (${accountInfo.email})`);
	}

	logFetchedOverseerrUser(user: overseerrTypes.User) {
		if(!this.options.logOverseerrUsers) {
			return;
		}
		// TODO add colored logs
		console.log(`Fetched overseerr user: ${JSON.stringify(user, null, '\t')}`);
	}
}
