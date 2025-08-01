import { waitForPromise } from '../utils/async';
import { HttpResponseError } from '../utils/error';
import { delay } from '../utils/timing';

export type RequestExecutorOptions = {
	maxRetries?: number;
	defaultDelay?: number;
	minimumDelay?: number;
	paddingDelay?: number;
	randomDelayMax?: number;
	backoffMultiplier?: number;
	maxParallelRequests?: number;
	occasionalDelayFrequency?: number;
	occasionalDelay?: number;
}

export class RequestExecutor {
	maxRetries: number;
	defaultDelay: number;
	minimumDelay?: number;
	paddingDelay: number;
	randomDelayMax: number;
	backoffMultiplier: number;
	maxParallelRequests?: number;
	occasionalDelayFrequency?: number;
	occasionalDelay: number;
	
	private _requestPromises = new Set<Promise<any>>();
	private _retryingRequestCount: number = 0;
	private _nextRetryTime: number | null = null;
	private _lastRequestEndTime: number | null = null;
	private _occasionalDelayCounter: number = 0;
	private _occasionalDelayPromise: Promise<void> | null = null;

	constructor(options?: RequestExecutorOptions) {
		this.maxRetries = options?.maxRetries ?? 3;
		this.defaultDelay = options?.defaultDelay ?? 5;
		this.minimumDelay = options?.minimumDelay;
		this.paddingDelay = options?.paddingDelay ?? 1;
		this.randomDelayMax = options?.randomDelayMax ?? 6;
		this.backoffMultiplier = options?.backoffMultiplier ?? 3;
		this.maxParallelRequests = options?.maxParallelRequests;
		this.occasionalDelayFrequency = options?.occasionalDelayFrequency;
		this.occasionalDelay = options?.occasionalDelay ?? 5;
	}

	getDelaySeconds(): number {
		return this._nextRetryTime ? Math.max(0, this._nextRetryTime - process.uptime()) : 0;
	}
	
	async do<T>(work: () => Promise<T>, abortSignal?: AbortSignal | null): Promise<T> {
		const delaySeconds = this.getDelaySeconds();
		return await this._delayAndThenDoWork(delaySeconds, this.maxRetries, abortSignal, work, true);
	}
	
	private async _delayAndThenDoWork<T>(
		delaySeconds: number,
		remainingRetries: number,
		abortSignal: AbortSignal | null | undefined,
		work: () => Promise<T>,
		firstAttempt: boolean,
	) {
		abortSignal?.throwIfAborted();
		// clear occasional delay counter if its been long enough
		if(this.occasionalDelayFrequency && this._lastRequestEndTime
			&& this._requestPromises.size == 0
			&& (process.uptime() - this._lastRequestEndTime) > this.occasionalDelay
		) {
			this._occasionalDelayCounter = 0;
		}
		// wait for occasional delay if needed
		if(this._occasionalDelayPromise) {
			await waitForPromise(this._occasionalDelayPromise, abortSignal);
		}
		// set next occasional delay if needed
		if (this.occasionalDelayFrequency) {
			this._occasionalDelayCounter++;
			if (this._occasionalDelayCounter >= this.occasionalDelayFrequency) {
				this._occasionalDelayCounter = 0;
				this._occasionalDelayPromise = delay(this.occasionalDelay * 1000).finally(() => {
					this._occasionalDelayPromise = null;
				});
			}
		}
		do {
			// check if request should be delayed
			if(delaySeconds > 0 || this._retryingRequestCount > 0) {
				if(delaySeconds > 0) {
					console.warn(`Waiting ${delaySeconds} seconds to send request`);
					await delay(delaySeconds * 1000, abortSignal);
				}
				abortSignal?.throwIfAborted();
				// wait for all pending requests to finish while any requests are being retried
				if(this._requestPromises.size > 0 && this._retryingRequestCount > 0) {
					console.warn(`Waiting for pending requests to finish`);
					while(this._requestPromises.size > 0 && this._retryingRequestCount > 0) {
						try {
							await Promise.allSettled(this._requestPromises);
						} catch {}
						abortSignal?.throwIfAborted();
					}
				}
			}
			// ensure a maximum number of parallel requests
			if(this.maxParallelRequests) {
				while(this._requestPromises.size >= this.maxParallelRequests) {
					try {
						await Promise.race(this._requestPromises);
					} catch {}
					abortSignal?.throwIfAborted();
				}
			}
			// check if request still needs to be delayed
			delaySeconds = this.getDelaySeconds();
			if(delaySeconds > 0) {
				delaySeconds += (Math.random() * this.randomDelayMax);
			}
		} while(delaySeconds > 0);
		// do the request
		if(remainingRetries <= 0) {
			return await this._doRequestWork(work, abortSignal);
		}
		try {
			return await this._doRequestWork(work, abortSignal);
		} catch(error) {
			if(abortSignal?.aborted) {
				throw error;
			}
			const res = (error as HttpResponseError)?.httpResponse;
			if (res && res.status == 429) {
				console.error(`Got 429 response from ${res.url}`);
				// Got 429, which means we need to wait before retrying
				let retryAfterSeconds = this._getRetryAfterSeconds(res);
				const nextRetryTime = process.uptime() + retryAfterSeconds;
				if(!this._nextRetryTime || nextRetryTime > this._nextRetryTime) {
					this._nextRetryTime = nextRetryTime;
				}
				// pad retry seconds a bit
				if(this.minimumDelay && retryAfterSeconds < this.minimumDelay) {
					retryAfterSeconds = this.minimumDelay;
				}
				retryAfterSeconds += this.paddingDelay;
				retryAfterSeconds += (Math.random() * this.randomDelayMax);
				retryAfterSeconds += (this._retryingRequestCount * this.backoffMultiplier);
				if(firstAttempt) {
					// on the first attempt, we should count the retry
					this._retryingRequestCount++;
					try {
						return await this._delayAndThenDoWork(retryAfterSeconds, remainingRetries-1, abortSignal, work, false);
					} finally {
						this._retryingRequestCount--;
					}
				} else {
					// on subsequent attempts, the retry is already counted, so no need to count again
					return await this._delayAndThenDoWork(retryAfterSeconds, remainingRetries-1, abortSignal, work, false);
				}
			}
			throw error;
		}
	}

	private _doRequestWork<T>(work: () => Promise<T>, abortSignal?: AbortSignal | null): Promise<T> {
		let promise = work();
		if(!promise) {
			return promise;
		}
		this._requestPromises.add(promise);
		return promise.finally(() => {
			this._requestPromises.delete(promise);
			this._lastRequestEndTime = process.uptime();
		});
	}

	private _getRetryAfterSeconds(res: Response): number {
		const retryAfter = res.headers.get('Retry-After');
		let retryAfterSeconds: number | null | undefined;
		if(retryAfter) {
			retryAfterSeconds = Number.parseFloat(retryAfter);
			if(Number.isNaN(retryAfterSeconds)) {
				retryAfterSeconds = null;
				try {
					const retryAfterDate = new Date(retryAfter);
					retryAfterSeconds = (retryAfterDate.getTime() - (new Date()).getTime()) / 1000;
				} catch(error) {
					console.error(`Failed to parse Retry-After header ${retryAfter}`);
					console.error(error);
				}
			}
		}
		if(!retryAfterSeconds) {
			retryAfterSeconds = this.defaultDelay;
		}
		return retryAfterSeconds;
	}
}


export class RequestManager {
	readonly options: RequestExecutorOptions;
	readonly executors: {[domain: string]: RequestExecutor} = {};

	constructor(options: RequestExecutorOptions) {
		this.options = options;
	}

	do<T>(domain: string, work: () => Promise<T>, abortSignal?: AbortSignal): Promise<T> {
		let executor = this.executors[domain];
		if(!executor) {
			executor = new RequestExecutor(this.options);
			this.executors[domain] = executor;
		}
		return executor.do(work, abortSignal);
	}
}
