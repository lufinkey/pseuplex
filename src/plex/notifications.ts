import stream from 'stream';
import http from 'http';
import * as plexTypes from './types';
import { Logger } from '../logging';
import { createSSEMessage } from '../utils/serverevents';
import { createWebSocketFrame } from '../utils/websocket';


export const WebsocketNotificationsEndpoint = '/:/websockets/notifications';
export const EventSourceNotificationsEndpoint = '/:/eventsource/notifications';


export enum PlexNotificationSenderType {
	EventSource = 1,
	Websocket = 2,
}

export const PlexNotificationSenderToEndpointSlug: {[type in PlexNotificationSenderType]: string} = {
	[PlexNotificationSenderType.EventSource]: 'eventsource',
	[PlexNotificationSenderType.Websocket]: 'websockets',
};

export const PlexNotificationSenderTypeToName: {[key: number]: string} = {};
for(const key of Object.keys(PlexNotificationSenderType)) {
	const val = PlexNotificationSenderType[key];
	PlexNotificationSenderTypeToName[val] = key;
}

export type PlexNotificationSender = {
	token: string;
	type: PlexNotificationSenderType;
} & (
	{
		type: PlexNotificationSenderType.Websocket;
		socket: stream.Duplex;
	}
	| {
		type: PlexNotificationSenderType.EventSource;
		response: http.ServerResponse;
	}
);


export type SendPlexNotificationOptions = {
	logger?: Logger;
};

export type PlexSerializedNotificationCache = {
	websocketData?: {frame: Buffer, dataString: string};
	sseData?: string[];
};

export const sendPlexNotification = (
	sender: PlexNotificationSender,
	notification: plexTypes.PlexNotificationContainer,
	options: SendPlexNotificationOptions,
	notifDataCache?: PlexSerializedNotificationCache
): boolean => {
	switch(sender.type) {
		case PlexNotificationSenderType.EventSource: {
			if(sender.response.closed) {
				// don't send to a closed response
				return false;
			}
			let messages = notifDataCache?.sseData;
			if(!messages) {
				if(notification.size == 0) {
					console.warn(`Notification with no entries was ignored`);
					return false;
				}
				const data: Partial<plexTypes.PlexNotificationContainer> = {...notification};
				const {type} = data;
				if(type == null) {
					console.warn(`Notification type wasn't specified`);
					return false;
				}
				delete data.type;
				delete data.size;
				// get the longest key that points to an array (kind of hacky, but i don't really want to change this to pass the key and an array)
				const notifKeys = Object.keys(data).filter((k) => {
					return (data[k] instanceof Array)
				}).sort((a, b) => (b.length - a.length));
				if(notifKeys.length == 0) {
					console.warn(`No data in notification object`);
					return false;
				}
				if(notifKeys.length > 1) {
					console.warn(`More than 1 data key in the notification object. Only the 1st will be used: ${JSON.stringify(notifKeys)}`);
				}
				const notifKey = notifKeys[0];
				const notifs: any[] = notification[notifKey];
				if(notifs.length == 0) {
					console.warn(`No notification objects to send`);
				}
				messages = notifs.map((notif) => {
					return createSSEMessage({
						event: type,
						data: JSON.stringify({
							[notifKey]: notif
						})
					});
				});
			}
			for(const message of messages) {
				options.logger?.logEventSourceNotificationToUser(sender, message);
				sender.response.write(message);
			}
			return messages.length > 0;
		}

		case PlexNotificationSenderType.Websocket: {
			if(sender.socket.closed) {
				// don't send to a closed socket
				return false;
			}
			let message = notifDataCache?.websocketData;
			if(!message) {
				const data: plexTypes.PlexNotificationMessage = {
					NotificationContainer: notification
				};
				const dataString = JSON.stringify(data);
				const frame = createWebSocketFrame(dataString);
				message = {frame, dataString};
			}
			options.logger?.logWebsocketNotificationToUser(sender, message.dataString);
			sender.socket.write(message.frame);
			return true;
		}

		default: {
			console.error(`Unknown notification sender type ${(sender as PlexNotificationSender).type}`);
		}
		break;
	}
	return false;
};

export const sendPlexNotifications = (senders: PlexNotificationSender[], notification: plexTypes.PlexNotificationContainer, options: SendPlexNotificationOptions) => {
	const notifDataCache: PlexSerializedNotificationCache = {};
	for(const sender of senders) {
		sendPlexNotification(sender, notification, options, notifDataCache);
	}
};
