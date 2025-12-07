import * as constants from './constants';
import { Config } from './config';
import { PseuplexPluginClass } from './pseuplex';
import { executeAsync } from './utils/subprocess';

const initialCwd = process.cwd();
const pluginDepsPath = `${initialCwd}/plugindeps`;

let prependedPluginsPath = false;
const installedPluginsPath = `${pluginDepsPath}/node_modules`;

const pluginNamePrefix = `${constants.APP_SLUG}-plugin-`;
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
	console.log(`Installing plugins to ${pluginDepsPath}`);
	for(const pluginId of pluginIds) {
		console.log(`\t${pluginId}: ${cfg.plugins[pluginId]}`);
	}
	const pluginArgs = pluginIds.map((id) => `${getPluginModuleName(id)}@${cfg.plugins![id]}`);
	const pkgMgrName = process.env.NODE_PACKAGEMANAGER || "npm";
	// TODO run install differently depending on process.env.npm_lifecycle_event
	await executeAsync(pkgMgrName, ["install", "--prefix", pluginDepsPath, "--no-save", ...pluginArgs], {
		cwd: initialCwd,
	});
	console.log();
};

export const importPlugins = async (cfg: Config): Promise<PseuplexPluginClass[]> => {
	if(!cfg?.plugins) {
		return [];
	}
	const pluginMapKeys = Object.keys(cfg.plugins);
	if(pluginMapKeys.length == 0) {
		return [];
	}
	// ensure the plugins search path exists
	if(!prependedPluginsPath) {
		module.paths.splice(0, 0, installedPluginsPath);
		prependedPluginsPath = true;
	}
	// get list of modules to import
	const pluginIds = pluginMapKeys.map((id) => getPluginModuleName(id));
	if(pluginIds.length == 0) {
		return [];
	}
	// import the modules
	return await Promise.all(pluginIds.map(async (pluginId) => {
		return (await import(pluginId)).default;
	}));
};
