
import os from 'os';
import fs from 'fs';
import util from 'util';
import crypto from 'crypto';
import child_process from 'child_process';
import WinRegistry from 'winreg';
import { plexXMLToJS } from './serialization';
import { PlexPreferences } from './types';

const execFileAsync = util.promisify(child_process.execFile);

const PlexAppDataDir_Linux = "/var/lib/plexmediaserver/Library/Application Support/Plex Media Server";

export const readPlexPreferences = async (opts?: {appDataPath?: string, prefFilePath?: string}): Promise<PlexPreferences> => {
	if(opts?.prefFilePath) {
		if(opts.prefFilePath.endsWith('.plist')) {
			return await readPrefsFromPlist(opts.prefFilePath);
		}
		return await readPrefsFromXML(opts.prefFilePath);
	} else if(opts?.appDataPath) {
		const xmlPath = `${opts.appDataPath}/Preferences.xml`;
		if(fs.existsSync(xmlPath)) {
			return await readPrefsFromXML(xmlPath);
		}
	}
	switch(process.platform) {
		case 'win32':
			return await readPrefsFromWinReg();

		case 'darwin':
			return await readPrefsFromMacOSDefaults();

		case 'linux':
		default:
			return await readPrefsFromXML(`${opts?.appDataPath ?? PlexAppDataDir_Linux}/Preferences.xml`);
	}
};

const readPrefsFromXML = async (configPath: string): Promise<PlexPreferences> => {
	const configData = await fs.promises.readFile(configPath, {
		encoding: 'utf8'
	});
	const xmlObj: {Preferences:PlexPreferences} = await plexXMLToJS(configData);
	return xmlObj.Preferences;
};

const readPrefsFromWinReg = async (): Promise<PlexPreferences> => {
	const reg = new WinRegistry({
		hive: WinRegistry.HKCU,
		key: "\\Software\\Plex, Inc.\\Plex Media Server"
	});
	const items: WinRegistry.RegistryItem[] = await util.promisify(reg.values.bind(reg))();
	const cfg: PlexPreferences = {} as any;
	for(const item of items) {
		cfg[item.name] = item.value;
	}
	return cfg;
};

const readPrefsFromMacOSDefaults = async (): Promise<PlexPreferences> => {
	const { stdout: plistOut } = await execFileAsync('defaults', ['export', 'com.plexapp.plexmediaserver', '-']);
	return await readPrefsFromPlist('-', plistOut);
};

const readPrefsFromPlist = async (plistPath: string | '-', stdin?: string): Promise<PlexPreferences> => {
	const jsonOut: string = await new Promise((resolve, reject) => {
		const child = child_process.execFile('plutil', ['-convert', 'json', '-o', '-', plistPath], (error, stdout, stderr) => {
			if(error) {
				reject(error);
			} else {
				resolve(stdout);
			}
		});
		if(plistPath == '-') {
			child.stdin!.write(stdin);
			child.stdin!.end();
		}
	});
	return JSON.parse(jsonOut);
};

export const calculatePlexP12Password = (prefs: {ProcessedMachineIdentifier}): string => {
	return crypto.createHash('sha512').update(`plex${prefs.ProcessedMachineIdentifier}`).digest('hex');
};

export const getPlexP12Path = (opts: {appDataPath?: string, appCachePath?: string}) => {
	switch(process.platform) {
		case 'win32':
			return `${opts?.appDataPath || `${os.homedir()}/AppData/Local/Plex Media Server`}/Cache/cert-v2.p12`;

		case 'darwin':
			return `${opts?.appCachePath || `${os.homedir()}/Library/Caches/PlexMediaServer`}/cert-v2.p12`;

		case 'linux':
		default:
			return `${opts?.appDataPath || PlexAppDataDir_Linux}/Cache/cert-v2.p12`;
	}
};
