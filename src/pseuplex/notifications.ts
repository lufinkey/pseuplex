
import stream from 'stream';
import { v4 as uuidv4 } from 'uuid';
import * as plexTypes from '../plex/types';
import { sendWebSocketMessage } from '../streamutils';

export const sendMediaUnavailableNotification = (sockets: stream.Duplex[] | undefined, options: {userID: number | string, metadataKey: string}) => {
	if(!sockets) {
		return;
	}
	const uuidVal = uuidv4();
	const notification: plexTypes.PlexNotificationMessage = {
		NotificationContainer: {
			type: plexTypes.PlexNotificationType.Activity,
			size: 1,
			ActivityNotification: [
				{
					event: plexTypes.PlexActivityEventType.Ended,
					uuid: uuidVal,
					Activity: {
						uuid: uuidVal,
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
