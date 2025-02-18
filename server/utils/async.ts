
export const promiseCountSettled = (promises: Iterable<Promise<any>>, expectedCount: number): Promise<void> => {
	return new Promise((resolve, reject) => {
		let completedCount = 0;
		let total = 0;
		for(const promise of promises) {
			total++;
			promise.then(() => {
				completedCount++;
				if(completedCount === expectedCount) {
					resolve();
				}
			}, (error) => {
				completedCount++;
				if(completedCount === expectedCount) {
					resolve();
				}
			});
		}
		if(expectedCount > total) {
			console.warn("Expected count is higher than the given number of promises. Count will be adjusted.");
			expectedCount = total;
		}
	});
};

export const waitForPromise = (promise: Promise<any>, abortSignal?: AbortSignal | null) => {
	if(!abortSignal) {
		return promise;
	}
	return new Promise((resolve, reject) => {
		let done = false;
		// listen for cancellation
		if(abortSignal.aborted) {
			reject(abortSignal.reason ?? new Error("Cancelled"));
			return;
		}
		const cancelCallback = () => {
			if(done) {
				return;
			}
			done = true;
			// finish with error
			reject(abortSignal.reason ?? new Error("Cancelled"));
		};
		abortSignal.addEventListener('abort', cancelCallback, {once:true});
		// wait for promise
		promise.then((result) => {
			if(done) {
				return;
			}
			done = true;
			// remove cancellation listener
			abortSignal.removeEventListener('abort', cancelCallback);
			// finish with result
			resolve(result);
		}, (error) => {
			if(done) {
				return;
			}
			done = true;
			// remove cancellation listener
			abortSignal.removeEventListener('abort', cancelCallback);
			// finish with error
			reject(error);
		});
	});
};
