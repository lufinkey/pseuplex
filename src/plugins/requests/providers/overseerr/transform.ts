import {
	RequestInfo,
	RequestStatus,
	RequestedMediaStatus
} from '../../types';
import * as overseerrTypes from './apitypes'

export const requestStatusFromOverseerrRequestStatus = (status: overseerrTypes.MediaRequestStatus): RequestStatus => {
	switch(status) {
		case overseerrTypes.MediaRequestStatus.PendingApproval:
			return RequestStatus.PendingApproval;
		
		case overseerrTypes.MediaRequestStatus.Approved:
			return RequestStatus.Approved;

		case overseerrTypes.MediaRequestStatus.Declined:
			return RequestStatus.Declined;
	}
	return RequestStatus.Unknown;
};

export const mediaStatusFromOverseerrMediaStatus = (status: overseerrTypes.MediaStatus): RequestedMediaStatus => {
	switch(status) {
		case overseerrTypes.MediaStatus.Pending:
			return RequestedMediaStatus.Pending;
		
		case overseerrTypes.MediaStatus.Processing:
			return RequestedMediaStatus.Processing;

		case overseerrTypes.MediaStatus.PartiallyAvailable:
			return RequestedMediaStatus.PartiallyAvailable;
		
		case overseerrTypes.MediaStatus.Available:
			return RequestedMediaStatus.Available;
	}
	return RequestedMediaStatus.Unknown;
};

export const transformOverseerrRequestItem = (
	request: overseerrTypes.CreateRequestItemResult | overseerrTypes.MediaRequestInfo,
	mediaItem: overseerrTypes.MediaItemInfo,
	opts: {seasons?: number[] | undefined},
): RequestInfo => {
	return {
		requestId: request.id,
		requestStatus: requestStatusFromOverseerrRequestStatus(request.status),
		mediaStatus: mediaStatusFromOverseerrMediaStatus(mediaItem.status),
		seasons: opts.seasons,
	};
}
