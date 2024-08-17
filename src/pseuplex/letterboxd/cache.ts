
import * as letterboxd from 'letterboxd-retriever';
import { CachedFetcher } from "../../fetching/CachedFetcher";

export const metadataCache = new CachedFetcher(async (id: string) => {
	console.log(`Fetching letterboxd film info for film ${id}`);
	return await letterboxd.getFilmInfo({slug: id});
});
