import http from 'http';

export const urlFromClientRequest = (req: http.ClientRequest) => {
	return `${req.protocol || 'http:'}//${req.host}${req.path}`;
};
