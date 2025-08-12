import {
	spawn,
	SpawnOptions,
	SpawnOptionsWithoutStdio
} from 'child_process';
import { isStringNullOrWhitespace } from './strings';

export type SubprocessError = Error & {
	exitSignal?: NodeJS.Signals;
	exitCode?: number | null;
}

export const executeAsync = (cmd: string, args: string[] = [], opts: SpawnOptions = {}): Promise<void> => {
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

export const executeAndGetOutputAsync = (cmd: string, args: string[] = [], opts: SpawnOptionsWithoutStdio = {}): Promise<Buffer> => {
	return new Promise<Buffer>((resolve, reject) => {
		const child = spawn(cmd, args, {
			...opts,
			stdio: 'pipe',
		});

		child.on('error', reject);

		let stdoutChunks: Buffer[] = [];
		let stderrChunks: Buffer[] = [];

		child.stdout.on('data', (chunk) => {
			stdoutChunks.push(chunk);
		});

		child.stderr.on('data', (chunk) => {
			stderrChunks.push(chunk);
		});

		const getErrorMessage = (message: string) => {
			const stderrBuffer = Buffer.concat(stderrChunks);
			let stderrString = stderrBuffer.toString('utf8');
			if(isStringNullOrWhitespace(stderrString)) {
				if(stderrString.endsWith('\n')) {
					return `${stderrString}${message}`;
				} else {
					return `${stderrString}\n${message}`;
				}
			} else {
				return message;
			}
		};

		child.on('close', (code, signal) => {
			if (signal) {
				const error: SubprocessError = new Error(getErrorMessage(`Process terminated by signal ${signal}`));
				error.exitSignal = signal;
				reject(error);
				return;
			}
			if (code !== 0) {
				const error: SubprocessError = new Error(getErrorMessage(`Process exited with code ${code}`));
				error.exitCode = code;
				reject(error);
				return;
			}
			resolve(Buffer.concat(stdoutChunks));
		});
	});
}
