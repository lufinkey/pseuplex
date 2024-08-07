
import {
	ActivityFeedPage,
	ActivityFeedEntry } from './types';
import * as lburls from './urls';
import * as lbparse from './parser';

export * from './types';

export const fetchUserFollowingFeed = async (username: string, options: {after?: number, csrf?: string} = {}): Promise<ActivityFeedPage> => {
	const feedPageURL = lburls.followingActivityFeedPageURL({
		username: username
	});
	// fetch csrf if needed
	let csrf = options.csrf;
	if(!csrf) {
		const res = await fetch(feedPageURL);
		if(!res.ok) {
			throw new Error(res.statusText);
		}
		const resData = await res.text();
		csrf = lbparse.parseCSRF(resData);
	}
	// fetch activity feed
	const feedAjaxURL = lburls.followingActivityFeedAjaxURL({
		...options,
		username: username,
		csrf: csrf
	});
	const res = await fetch(feedAjaxURL, {
		referrer: feedPageURL,
		headers: {
			'Host': lburls.HOST
		} 
	});
	if(!res.ok) {
		throw new Error(res.statusText);
	}
	const resData = await res.text();
	//console.log(resData);
	const result = lbparse.parseAjaxActivityFeed(resData);
	return {
		...result,
		csrf: csrf
	};
};
