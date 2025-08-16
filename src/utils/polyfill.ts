import http from 'http';
import tls from 'tls';
import { isRunningViaBun } from './compat';

if(isRunningViaBun()) {
	// bun documents these functions as accepting 2 args, but it doesnt actually work, so we need to polyfill them

	const ogCreateHttpServer = http.createServer;
	http.createServer = function(arg1, arg2) {
		if(arg2) {
			const server = ogCreateHttpServer.call(this, arg1);
			server.on('request', arg2);
			return server;
		} else {
			return ogCreateHttpServer.call(this,arg1);
		}
	} as any;

	const ogCreateTlsServer = tls.createServer;
	tls.createServer = function(arg1, arg2) {
		if(arg2) {
			const server = ogCreateTlsServer.call(this, arg1);
			server.on('request', arg2);
			return server;
		} else {
			return ogCreateTlsServer.call(this,arg1);
		}
	} as any;
}
