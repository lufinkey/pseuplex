import bandcamp from 'bandcamp-retriever';
import { PlexServerAccountInfo } from '../../plex/accounts';
import {
	PseuplexApp,
	PseuplexPlugin,
} from '../../pseuplex';
import {
	BandcampPluginConfig
} from './config';

export interface BandcampPluginDef extends PseuplexPlugin {
	app: PseuplexApp;
	config: BandcampPluginConfig;

	bandcampClientForPlexUser(plexUserInfo: PlexServerAccountInfo): bandcamp.Bandcamp;
} 
