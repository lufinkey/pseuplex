
export const delay = (timeout: number) => {
	return new Promise((resolve, reject) => {
		setTimeout(resolve, timeout);
	});
}
