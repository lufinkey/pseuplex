
export type HttpError = Error & {
	url: string,
	method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'OPTIONS'
	statusCode: number
};

export const httpRequest = async (url: string, options: RequestInit) => {
	const res = await fetch(url, options);
	if(!res.ok) {
		res.body?.cancel();
		const error = new Error(res.statusText) as HttpError;
		error.url = url;
		error.method = options?.method as any || 'GET';
		error.statusCode = res.status;
		throw error;
	}
	const data = await res.text();
	return { response:res, data };
};
