import { PlexMediaItemTypeNumeric, PlexPluginIdentifier } from "./common";

export type PlexNotificationMessage = {
	NotificationContainer: PlexNotificationContainer
};

export enum PlexNotificationType {
	Activity = 'activity',
	Progress = 'progress',
	Status = 'status',
	BackgroundProcessingQueue = 'backgroundProcessingQueue',
	Timeline = 'timeline',
	Playing = 'playing',
	UpdateStateChange = 'update.statechange',
};

export type PlexNotificationContainer = (
	PlexActivityNotificationContainer
	| PlexProgressNotificationContainer
	| PlexStatusNotificationContainer
	| PlexBackgroundProcessingQueueEventNotificationContainer
	| PlexTimelineEntryNotificationContainer
	| PlexPlaySessionStateNotificationContainer
	| PlexAutoUpdateNotificationContainer
);


// Activity Event

export enum PlexActivityEventType {
	Started = 'started',
	Updated = 'updated',
	Ended = 'ended'
};

export enum PlexActivityType {
	LibraryRefreshItems = 'library.refresh.items',
	LibraryUpdateSection = 'library.update.section',
	LibraryUpdateItemMetadata = 'library.update.item.metadata',
	ProviderSubscriptionsProcess = 'provider.subscriptions.process',
	MediaGenerateCredits = 'media.generate.credits',
	MediaGenerateChapterThumbs = 'media.generate.chapter.thumbs',
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
		progress: number; // 0, 100
		Context?: {
			key?: string;
			accessible?: boolean;
			exists?: boolean;
			refreshed?: boolean;
			analyzed?: boolean;
			librarySectionID?: `${number}` | string; // "1"
		}
	}
};

export type PlexActivityNotificationContainer = {
	type: PlexNotificationType.Activity;
	size: number;
	ActivityNotification: PlexActivityNotification[];
};



// Progress Event

export type PlexProgressNotification = {
	message: string; // "Scanning Legend (1985) US (1080p BluRay x265 HEVC 10bit AAC 5.1)"
};

export type PlexProgressNotificationContainer = {
	type: PlexNotificationType.Progress;
	size: number;
	ProgressNotification: PlexProgressNotification[];
};



// Status Event

export enum PlexStatusNotificationName {
	LibraryUpdate = 'LIBRARY_UPDATE'
}

export type PlexStatusNotification = {
	title: string; // "Scanning the \"Movies\" section"
	description: string;
	notificationName: PlexStatusNotificationName;
};

export type PlexStatusNotificationContainer = {
	type: PlexNotificationType.Status;
	size: number;
	StatusNotification: PlexStatusNotification[];
};



// Background Processing

export enum PlexBackgroundProcessingQueueEventType {
	QueueRegenerated = 'queueRegenerated',
}

export type PlexBackgroundProcessingQueueEventNotification = {
	queueID: number; // 1
	event: PlexBackgroundProcessingQueueEventType;
};

export type PlexBackgroundProcessingQueueEventNotificationContainer = {
	type: PlexNotificationType.BackgroundProcessingQueue;
	size: number;
	BackgroundProcessingQueueEventNotification: PlexBackgroundProcessingQueueEventNotification[];
};



// Timeline Entry

export enum PlexTimelineEntryNotificationState {
	Created = 0,
	State1 = 1,
	State2 = 2,
	StartedRefresh = 3,
	AddingExtras = 4,
	FinishedRefresh = 5,
	Deleted = 9,
};

export enum PlexTimelineEntryNotificationMetadataState {
	Created = 'created',
	Processing = 'processing',
	Loading = 'loading',
	Queued = 'queued',
	Deleted = 'deleted',
}

export enum PlexTimelineEntryNotificationMediaState {
	Analyzing = 'analyzing',
	Thumbnailing = 'thumbnailing',
}

export type PlexTimelineEntryNotification = {
	identifier: PlexPluginIdentifier;
	sectionID?: `${number}` | string; // "1", "-1"
	itemID: `${number}` | string; // "45"
	type: PlexMediaItemTypeNumeric;
	title: string;
	state: PlexTimelineEntryNotificationState; // 0
	metadataState?: PlexTimelineEntryNotificationMetadataState; // "created"
	mediaState?: PlexTimelineEntryNotificationMediaState; // "analyzing"
	updatedAt: number; // 1753656127
};

export type PlexTimelineEntryNotificationContainer = {
	type: PlexNotificationType.Timeline;
	size: number;
	TimelineEntry: PlexTimelineEntryNotification[];
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
};

export type PlexPlaySessionStateNotificationContainer = {
	type: PlexNotificationType.Playing;
	size: number;
	PlaySessionStateNotification: PlexPlaySessionStateNotification[];
};



// Update State Change

export enum PlexAutoUpdateNotificationState {
	Done = 'done',
}

export type PlexAutoUpdateNotification = {
	key: string;
	version: string;
	state: PlexAutoUpdateNotificationState;
};

export type PlexAutoUpdateNotificationContainer = {
	type: PlexNotificationType.UpdateStateChange;
	size: number;
	AutoUpdateNotification: PlexAutoUpdateNotification[];
};
