
import * as letterboxd from 'letterboxd-retriever';
import { CachedFetcher } from '../fetching/CachedFetcher';
import * as plexServerAPI from '../plex/api';
import * as plexTypes from '../plex/types';
import * as plexDiscoverAPI from '../plexdiscover';
import * as pseuExternalPlex from './externalplex';
import * as pseuLetterboxd from './letterboxd';
import { HttpError } from '../utils';

const pseuplex = {
	letterboxd: {
		sectionID: -1,
		sectionGuid: "910db620-6c87-475c-9c33-0308d50f01b0",
		sectionTitle: "Letterboxd Films",
		
		metadata: {
			basePath: '/pseuplex/letterboxd/metadata',
			cache: new CachedFetcher(async (id: string) => {
				console.log(`Fetching letterboxd film info for film ${id}`);
				const filmInfo = await letterboxd.getFilmInfo({slug: id});
				//fixStringLeaks(filmInfo);
				return filmInfo;
			}),
			slugToPlexGuidCache: new CachedFetcher(async (slug: string) => {
				const filmInfo = await pseuplex.letterboxd.metadata.cache.getOrFetch(slug);
				return (await pseuLetterboxd.findPlexMetadataFromLetterboxdFilm(filmInfo))?.guid;
			}),
			get: async (slugs: string[], options: {
				plexServerURL: string,
				plexAuthContext: plexTypes.PlexAuthContext
			}): Promise<plexTypes.PlexMetadataPage> => {
				let plexGuids: {[slug: string]: Promise<string> | string | null} = {};
				let plexMatches: {[slug: string]: (Promise<plexTypes.PlexMetadataItem> | plexTypes.PlexMetadataItem | null)} = {};
				let letterboxdPages: {[slug: string]: Promise<letterboxd.FilmInfo>} = {};
				// setup tasks for each slug
				for(const slug of slugs) {
					if(slug in plexGuids) {
						// skip
						continue;
					}
					let plexGuid = pseuplex.letterboxd.metadata.slugToPlexGuidCache.get(slug);
					if(plexGuid || plexGuid === null) {
						plexGuids[slug] = plexGuid;
					}
					if(plexGuid) {
						continue;
					}
					// get letterboxd page
					const itemTask = letterboxdPages[slug] ?? pseuplex.letterboxd.metadata.cache.getOrFetch(slug);
					letterboxdPages[slug] = itemTask;
					if(plexGuid !== null) {
						const metadataTask = (async () => {
							const item = await itemTask;
							return await pseuLetterboxd.findPlexMetadataFromLetterboxdFilm(item);
						})();
						const guidTask = metadataTask.then((m) => (m.guid ?? null));
						plexMatches[slug] = metadataTask;
						plexGuids[slug] = guidTask;
						pseuplex.letterboxd.metadata.slugToPlexGuidCache.set(slug, guidTask);
					}
				}
				// get guids and map them to items on the server
				const guidsToFetch = (await Promise.all(Object.keys(plexGuids).map(async (slug) => {
					const plexMatch = await plexMatches[slug];
					if(plexMatch) {
						return null;
					}
					return plexGuids[slug];
				}))).filter((guid) => guid);
				const plexMetadataMap: {[guid: string]: plexTypes.PlexMetadataItem} = {};
				let serverResult: plexTypes.PlexMetadataPage | undefined = undefined;
				if(guidsToFetch.length > 0) {
					try {
						serverResult = await plexServerAPI.getLibraryMetadata(guidsToFetch, {
							serverURL: options.plexServerURL,
							authContext: options.plexAuthContext
						});
					} catch(error) {
						if((error as HttpError).statusCode != 404) {
							console.warn(error);
						}
					}
					let metadatas = serverResult?.MediaContainer.Metadata;
					if(metadatas) {
						if(!(metadatas instanceof Array)) {
							metadatas = [metadatas];
						}
						for(const metadata of metadatas) {
							if(metadata.guid) {
								plexMetadataMap[metadata.guid] = metadata;
							}
						}
					}
				}
				// get any remaining guids from plex discover
				const remainingGuids = guidsToFetch.filter((guid) => !plexMetadataMap[guid]);
				if(remainingGuids.length > 0) {
					const discoverResult = await plexServerAPI.getLibraryMetadata(remainingGuids.map((guid) => plexDiscoverAPI.guidToMetadataID(guid)), {
						serverURL: plexDiscoverAPI.BASE_URL,
						authContext: options.plexAuthContext
					});
					let metadatas = discoverResult?.MediaContainer.Metadata;
					if(metadatas) {
						if(!(metadatas instanceof Array)) {
							metadatas = [metadatas];
						}
						for(const metadata of metadatas) {
							if(metadata.guid) {
								plexMetadataMap[metadata.guid] = pseuExternalPlex.transformExternalPlexMetadata(metadata, plexDiscoverAPI.BASE_URL);
							}
						}
					}
				}
				// get all results
				const metadatas = await Promise.all(slugs.map(async (slug) => {
					let metadataItem = plexMatches[slug];
					if(!metadataItem) {
						const guid = await plexGuids[slug];
						metadataItem = guid ? plexMetadataMap[guid] : null;
						if(!metadataItem) {
							let lbTask = letterboxdPages[slug];
							if(!lbTask) {
								lbTask = pseuplex.letterboxd.metadata.cache.getOrFetch(slug);
								letterboxdPages[slug] = lbTask;
							}
							const letterboxdFilm = await lbTask;
							metadataItem = pseuLetterboxd.filmInfoToPlexMetadata(letterboxdFilm, {
								letterboxdMetadataBasePath: pseuplex.letterboxd.metadata.basePath
							});
						}
					}
					metadataItem = await metadataItem;
					metadataItem.key = `${pseuplex.letterboxd.metadata.basePath}/${slug}`;
					return metadataItem;
				}));
				// done
				return {
					MediaContainer: {
						size: metadatas.length,
						allowSync: false,
						//augmentationKey: '/library/metadata/augmentations/1',
						librarySectionID: pseuplex.letterboxd.sectionID,
						librarySectionTitle: pseuplex.letterboxd.sectionTitle,
						librarySectionUUID: pseuplex.letterboxd.sectionGuid,
						Metadata: metadatas
					}
				};
			}
		},
		
		hubs: {
			userFollowingActivity: {
				path: '/pseuplex/letterboxd/hubs/following',
				lists: {} as {[key: string]: pseuLetterboxd.LetterboxdUserFollowingActivityFeedHub},
				get: (letterboxdUsername: string): pseuLetterboxd.LetterboxdUserFollowingActivityFeedHub => {
					// TODO fetch profile
					let list = pseuplex.letterboxd.hubs.userFollowingActivity.lists[letterboxdUsername];
					if(!list) {
						list = new pseuLetterboxd.LetterboxdUserFollowingActivityFeedHub({
							hubPath: `${pseuplex.letterboxd.hubs.userFollowingActivity.path}?letterboxdUsername=${letterboxdUsername}`,
							context: `hub.custom.letterboxdfollowing.${letterboxdUsername}`,
							letterboxdMetadataBasePath: pseuplex.letterboxd.metadata.basePath,
							letterboxdUsername: letterboxdUsername,
							defaultItemCount: 16,
							style: plexTypes.PlexHubStyle.Shelf,
							promoted: true,
							uniqueItemsOnly: true,
							verbose: true
						});
						pseuplex.letterboxd.hubs.userFollowingActivity.lists[letterboxdUsername] = list;
					}
					return list;
				}
			}
		}
	}
};

export default pseuplex;
