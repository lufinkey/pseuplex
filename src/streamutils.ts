
import stream from 'stream';

const createWebSocketFrame = (payload: string) => {
	// from https://betterprogramming.pub/implementing-a-websocket-server-from-scratch-in-node-js-a1360e00a95f
	
	const payloadByteLength = Buffer.byteLength(payload);
	let payloadBytesOffset = 2;
	let payloadLength = payloadByteLength;

	if (payloadByteLength > 65535) { // length value cannot fit in 2 bytes
		payloadBytesOffset += 8;
		payloadLength = 127;
	} else if (payloadByteLength > 125) {
		payloadBytesOffset += 2;
		payloadLength = 126;
	}

	const buffer = Buffer.alloc(payloadBytesOffset + payloadByteLength);

	// first byte
	buffer.writeUInt8(0b10000001, 0); // [FIN (1), RSV1 (0), RSV2 (0), RSV3 (0), Opсode (0x01 - text frame)]

	buffer[1] = payloadLength; // second byte - actual payload size (if <= 125 bytes) or 126, or 127

	if (payloadLength === 126) { // write actual payload length as a 16-bit unsigned integer
		buffer.writeUInt16BE(payloadByteLength, 2);
	} else if (payloadByteLength === 127) { // write actual payload length as a 64-bit unsigned integer
		buffer.writeBigUInt64BE(BigInt(payloadByteLength), 2);
	}

	buffer.write(payload, payloadBytesOffset);
	return buffer;
};

export const sendWebSocketMessage = (socket: stream.Duplex, payload: string) => {
	const buffer = createWebSocketFrame(payload);
	socket.write(buffer);
};
