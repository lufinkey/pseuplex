
export type PlexMyPlexAccount = {
	$: {
		id: string;
		username: string; // name@example.com
		email: string; // name@example.com
		mappingState?: string;
		signInState: string;
		publicAddress: string;
		publicPort: string;
		privateAddress: string;
		privatePort: string;
		subscriptionFeatures?: string;
		subscriptionActive: string;
		subscriptionState: string;
	};
	authToken: string;
	username: string; // name@example.com
	signInState: string;
	mappingState?: string;
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
