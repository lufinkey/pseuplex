
import stream from 'stream';
import crypto from 'crypto';
import * as plexTypes from '../plex/types';
import { sendWebSocketMessage } from '../utils/stream';

export const NotificationsWebSocketEndpoint = '/:/websockets/notifications';
export const EventSourceNotificationsSocketEndpoint = '/:/eventsource/notifications';


export type PseuplexNotificationsOptions = {
	loggingOptions: {
		logWebsocketMessagesFromUser?: boolean,
		logWebsocketMessagesToUser?: boolean,
		logWebsocketMessagesFromServer?: boolean,
		logWebsocketMessagesToServer?: boolean,
	}
};



export enum PseuplexNotificationSocketType {
	EventSource = 1,
	Notification = 2,
}

export type PseuplexClientNotificationWebSocketInfo = {
	plexToken: string;
	type: PseuplexNotificationSocketType;
	socket: stream.Duplex;
	proxySocket: stream.Duplex;
};

export type NotificationDataCache = {
	[type: PseuplexNotificationSocketType | number]: string;
};

export const sendNotificationToSocket = (socketInfo: PseuplexClientNotificationWebSocketInfo, notification: plexTypes.PlexNotificationContainer, options: PseuplexNotificationsOptions, notifDataCache?: NotificationDataCache) => {
	const { type: socketType, socket } = socketInfo;
	switch(socketType) {
		case PseuplexNotificationSocketType.EventSource: {
			let dataString = notifDataCache?.[socketType];
			if(!dataString) {
				const data: Partial<plexTypes.PlexNotificationContainer> = {...notification};
				const {type} = data;
				delete data.type;
				delete data.size;
				const dataKeys = Object.keys(data);
				if(dataKeys.length == 0) {
					console.warn(`No data in notification object`);
				} else {
					if(dataKeys.length > 1) {
						console.warn(`More than 1 key in the notification object: ${JSON.stringify(dataKeys)}`);
					}
					const longestKey = dataKeys.sort((a, b) => (b.length - a.length))[0];
					const notifs = notification[longestKey];
					if(notifs.length == 1) {
						notification[longestKey] = notifs[0];
					}
				}
				dataString = `event: ${type}\ndata: ${JSON.stringify(data)}`;
				if(notifDataCache) {
					notifDataCache[socketType] = dataString;
				}
				if(options.loggingOptions.logWebsocketMessagesToUser) {
					console.log(`\nSending eventsource socket message to token ${socketInfo.plexToken}:\n${dataString}`);
				}
			}
			sendWebSocketMessage(socket, dataString);
		} break;

		case PseuplexNotificationSocketType.Notification: {
			let dataString = notifDataCache?.[socketType];
			if(!dataString) {
				const data: plexTypes.PlexNotificationMessage = {
					NotificationContainer: notification
				};
				dataString = JSON.stringify(data);
				if(notifDataCache) {
					notifDataCache[socketType] = dataString;
				}
				if(options.loggingOptions.logWebsocketMessagesToUser) {
					console.log(`\nSending notification socket message to token ${socketInfo.plexToken}:\n${dataString}`);
				}
			}
			sendWebSocketMessage(socket, dataString);
		} break;

		default:
			console.error(`Unknown notification socket type ${socketInfo.type}`);
			break;
	}
};

export const sendNotificationToSockets = (sockets: PseuplexClientNotificationWebSocketInfo[], notification: plexTypes.PlexNotificationContainer, options: PseuplexNotificationsOptions) => {
	const notifDataCache: NotificationDataCache = {};
	for(const socket of sockets) {
		if(socket.socket.closed) {
			continue;
		}
		sendNotificationToSocket(socket, notification, options, notifDataCache);
	}
};




export const sendMediaUnavailableNotifications = (sockets: PseuplexClientNotificationWebSocketInfo[], notif: {
	userID: number | string,
	metadataKey: string,
}, options: PseuplexNotificationsOptions) => {
	const uuidVal = crypto.randomUUID();
	/*sendMediaUnavailableActivityNotification(sockets, {
		uuid: uuidVal,
		eventType: plexTypes.PlexActivityEventType.Started,
		...options
	});
	sendMediaUnavailableActivityNotification(sockets, {
		uuid: uuidVal,
		eventType: plexTypes.PlexActivityEventType.Updated,
		...options
	});*/
	sendMediaUnavailableActivityNotification(sockets, {
		uuid: uuidVal,
		eventType: plexTypes.PlexActivityEventType.Ended,
		...notif
	}, options);
}

export const sendMediaUnavailableActivityNotification = (sockets: PseuplexClientNotificationWebSocketInfo[], notif: {
	uuid: string,
	eventType: plexTypes.PlexActivityEventType,
	userID: number | string,
	metadataKey: string
}, options: PseuplexNotificationsOptions) => {
	const notification: plexTypes.PlexActivityNotificationContainer = {
		type: plexTypes.PlexNotificationType.Activity,
		size: 1,
		ActivityNotification: [
			{
				event: notif.eventType,
				uuid: notif.uuid,
				Activity: {
					uuid: notif.uuid,
					type: plexTypes.PlexActivityType.LibraryRefreshItems,
					cancellable: false,
					userID: notif.userID as number,
					title: "Refreshing",
					subtitle: "Checking Availability",
					progress: 100,
					Context: {
						accessible: false,
						analyzed: false,
						exists: false,
						key: notif.metadataKey,
						refreshed: false
					}
				}
			}
		]
	};
	sendNotificationToSockets(sockets, notification, options);
};



export const sendMetadataRefreshTimelineNotifications = (sockets: PseuplexClientNotificationWebSocketInfo[], items: {
	itemID: string,
	sectionID: string,
	type: plexTypes.PlexMediaItemTypeNumeric,
	updatedAt: number,
}[], options: PseuplexNotificationsOptions) => {
	sendMetadataRefreshTimelineEntryNotification(sockets, items.map((item) => {
		return {
			state: plexTypes.PlexTimelineEntryNotificationState.StartedRefresh,
			metadataState: plexTypes.PlexTimelineEntryNotificationMetadataState.Queued,
			title: `Refreshing ${item.itemID}`,
			...item,
		};
	}), options);

	sendMetadataRefreshTimelineEntryNotification(sockets, items.map((item) => {
		return {
			state: plexTypes.PlexTimelineEntryNotificationState.FinishedRefresh,
			title: `Done refreshing ${item.itemID}`,
			...item,
		};
	}), options);
};

export const sendMetadataRefreshTimelineEntryNotification = (sockets: PseuplexClientNotificationWebSocketInfo[], items: {
	itemID: string,
	type: plexTypes.PlexMediaItemTypeNumeric,
	sectionID?: string,
	state: plexTypes.PlexTimelineEntryNotificationState,
	metadataState?: plexTypes.PlexTimelineEntryNotificationMetadataState,
	title: string,
	updatedAt: number,
}[], options: PseuplexNotificationsOptions) => {
	const notification: plexTypes.PlexTimelineEntryNotificationContainer = {
		type: plexTypes.PlexNotificationType.Timeline,
		size: items.length,
		TimelineEntry: items.map((item) => {
			return {
				identifier: plexTypes.PlexPluginIdentifier.PlexAppLibrary,
				...item,
			};
		})
	};
	sendNotificationToSockets(sockets, notification, options);
};
