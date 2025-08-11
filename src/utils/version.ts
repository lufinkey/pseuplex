import fs from 'fs';
import { executeAndGetOutputAsync } from './subprocess';
import { getFirstLineOfString } from './misc';
import packageJson from '../../package.json';

export type AppVersion = {
	version: string;
	tag: string | undefined;
	commitHash: string | undefined;
	dirty: boolean | undefined;
};

export const getAppVersion = async (): Promise<AppVersion> => {
	const modulePath = `${require.main!.path}/..`;

	// check git state
	let gitTag: string | undefined;
	let gitCommitHash: string | undefined;
	let gitDirty: boolean | undefined;
	const isGitRepo = await new Promise((resolve, reject) => fs.exists(`${modulePath}/.git`, resolve));
	if(isGitRepo) {
		// parse git tag
		try {
			const output = await executeAndGetOutputAsync('git', ['tag', '--points-at', 'HEAD']);
			const outputString = output.toString('utf8');
			const firstLine = getFirstLineOfString(outputString);
			if(firstLine) {
				gitTag = firstLine;
			}
		} catch(error) {
			console.error(`Error calling git tag command:`);
			console.error(error);
		}
		// parse git commit hash
		try {
			const output = await executeAndGetOutputAsync('git', ['rev-parse', 'HEAD']);
			const outputString = output.toString('utf8');
			const firstLine = getFirstLineOfString(outputString);
			if(firstLine) {
				gitCommitHash = firstLine;
			}
		} catch(error) {
			console.error(`Error calling git rev-parse command:`);
			console.error(error);
		}
		// check if git has any revisions
		try {
			const output = await executeAndGetOutputAsync('git', ['status', '-s']);
			const outputString = output.toString('utf8').trim();
			if(outputString) {
				gitDirty = true;
			} else {
				gitDirty = false;
			}
		} catch(error) {
			console.error(`Error calling git rev-parse command:`);
			console.error(error);
		}
	}

	return {
		version: packageJson.version,
		tag: gitTag,
		commitHash: gitCommitHash,
		dirty: gitDirty,
	};
};

export const getAppVersionString = async (): Promise<string> => {
	const appVersion = await getAppVersion();
	if(appVersion.tag) {
		return `${appVersion.tag}` + (appVersion.dirty ? ' (dirty)' : '');
	} else if(appVersion.version) {
		if(appVersion.commitHash) {
			return `v${appVersion.version}`
				+ (appVersion.commitHash
					? ` (rev ${appVersion.commitHash}${appVersion.dirty ? ', dirty' : ''})`
					: '');
		} else {
			return `v${appVersion.version}`;
		}
	} else if(appVersion.commitHash) {
		return `rev ${appVersion.commitHash}` + (appVersion.dirty ? ' (dirty)' : '');
	} else {
		return "v?.?.?";
	}
};
