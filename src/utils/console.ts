
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
