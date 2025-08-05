
export type RequestInfo = {
	requestId: string | number;
	requestStatus: RequestStatus;
	mediaStatus: RequestedMediaStatus;
	seasons?: number[];
};


export enum RequestStatus {
	Unknown,
	PendingApproval,
	Approved,
	Declined
}

export const requestStatusDisplayText = (status: RequestStatus) => {
	switch(status) {
		case RequestStatus.Unknown:
			return "Unknown";
		
		case RequestStatus.PendingApproval:
			return "Pending Approval";

		case RequestStatus.Approved:
			return "Approved";
		
		case RequestStatus.Declined:
			return "Declined";
	}
	return "Who knows";
};


export enum RequestedMediaStatus {
	Unknown,
	Pending,
	Processing,
	PartiallyAvailable,
	Available
}

export const requestedMediaStatusDisplayText = (status: RequestedMediaStatus) => {
	switch(status) {
		case RequestedMediaStatus.Unknown:
			return "Unknown";
		
		case RequestedMediaStatus.Pending:
			return "Pending";

		case RequestedMediaStatus.Processing:
			return "Processing";
		
		case RequestedMediaStatus.PartiallyAvailable:
			return "Partially Available";

		case RequestedMediaStatus.Available:
			return "Available";
	}
	return "Who knows";
};
