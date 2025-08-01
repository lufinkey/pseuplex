import stream from 'stream';

export type PseuplexPossiblyConfirmedClientWebSocketInfo = {
	endpoint: string;
	socket: stream.Duplex;
	proxySocket?: stream.Duplex;
};

export type PseuplexUnconfirmedClientWebSocketInfo = PseuplexPossiblyConfirmedClientWebSocketInfo & {
	proxySocket: undefined;
};

export type PseuplexClientWebSocketInfo = PseuplexPossiblyConfirmedClientWebSocketInfo & {
	proxySocket: stream.Duplex;
};
