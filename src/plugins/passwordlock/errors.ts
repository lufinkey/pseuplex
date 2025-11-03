
import { LoggingOptions } from '../../logging';
import { HttpError } from '../../utils/error';

export class LibraryIsLockedError extends Error implements HttpError {
	statusCode: number = 403;
	silent: boolean;

	constructor(loggingOptions: LoggingOptions | null | undefined) {
		super("Library is Locked");
		this.silent = !(loggingOptions?.logLibraryIsLocked ?? false);
	}
}
