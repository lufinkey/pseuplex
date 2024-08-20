
export type PlexMyPlexAccount = {
	authToken: string;
	username: string; // name@example.com
	signInState: string;
	publicAddress: string;
	publicPort: number;
	privateAddress: string;
	privatePort: number;
	subscriptionFeatures?: string;
	subscriptionActive: boolean;
	subscriptionState: string;
};

export type PlexMyPlexAccountPage = {
	MyPlex: PlexMyPlexAccount;
};
