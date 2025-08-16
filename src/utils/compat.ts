import path from 'path';

export const isRunningViaBun = () => {
	return typeof Bun !== 'undefined';
};

export const getModuleRootPath = () => {
	return path.dirname(path.dirname(__dirname));
};
