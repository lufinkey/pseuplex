import express from 'express';
import * as constants from './constants';

const app = express();
const port = 3000;

app.get('/', (req, res) => {
	res.send('Hello World!');
});

app.listen(port, () => {
	console.log(`${constants.APP_NAME} is listening at http://localhost:${port}`);
});
