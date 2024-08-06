
import * as cheerio from 'cheerio';
import {
	DataNode
} from 'domhandler';
import {
	ActivityActionType,
	ActivityFeedEntry,
	ActivityFeedFilm, 
	ActivityFeedViewing,
	ActivityFeedPage } from './types';

const CSRF_TEXT_PREFIX = "supermodelCSRF = '";
const CSRF_TEXT_SUFFIX = "'";
const POSESSIVE_TEXT_SUFFIX1 = "’s";

export const parseCSRF = (pageData: cheerio.CheerioAPI | string) => {
	let $: cheerio.CheerioAPI;
	if(typeof(pageData) === 'string') {
		$ = cheerio.load(pageData);
	} else {
		$ = pageData;
	}
	for(const node of $('head script')) {
		const nodeText = $(node).text();
		let startIndex = 0;
		let csrfIndex;
		do {
			csrfIndex = nodeText.indexOf(CSRF_TEXT_PREFIX, startIndex);
			if(csrfIndex == -1) {
				break;
			}
			const csrfPartStart = csrfIndex + CSRF_TEXT_PREFIX.length;
			const csrfPartEnd = nodeText.indexOf(CSRF_TEXT_SUFFIX, csrfPartStart);
			if(csrfPartEnd != -1) {
				const csrf = nodeText.substring(csrfPartStart, csrfPartEnd);
				if(csrf.length > 0) {
					return csrf;
				}
			}
			startIndex = csrfPartStart;
		} while(true);
	}
	return null;
};

const trimString = (str: string, char: string): string => {
	let start = 0;
	let end = str.length;
	while(start < str.length && str[start] == char) {
		start++;
	}
	while(end > start && str[end-1] == char) {
		end--;
	}
	return str.substring(start, end);
};

const countStringOccurences = (str: string, find: string): number => {
	let count = 0;
	let startIndex = 0;
	do {
		let foundIndex = str.indexOf(find, startIndex);
		if(foundIndex == -1) {
			return count;
		}
		count++;
		startIndex = foundIndex + find.length;
	} while(true);
	return count;
};

const lastFromArray = <T>(arr: T[]): T | undefined => {
	if(arr.length > 0) {
		return arr[arr.length-1];
	}
	return undefined;
};

const parseRatingString = (ratingStr: string): number => {
	return (2 * countStringOccurences(ratingStr, '★'))
		+ countStringOccurences(ratingStr, '½');
};

export const parseAjaxActivityFeed = (pageData: string): ActivityFeedPage => {
	const $ = cheerio.load(`<body id="root">${pageData}</body>`);
	const feedItems: ActivityFeedEntry[] = [];
	let end = false;
	let entryIndex = 0;
	for(const node of $('body#root > section')) {
		const node$ = $(node);
		const endMarker = node$.find('.end-of-activity');
		if(endMarker.index() !== -1) {
			end = true;
			break;
		}
		try {
			// parse user info
			const userHref = node$.find('.table-activity-user > a').attr('href');
			const username = trimString(userHref, '/');
			if(username.indexOf('/') != -1) {
				console.warn(`Parsed user slug ${username} from href ${userHref} contains a slash on entry ${entryIndex}`);
			}
			const userImageElement = node$.find(".table-activity-user");
			const userImageSrc = userImageElement.attr('src');
			let userDisplayName = userImageElement.attr('alt');
			// parse activity entry
			let actionType: ActivityActionType;
			let film: ActivityFeedFilm | undefined = undefined;
			let viewing: ActivityFeedViewing | undefined = undefined;
			const activityDescr = node$.find('.table-activity-description');
			const activityViewing = node$.find('.table-activity-viewing');
			if(activityDescr.index() !== -1) {
				// activity entry is a description
				const userLink = activityDescr.find('.activity-summary > a.name');
				if(userLink.index() === -1) {
					console.warn(`Missing user link on entry index ${entryIndex}`);
				}
				const objectLink = activityDescr.find('.activity-summary > a:nth-of-type(2)');
				const linkText = userLink.text().trim();
				if(linkText) {
					userDisplayName = linkText;
				}
				const actionText = $(userLink[0].nextSibling).text().trim().toLowerCase();
				switch(actionText) {
					case 'added': {
						if(objectLink.index() === -1) {
							console.warn(`Missing object link on entry index ${entryIndex}`);
						}
						const afterObjectText = $(objectLink[0].nextSibling).text().trim().toLowerCase();
						const object2Link = activityDescr.find('.activity-summary > a:nth-of-type(3)');
						const object2Text = object2Link.text().trim().toLowerCase();
						if(afterObjectText == 'to' && object2Text.endsWith(' watchlist')) {
							// added to watchlist
							actionType = ActivityActionType.AddedToWatchlist;
							const filmHref = objectLink.attr('href');
							let filmSlug = trimString(filmHref, '/');
							let slashIndex = filmSlug.lastIndexOf('/');
							if(slashIndex !== -1) {
								filmSlug = filmSlug.substring(slashIndex+1);
							}
							film = {
								name: objectLink.text(),
								slug: filmSlug,
								href: filmHref
							};
						}
					}
					break;

					case 'liked': {
						const ratingStr = objectLink.find('.rating').text().trim();
						if(ratingStr) {
							// liked review
							let reviewerName = activityDescr.find('.activity-summary > strong.name').text();
							if(reviewerName.endsWith(POSESSIVE_TEXT_SUFFIX1)) {
								reviewerName = reviewerName.substring(0, reviewerName.length - POSESSIVE_TEXT_SUFFIX1.length);
							}
							const rating = parseRatingString(ratingStr);
							const reviewHref = objectLink.attr('href');
							const trimmedReviewHref = trimString(reviewHref, '/');
							let filmSlug = trimmedReviewHref;
							let slashIndex = filmSlug.lastIndexOf('/');
							if(slashIndex != -1) {
								filmSlug = filmSlug.substring(slashIndex+1);
							}
							let userSlug = trimmedReviewHref;
							slashIndex = userSlug.indexOf('/');
							if(slashIndex != -1) {
								userSlug = userSlug.substring(0, slashIndex);
							}
							const filmName = $(lastFromArray(objectLink[0].childNodes)).text();
							actionType = ActivityActionType.LikedReview;
							viewing = {
								userDisplayName: reviewerName,
								username: userSlug,
								href: reviewHref,
								rating: rating
							};
							film = {
								name: filmName,
								slug: filmSlug,
								href: `/film/${filmSlug}/`
							};
						}
					}
					break;
				}
			}
			else if(activityViewing.index() !== -1) {
				// viewing
				const filmImgSrc = activityViewing.find('.film-poster img').attr('src');
				const filmReviewLink = activityViewing.find('.film-detail-content > h2 > a');
				const filmReviewHref = filmReviewLink.attr('href');
				let filmSlug = trimString(filmReviewHref, '/');
				let slashIndex = filmSlug.lastIndexOf('/');
				if(slashIndex != -1) {
					filmSlug = filmSlug.substring(slashIndex+1);
				}
				const filmName = filmReviewLink.text();
				const filmYearLink = activityViewing.find('.film-detail-content > h2 > small.metadata > a');
				const filmYear = filmYearLink.text().trim();
				const ratingTag = activityViewing.find('.film-detail-content > .film-detail-meta > .rating');
				let rating: number | undefined = undefined;
				if(ratingTag.index() !== -1) {
					rating = parseRatingString(ratingTag.text());
				}
				const contextTag = activityViewing.find('.film-detail-content .attribution > .context');
				const viewerLink = contextTag.children('a');
				const viewerHref = viewerLink.attr('href');
				const viewerSlug = trimString(viewerHref, '/');
				if(viewerSlug.indexOf('/') != -1) {
					console.warn(`Parsed user slug ${viewerSlug} from href ${viewerHref} contains a slash on entry ${entryIndex}`);
				}
				actionType = $(lastFromArray(contextTag[0].childNodes)).text().toLowerCase() as ActivityActionType;
				viewing = {
					userDisplayName: viewerLink.text(),
					username: viewerSlug,
					href: filmReviewHref,
					rating: rating,
					liked: activityViewing.find('.icon-liked').index() !== -1,
					text: activityViewing.find('.film-fetail-content .body-text').text()
				};
				film = {
					imageURL: filmImgSrc,
					name: filmName,
					href: `/film/${filmSlug}/`,
					slug: filmSlug,
					year: filmYear
				};
			} else {
				// TODO handle other types of feed items
			}
			// parse other item properties
			const id = node$.attr('data-activity-id');
			const time = new Date(node$.children('time').attr('datetime'));
			// add entry
			feedItems.push({
				id: id,
				userImageURL: userImageSrc,
				userHref: userHref,
				username: username,
				userDisplayName: userDisplayName,
				action: actionType,
				film: film,
				viewing: viewing,
				time: time
			});
		} catch(error) {
			console.error(`Failed to parse entry ${entryIndex}`);
			console.error(error);
		}
		entryIndex++;
	}
	return {
		items: feedItems,
		end: end
	};
};
