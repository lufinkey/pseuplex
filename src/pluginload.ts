import fs from 'fs';
import { executeAsync } from './utils/subprocess';
import { Config } from './config';
import { parseCmdArgs } from './cmdargs';
import { PseuplexPluginClass } from './pseuplex';

const pluginNamePrefix = 'pseuplex-plugin-';
const getPluginModuleName = (id: string) => {
	if(id.startsWith(pluginNamePrefix)) {
		return id;
	}
	return `${pluginNamePrefix}${id}`;
};

export const installPlugins = async (cfg: Config) => {
	if(!cfg?.plugins) {
		return;
	}
	const pluginIds = Object.keys(cfg.plugins);
	if(pluginIds.length == 0) {
		return;
	}
	console.log(`Installing plugins: ${JSON.stringify(cfg.plugins, null, '\t')}`);
	const pluginArgs = pluginIds.map((id) => `${getPluginModuleName(id)}@${cfg.plugins![id]}`);
	await executeAsync(process.env.NODE_PACKAGEMANAGER || "npm", ["install", "--no-save", ...pluginArgs], {
		cwd: `${require.main!.path}/../`,
	});
};

export const importPlugins = async (cfg: Config): Promise<PseuplexPluginClass[]> => {
	if(!cfg?.plugins) {
		return [];
	}
	const pluginIds = Object.keys(cfg.plugins).map((id) => getPluginModuleName(id));
	if(pluginIds.length == 0) {
		return [];
	}
	return await Promise.all(pluginIds.map(async (pluginId) => {
		return (await import(pluginId)).default;
	}));
};
