
export type PlexMedia = {
	id: number; // 55899
	duration: number; // 5309567
	bitrate: number; // 3181
	width: number; // 1920
	height: number; // 856
	aspectRatio: number; // 2.2
	audioChannels: number; // 6
	audioCodec: string; // "eac3"
	videoCodec: string; // "hevc"
	videoResolution: number | string; // "1080"
	container: string; // "mkv"
	videoFrameRate: string; // "24p"
	videoProfile: string; // "main 10"
	Part?: PlexMediaPart[]
};

export type PlexMediaPart = {
	id: number; // 69319
	key: string; // "/library/parts/69319/1723529464/file.mkv"
	duration: number; // 5309567
	file: string; // "Y:\\Movies\\The OctoGames (2022)\\The OctoGames (2022).mkv"
	size: number; // 2113635558
	container: string; // "mkv"
	indexes: string; // "sd"
	videoProfile: string; // "main 10"
	accessible?: boolean,
	exists?: boolean,
	// TODO add stream info
};
