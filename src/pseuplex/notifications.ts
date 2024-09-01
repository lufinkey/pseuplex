
import stream from 'stream';
import { v4 as uuidv4 } from 'uuid';
import * as plexTypes from '../plex/types';
import { sendWebSocketMessage } from '../streamutils';

export const sendMediaUnavailableNotifications = (sockets: stream.Duplex[] | undefined, options: {
	userID: number | string,
	metadataKey: string
}) => {
	const uuidVal = uuidv4();
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
		...options
	});
}

export const sendMediaUnavailableActivityNotification = (sockets: stream.Duplex[] | undefined, options: {
	uuid: string,
	eventType: plexTypes.PlexActivityEventType,
	userID: number | string,
	metadataKey: string
}) => {
	if(!sockets) {
		return;
	}
	const notification: plexTypes.PlexNotificationMessage = {
		NotificationContainer: {
			type: plexTypes.PlexNotificationType.Activity,
			size: 1,
			ActivityNotification: [
				{
					event: options.eventType,
					uuid: options.uuid,
					Activity: {
						uuid: options.uuid,
						type: plexTypes.PlexActivityType.LibraryRefreshItems,
						cancellable: false,
						userID: options.userID as number,
						title: "Refreshing",
						subtitle: "Checking Availability",
						progress: 100,
						Context: {
							accessible: false,
							analyzed: false,
							exists: false,
							key: options.metadataKey,
							refreshed: false
						}
					}
				}
			]
		}
	};
	const notificationString = JSON.stringify(notification);
	for(const socket of sockets) {
		sendWebSocketMessage(socket, notificationString);
	}
};
