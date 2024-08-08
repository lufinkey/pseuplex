
import * as letterboxd from 'letterboxd-retriever';
import * as lbtransform from './transform';
import { PlexMetadataPage } from '../plex/types';


export const getLetterboxdMetadataItems = async (ids: string[], options: lbtransform.LetterboxdToPlexOptions): Promise<PlexMetadataPage[]> => {
	return (await Promise.all(ids.map((id) => {
		return letterboxd.getFilmInfo({ slug: id });
	}))).map((filmInfo) => {
		return lbtransform.filmInfoToPlexMetadata(filmInfo, options)
	});
};
