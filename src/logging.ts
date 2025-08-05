import http from 'http';
import express from 'express';
import { urlFromClientRequest } from './utils/requests';
import type { WebSocketEventMap } from './utils/websocket';
import {
	PseuplexClientNotificationWebSocketInfo,
	PseuplexNotificationSocketType,
	PseuplexNotificationSocketTypeToName
} from './pseuplex/types/sockets';
import type { PlexServerAccountInfo } from './plex/accounts';
import * as overseerrTypes from './plugins/requests/providers/overseerr/apitypes';
import { requestIsEncrypted } from './utils/requesthandling';

export type GeneralLoggingOptions = {
	logDebug?: boolean;
	logFullURLs?: boolean;
};

export type PlexLoggingOptions = {
	logPlexStillLivingDangerously?: boolean;
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
	logWebsocketMessagesFromUser?: boolean;
	logWebsocketMessagesToUser?: boolean;
	logWebsocketMessagesFromServer?: boolean;
	logWebsocketMessagesToServer?: boolean;
	logWebsocketErrors?: boolean;
};

export type OverseerrLoggingOptions = {
	logOverseerrUsers?: boolean;
	logOverseerrUserMatches?: boolean;
	logOverseerrUserMatchFailures?: boolean;
}

export type LoggingOptions =
	GeneralLoggingOptions
	& PlexLoggingOptions
	& OutgoingRequestsLoggingOptions
	& IncomingRequestsLoggingOptions
	& ProxyRequestsLoggingOptions
	& WebsocketLoggingOptions
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

	async logOutgoingRequestResponse(res: Response, reqOptions: RequestInit) {
		if(res.ok) {
			if(this.options.logOutgoingResponses) {
				let body: string | undefined;
				let gotBody = false;
				let bodyError: Error | undefined;
				if(this.options.logOutgoingResponseBody) {
					try {
						body = await res.text();
						gotBody = true;
					} catch(error) {
						bodyError = error;
					}
				}
				console.log(`Got response ${res.status} for ${reqOptions.method || 'GET'} ${res.url}: ${res.statusText}`);
				if(bodyError) {
					console.error(`Failed to fetch body for response: ${bodyError.message}`);
				}
				else if(gotBody && body) {
					console.log(`Response body:\n${body}`);
				}
			}
		} else {
			if(this.options.logOutgoingRequestFailures ?? this.options.logOutgoingResponses) {
				let body: string | undefined;
				let gotBody = false;
				let bodyError: Error | undefined;
				if(this.options.logOutgoingResponseBody) {
					try {
						body = await res.text();
						gotBody = true;
					} catch(error) {
						console.error(`Failed to fetch body for response to ${res.url} :`);
						console.error(error);
					}
				}
				console.error(`Got response ${res.status} for ${reqOptions.method || 'GET'} ${res.url}: ${res.statusText}`);
				if(bodyError) {
					console.error(`Failed to fetch body for response: ${bodyError.message}`);
				}
				else if(gotBody && body) {
					console.log(`Response body:\n${body}`);
				}
			}
		}
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
			console.log(JSON.stringify(bodyString));
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

	logProxyAndUserResponse(userReq: express.Request, userRes: express.Response, proxyRes: http.IncomingMessage, headers: http.IncomingHttpHeaders | undefined, resDataString: string | undefined): boolean {
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

	logIncomingUserUpgradeRequest(userReq: http.IncomingMessage) {
		if(!this.options.logUserRequests && !this.options.logWebsocketMessagesFromUser) {
			return;
		}
		console.log(`\n\x1b[104mupgrade ws ${userReq.url}\x1b[0m`);
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

	logIncomingWebsocketClosed(req: http.IncomingMessage): boolean {
		if(!(this.options.logUserRequests || this.options.logWebsocketMessagesFromUser || this.options.logWebsocketMessagesFromServer)) {
			return false;
		}
		console.log(`closed socket ${req.url}`);
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

	logWebsocketMessageFromServer(event: WebSocketEventMap['message']): boolean {
		if(!(this.options.logWebsocketMessagesFromServer)) {
			return false;
		}
		console.log(`\nGot websocket message from server:\n${event.data}`);
		return true;
	}

	logWebsocketNotificationToUser(socketInfo: PseuplexClientNotificationWebSocketInfo, dataString: string): boolean {
		if(!this.options.logWebsocketMessagesToUser) {
			return false;
		}
		console.log(`\nSending ${PseuplexNotificationSocketTypeToName[socketInfo.type]?.toLowerCase()} socket message to token ${socketInfo.plexToken}:\n${dataString}`);
		return true;
	}

	logPlexRequestHandlerFailed(userReq: express.Request, userRes: express.Response, error: Error): boolean {
		const logsAnyUrls = this.options.logUserRequests || this.options.logProxyRequests || this.options.logProxyResponses;
		console.error(`Plex request handler failed${!logsAnyUrls ? ` for ${userReq.originalUrl} :` : ':'}`);
		console.error(error);
		return true;
	}

	logPlexStillLivingDangerously(message: string, error: Error): boolean {
		if(!this.options.logPlexStillLivingDangerously) {
			return false;
		}
		console.error(message);
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
