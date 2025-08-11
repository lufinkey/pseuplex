
export const includeTracesForConsoleWarnAndError = () => {
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
		innerError.call(this, ...args, traceDividerString, errorTraceString(2));
	};

	const innerWarn = console.warn;
	console.warn = function(...args) {
		innerWarn.call(this, ...args, traceDividerString, errorTraceString(2));
	};
};

let modded = false;
export const modConsoleColors = () => {
	if(modded) {
		console.warn("Console colors are already modded. Skipping...");
		return;
	}
	modded = true;

	const innerConsoleError = console.error;
	console.error = function (...args) {
		process.stderr.write('\x1b[31m');
		innerConsoleError.call(this, ...args);
		process.stderr.write('\x1b[0m');
	};
	
	const innerConsoleWarn = console.warn;
	console.warn = function (...args) {
		process.stderr.write('\x1b[33m');
		innerConsoleWarn.call(this, ...args);
		process.stderr.write('\x1b[0m');
	};
};
