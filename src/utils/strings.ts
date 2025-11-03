
const emptyOrWhitespaceRegex = /^\s*$/;

export const isStringNullOrWhitespace = (str: string | undefined | null) => {
	if(!str) {
		return true;
	}
	return emptyOrWhitespaceRegex.test(str);
};

const newlineRegex = /\r?\n/;

export const getFirstLineOfString = (str: string) => {
	if(!str) {
		return str;
	}
	let lineEndIndex = newlineRegex.exec(str)?.index;
	if (lineEndIndex == null) {
		lineEndIndex = str.length;
	}
	return str.substring(0, lineEndIndex);
};
