
import fs from 'fs';
import path from 'path';

type WatchOptions = {
	debouncer?: ((callback: () => void) => void);
};

export const watchFilepathChanges = (filePath: string, opts: WatchOptions, callback: () => void): { close: () => void } => {
	const dirname = path.dirname(filePath);
	const filename = path.basename(filePath);
	let closed = false;
	let watcher: fs.FSWatcher;
	const dirWatcherCallback = (eventType: 'rename' | 'change', changedFilename: string) => {
		if(filename == changedFilename) {
			// watch file instead if it exists now
			if(fs.existsSync(filePath)) {
				watcher.close();
				if(closed) {
					return;
				}
				watcher = fs.watch(filePath, fileWatcherCallback);
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
			}
		}
	};
	const fileWatcherCallback = (eventType: 'rename' | 'change', changedFilename: string) => {
		// switch to watching the directory if the file no longer exists
		if(!fs.existsSync(filePath)) {
			watcher.close();
			if(closed) {
				return;
			}
			if(fs.existsSync(dirname)) {
				watcher = fs.watch(dirname, dirWatcherCallback);
			} else {
				console.error(`Directory ${dirname} no longer exists`);
			}
			return;
		} else if(closed) {
			return;
		}
		if(opts.debouncer) {
			opts.debouncer(() => {
				if(closed || !fs.existsSync(filePath)) {
					return;
				}
				callback();
			});
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
		}
	};
};
