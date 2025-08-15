
import fs from 'fs';
import path from 'path';
import type { Logger } from '../logging';

type WatchOptions = {
	debouncer?: ((callback: () => void) => void);
	logger?: Logger;
};

export const watchFilepathChanges = (filePath: string, opts: WatchOptions, callback: () => void): { close: () => void } => {
	const dirname = path.dirname(filePath);
	const filename = path.basename(filePath);
	let closed = false;
	let watchingDir = false;
	let watcher: fs.FSWatcher;
	const dirWatcherCallback = (eventType: 'rename' | 'change', changedFilename: string) => {
		opts.logger?.logWatchedDirectoryFileChanged(eventType, dirname, changedFilename);
		if(filename == changedFilename) {
			// watch file instead if it exists now
			if(fs.existsSync(filePath)) {
				watcher.close();
				opts.logger?.logStoppedWatchingDirectory(dirname);
				if(closed) {
					return;
				}
				watcher = fs.watch(filePath, fileWatcherCallback);
				watchingDir = false;
				opts.logger?.logWatchingFile(filePath);
				// wait a short delay before sending the change event, in case it changes again
				if(opts.debouncer) {
					opts.debouncer(() => {
						if(closed || !fs.existsSync(filePath)) {
							return;
						}
						callback();
					});
				} else {
					callback();
				}
			} else {
				// file doesn't exist anymore
			}
		} else {
			// change was for a different file, so ignore
		}
	};
	const fileWatcherCallback = (eventType: 'rename' | 'change', changedFilename: string) => {
		opts.logger?.logWatchedFileChanged(eventType, filePath, changedFilename);
		// switch to watching the directory if the file no longer exists
		if(!fs.existsSync(filePath)) {
			watcher.close();
			opts.logger?.logStoppedWatchingFile(filePath);
			if(closed) {
				return;
			}
			if(fs.existsSync(dirname)) {
				watcher = fs.watch(dirname, dirWatcherCallback);
				watchingDir = true;
				opts.logger?.logWatchingDirectory(dirname);
			} else {
				console.error(`Directory ${dirname} no longer exists`);
			}
			return;
		} else if(closed) {
			// we closed the watcher, so dont reopen
			return;
		}
		// wait a short delay before sending the change event, in case it changes again
		if(opts.debouncer) {
			opts.debouncer(() => {
				if(closed || !fs.existsSync(filePath)) {
					return;
				}
				callback();
			});
		} else {
			callback();
		}
	};
	if(fs.existsSync(filePath)) {
		watcher = fs.watch(filePath, fileWatcherCallback);
	} else {
		watcher = fs.watch(dirname, dirWatcherCallback);
	}
	return {
		close: () => {
			closed = true;
			watcher.close();
			if(watchingDir) {
				opts.logger?.logStoppedWatchingDirectory(dirname);
			} else {
				opts.logger?.logStoppedWatchingFile(filePath);
			}
		}
	};
};
