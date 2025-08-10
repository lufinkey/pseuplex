
export const unleakString = (str: string) => {
	// see https://stackoverflow.com/a/79486071/1846536
	let obj = {};
	obj[str] = undefined
	return str;
};

export const unleakStringsInObject = <TObject extends object>(obj: TObject): TObject => {
	for(const key of Object.keys(obj)) {
		const val = obj[key];
		switch(typeof val) {
			case 'string':
				obj[key] = unleakString(val);
				break;

			case 'object':
				if(val) {
					obj[key] = unleakStringsInObject(val);
				}
		}
	}
	return obj;
};
