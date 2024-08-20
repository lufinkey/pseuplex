
import * as letterboxd from 'letterboxd-retriever';
import { CachedFetcher } from "../../fetching/CachedFetcher";
import { fixStringLeaks } from '../../utils';

export const metadataCache = new CachedFetcher(async (id: string) => {
	console.log(`Fetching letterboxd film info for film ${id}`);
	const filmInfo = await letterboxd.getFilmInfo({slug: id});
	//fixStringLeaks(filmInfo);
	return filmInfo;
});
