import { spawn, SpawnOptions } from 'child_process';

export type SubprocessError = Error & {
	exitSignal?: NodeJS.Signals;
	exitCode?: number | null;
}

export const executeAsync = (cmd: string, args: string[] = [], opts: SpawnOptions = {}) => {
	return new Promise<void>((resolve, reject) => {
		const child = spawn(cmd, args, {
			...opts,
			stdio: opts.stdio ?? 'inherit',
		});

		child.on('error', reject);

		child.on('close', (code, signal) => {
			if (signal) {
				const error: SubprocessError = new Error(`Process terminated by signal ${signal}`);
				error.exitSignal = signal;
				return reject(error);
			}
			if (code !== 0) {
				const error: SubprocessError = new Error(`Process exited with code ${code}`);
				error.exitCode = code;
				return reject(error);
			}
			resolve();
		});
	});
}
