import http from 'http';

export type ServerSentEventParts = {
	event?: string | null,
	data: string,
	id?: string | null,
	retry?: number | null,
};

export const createSSEMessage = (parts: ServerSentEventParts): string => {
	// https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
	// https://html.spec.whatwg.org/multipage/server-sent-events.html#server-sent-events

    let { event, data, id, retry } = parts;
	
	// ensure retry is a valid integer
	if(retry != null && !Number.isInteger(retry)) {
		const ogRetry = retry;
		console.warn(`The retry field in server-sent events must be an integer`);
		retry = Math.round(retry);
		if(!Number.isInteger(retry)) {
			retry = null;
			console.error(`Was not able to coerce retry field ${ogRetry} into an integer`);
		}
	}

	let message = '';

	// add id and event fields
	if (id != null) {
		message += `id: ${id}\n`;
	}
	if (event != null) {
		message += `event: ${event}\n`;
	}

	// Payload is sent as one or more "data:" lines
	// Split on newlines in case the payload itself has line breaks
	const lines = data.split(/\r?\n/);
	for (const line of lines) {
		message += `data: ${line}\n`;
	}

	// add retry field
	if(retry != null) {
		message += `retry: ${retry}\n`;
	}

	// ensure the message isn't empty, just to be safe
	if(!message) {
		throw new Error(`Failed to construct SSE message`);
	}

	// End of message (marked by a blank line, ie two consecutive newlines)
	message += '\n';
	return message;
};

export const sendSSEMessage = (res: http.ServerResponse, parts: ServerSentEventParts) => {
	const message = createSSEMessage(parts);
	res.write(message);
};
