import fs from 'fs';
import { executeAsync } from './utils/subprocess';
import { Config } from './config';
import { parseCmdArgs } from './cmdargs';
import { PseuplexPluginClass } from './pseuplex';

// prepend the plugins path to NODE_PATH
let prependedPluginsPath = false;
const installedPluginsPath = `${require.main!.path}/../plugindeps/node_modules`;

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
	const pkgMgrName = process.env.NODE_PACKAGEMANAGER || "npm";
	await executeAsync(pkgMgrName, ["install", "--prefix", "./plugindeps", "--no-save", ...pluginArgs], {
		cwd: `${require.main!.path}/../`,
	});
};

export const importPlugins = async (cfg: Config): Promise<PseuplexPluginClass[]> => {
	// ensure the plugins search path exists
	if(!prependedPluginsPath) {
		module.paths.splice(0, 0, installedPluginsPath);
		prependedPluginsPath = true;
	}
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
