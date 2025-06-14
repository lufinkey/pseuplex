import bandcamp from 'bandcamp-retriever';

export type BandcampMetadataItem = (bandcamp.BandcampTrack | bandcamp.BandcampAlbum | bandcamp.BandcampArtist);
