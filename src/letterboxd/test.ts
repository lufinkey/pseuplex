
import * as letterboxd from './index';

(async () => {
	try {
		const result = await letterboxd.fetchUserFollowingFeed('luisfinke');
		console.log(JSON.stringify(result, null, '\t'));
	} catch(error) {
		console.error(error);
	}
})();
