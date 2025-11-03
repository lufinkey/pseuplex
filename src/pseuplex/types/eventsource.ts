import http from 'http';

export type PseuplexEventSourceSubscriber = {
	response: http.ServerResponse;
	proxyResponse: http.IncomingMessage;
};
