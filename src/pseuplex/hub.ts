
import {
	PlexHubPageParams,
	PlexHubPage } from "../plex/types";

export type PseuplexHub = (options: PlexHubPageParams) => Promise<PlexHubPage>;
