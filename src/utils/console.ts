
// Include the stack trace of the console.error call when logging error messages
let includedTracesForWarnAndError = false;
export const includeTracesForConsoleWarnAndError = () => {
	if(includedTracesForWarnAndError) {
		console.warn("Already including traces for console.warn and console.error. Skipping...");
		return;
	}
	includedTracesForWarnAndError = true;
	
	const newlineRegex = /\r?\n/;
	const traceDividerString = "\n    ----";
	const errorTraceString = (ignoreDepth: number): string => {
		let traceString = (new Error()).stack;
		if(!traceString) {
			return '';
		}
		ignoreDepth += 1;
		let newlinePrefix = "";
		let match = newlineRegex.exec(traceString);
		if(match) {
			newlinePrefix = traceString.substring(match.index, match.index+match[0].length);
			traceString = traceString.slice(match.index+match[0].length);
			match = newlineRegex.exec(traceString);
			while(match && ignoreDepth > 0) {
				traceString = traceString.slice(match.index+match[0].length);
				match = newlineRegex.exec(traceString);
				ignoreDepth--;
			}
		}
		return newlinePrefix + traceString;
	};

	const innerError = console.error;
	console.error = function(...args) {
		return innerError.call(this, ...args, traceDividerString, errorTraceString(2));
	};

	const innerWarn = console.warn;
	console.warn = function(...args) {
		return innerWarn.call(this, ...args, traceDividerString, errorTraceString(2));
	};
};

// Include the log level before every log
let includedLogLevel = false;
export const includeLogLevelForAllLogs = () => {
	if(includedLogLevel) {
		console.warn("Already including pipe names for console. Skipping...");
		return;
	}
	includedLogLevel = true;

	function prependArg(args: any[], arg: string) {
		args.splice(0, 0, arg);
	}

	const innerError = console.error;
	console.error = function(...args) {
		prependArg(args, '[ERR]');
		return innerError.apply(this, args);
	};

	const innerWarn = console.warn;
	console.warn = function(...args) {
		prependArg(args, '[WARN]');
		return innerWarn.apply(this, args);
	};

	const innerLog = console.log;
	console.log = function(...args) {
		prependArg(args, '[LOG]');
		return innerLog.apply(this, args);
	};
};

// Include the current timestamp before every log
let includedTimestamps = false;
export const includeTimestampsForAllLogs = () => {
	if(includedTimestamps) {
		console.warn("Already including timestamps for console. Skipping...");
		return;
	}
	includedTimestamps = true;

	function insertTimestampArg(args: any[]) {
		args.splice(0, 0, `[${(new Date()).toLocaleString()}]`);
	}

	const innerError = console.error;
	console.error = function(...args) {
		insertTimestampArg(args);
		return innerError.apply(this, args);
	};

	const innerWarn = console.warn;
	console.warn = function(...args) {
		insertTimestampArg(args);
		return innerWarn.apply(this, args);
	};

	const innerLog = console.log;
	console.log = function(...args) {
		insertTimestampArg(args);
		return innerLog.apply(this, args);
	};
};

// Modify the colors of warnings and errors
let moddedColors = false;
export const modConsoleColors = () => {
	if(moddedColors) {
		console.warn("Console colors are already modded. Skipping...");
		return;
	}
	moddedColors = true;

	const innerConsoleError = console.error;
	console.error = function (...args) {
		process.stderr.write('\x1b[31m');
		let retVal = innerConsoleError.apply(this, args);
		process.stderr.write('\x1b[0m');
		return retVal
	};
	
	const innerConsoleWarn = console.warn;
	console.warn = function (...args) {
		process.stderr.write('\x1b[33m');
		let retVal = innerConsoleWarn.apply(this, args);
		process.stderr.write('\x1b[0m');
		return retVal;
	};
};
