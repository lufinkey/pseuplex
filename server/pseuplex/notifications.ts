
import stream from 'stream';
import crypto from 'crypto';
import * as plexTypes from '../plex/types';
import {
	PlexNotificationSender,
	SendPlexNotificationOptions,
	sendPlexNotifications,
} from '../plex/notifications';


export const sendMediaUnavailableNotifications = (senders: PlexNotificationSender[], notif: {
	userID: number | string,
	metadataKey: string,
}, options: SendPlexNotificationOptions) => {
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
	sendMediaUnavailableActivityNotification(senders, {
		uuid: uuidVal,
		eventType: plexTypes.PlexActivityEventType.Ended,
		...notif
	}, options);
}

export const sendMediaUnavailableActivityNotification = (senders: PlexNotificationSender[], notif: {
	uuid: string,
	eventType: plexTypes.PlexActivityEventType,
	userID: number | string,
	metadataKey: string
}, options: SendPlexNotificationOptions) => {
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
	sendPlexNotifications(senders, notification, options);
};



export const sendMetadataRefreshTimelineNotifications = (senders: PlexNotificationSender[], items: {
	itemID: string,
	sectionID: string,
	type: plexTypes.PlexMediaItemTypeNumeric,
	updatedAt: number,
}[], options: SendPlexNotificationOptions) => {
	sendMetadataRefreshTimelineEntryNotification(senders, items.map((item) => {
		return {
			state: plexTypes.PlexTimelineEntryNotificationState.StartedRefresh,
			metadataState: plexTypes.PlexTimelineEntryNotificationMetadataState.Queued,
			title: `Refreshing ${item.itemID}`,
			...item,
		};
	}), options);

	sendMetadataRefreshTimelineEntryNotification(senders, items.map((item) => {
		return {
			state: plexTypes.PlexTimelineEntryNotificationState.FinishedRefresh,
			title: `Done refreshing ${item.itemID}`,
			...item,
		};
	}), options);
};

export const sendMetadataRefreshTimelineEntryNotification = (senders: PlexNotificationSender[], items: {
	itemID: string,
	type: plexTypes.PlexMediaItemTypeNumeric,
	sectionID?: string,
	state: plexTypes.PlexTimelineEntryNotificationState,
	metadataState?: plexTypes.PlexTimelineEntryNotificationMetadataState,
	title: string,
	updatedAt: number,
}[], options: SendPlexNotificationOptions) => {
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
	sendPlexNotifications(senders, notification, options);
};
