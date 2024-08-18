
export enum PlexNotificationType {
	Activity = 'activity',
	Playing = 'playing'
};

export type PlexNotification = {
	type: PlexNotificationType.Activity;
	size: number;
	ActivityNotification?: PlexActivityNotification[];
} | {
	type: PlexNotificationType.Playing;
	size: number;
	PlaySessionStateNotification?: PlexPlaySessionStateNotification[];
};


// Activity Event

export enum PlexActivityEventType {
	Started = 'started',
	Updated = 'updated',
	Ended = 'ended'
};

export enum PlexActivityType {
	LibraryRefreshItems = 'library.refresh.items'
}

export type PlexActivityNotification = {
	event: PlexActivityEventType;
	uuid: string; // "39cc0658-9cf6-4077-9237-1e575ca32204"
	Activity: {
		uuid: string; // "39cc0658-9cf6-4077-9237-1e575ca32204"
		type: PlexActivityType;
		cancellable: boolean;
		userID: number;
		title: string;
		subtitle: string;
		progress: number;
		Context?: {
			key: string;
			accessible?: boolean;
			exists?: boolean;
			refreshed?: boolean;
			analyzed?: boolean;
		}
	}
};


// Play Session State Event

export enum PlexPlaySessionState {
	Playing = 'playing',
	Paused = 'paused'
}

export type PlexPlaySessionStateNotification = {
	sessionKey: string; // "104"
	clientIdentifier: string;
	guid?: string;
	ratingKey: string;
	url?: string;
	key: string;
	viewOffset: number;
	playQueueItemID: number;
	playQueueID: number;
	state: PlexPlaySessionState;
}
