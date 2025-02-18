
export const createDebouncer = (delay: number): ((callback: () => void) => void) => {
	let timeout: NodeJS.Timeout | null = null;
	return (callback: () => void) => {
		if(timeout) {
			clearTimeout(timeout);
		}
		timeout = setTimeout(() => {
			timeout = null;
			callback();
		}, delay);
	};
};

export const delay = (milliseconds: number, abortSignal?: AbortSignal | null) => {
	return new Promise<void>((resolve, reject) => {
		if(abortSignal) {
			let timeout: NodeJS.Timeout;
			// listen for cancellation
			if(abortSignal.aborted) {
				reject(abortSignal.reason ?? new Error("Cancelled"));
				return;
			}
			const cancelCallback = () => {
				// cancel timeout
				clearTimeout(timeout);
				// finish with error
				reject(abortSignal.reason ?? new Error("Cancelled"));
			};
			abortSignal.addEventListener('abort', cancelCallback, {once:true});
			// wait for delay
			timeout = setTimeout(() => {
				// remove cancellation listener
				abortSignal.removeEventListener('abort', cancelCallback);
				// finish with success
				resolve();
			}, milliseconds);
		} else {
			setTimeout(resolve, milliseconds);
		}
	});
};
