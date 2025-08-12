import fs from 'fs';
import { SpawnOptionsWithoutStdio } from 'child_process';
import { executeAndGetOutputAsync } from './subprocess';
import { getFirstLineOfString } from './misc';
import packageJson from '../../package.json';

export type AppVersion = {
	version: string;
	git: boolean;
	tag: string | undefined;
	branch: string | undefined;
	commit: string | undefined;
	dirty: boolean | undefined;
};

export const getAppVersion = async (): Promise<AppVersion> => {
	const modulePath = `${require.main!.path}/..`;
	const cmdOpts: SpawnOptionsWithoutStdio = {
		cwd: modulePath,
	}

	// check git state
	let gitTag: string | undefined;
	let gitCommitHash: string | undefined;
	let gitDirty: boolean | undefined;
	let gitBranch: string | undefined;
	const isGitRepo = await new Promise<boolean>((resolve, reject) => fs.exists(`${modulePath}/.git`, resolve));
	if(isGitRepo) {
		// parse git tag
		[gitTag, gitCommitHash, gitDirty, gitBranch] = await Promise.all([
			(async () => {
				// get any tag that points at this commit
				try {
					const output = await executeAndGetOutputAsync('git', ['tag', '--points-at', 'HEAD'], cmdOpts);
					const outputString = output.toString('utf8');
					const firstLine = getFirstLineOfString(outputString);
					if(firstLine) {
						return firstLine;
					}
				} catch(error) {
					console.error(`Error calling git tag command:`);
					console.error(error);
				}
			})(),
			(async () => {
				// parse git commit hash
				try {
					const output = await executeAndGetOutputAsync('git', ['rev-parse', 'HEAD'], cmdOpts);
					const outputString = output.toString('utf8');
					const firstLine = getFirstLineOfString(outputString);
					if(firstLine) {
						return firstLine;
					}
				} catch(error) {
					console.error(`Error calling git rev-parse command:`);
					console.error(error);
				}
			})(),
			(async () => {
				// check if git has any revisions
				try {
					const output = await executeAndGetOutputAsync('git', ['status', '--short'], cmdOpts);
					const outputString = output.toString('utf8').trim();
					return outputString ? true : false;
				} catch(error) {
					console.error(`Error calling git rev-parse command:`);
					console.error(error);
				}
			})(),
			(async () => {
				// get current git branch
				try {
					const output = await executeAndGetOutputAsync('git', ['branch', '--show-current'], cmdOpts);
					const outputString = output.toString('utf8');
					const firstLine = getFirstLineOfString(outputString);
					if(firstLine) {
						return firstLine;
					}
				} catch(error) {
					console.error(`Error calling git tag command:`);
					console.error(error);
				}
			})(),
		]);
	}

	return {
		version: packageJson.version,
		git: isGitRepo,
		tag: gitTag,
		commit: gitCommitHash,
		branch: gitBranch,
		dirty: gitDirty,
	};
};

export const getAppVersionString = async (): Promise<string> => {
	const appVersion = await getAppVersion();
	if(appVersion.tag) {
		return `${appVersion.tag}` + (appVersion.dirty ? ' (dirty)' : '');
	} else if(appVersion.version) {
		if(appVersion.git) {
			const parenthesParts: string[] = [];
			if(appVersion.branch) {
				parenthesParts.push(`branch ${appVersion.branch}`);
			}
			if(appVersion.commit) {
				parenthesParts.push(`commit ${appVersion.commit}`);
			}
			if(appVersion.dirty) {
				parenthesParts.push('dirty');
			}
			if(parenthesParts.length > 0) {
				return `v${appVersion.version} (${parenthesParts.join(", ")})`;
			}
		}
		return `v${appVersion.version}`;
	} else if(appVersion.commit) {
		return `rev ${appVersion.commit}` + (appVersion.dirty ? ' (dirty)' : '');
	} else {
		return "v?.?.?";
	}
};
