import { useState } from 'react';
import PlexOAuth from '@webapp/services/plex/oauth';

// code adapted from https://github.com/sct/overseerr/blob/develop/src/components/PlexLoginButton/index.tsx

const plexOAuth = new PlexOAuth();

interface PlexLoginButtonProps {
	text?: string,
	onAuthToken: (authToken: string) => void;
	isProcessing?: boolean;
	onError?: (error: Error) => void;
}

export default function PlexLoginButton(props: PlexLoginButtonProps) {
	const [loading, setLoading] = useState(false);

	const getPlexLogin = async () => {
		setLoading(true);
		try {
			const authToken = await plexOAuth.login();
			setLoading(false);
			props.onAuthToken(authToken);
		} catch (error) {
			if (props.onError) {
				props.onError(error as any);
			} else {
				console.error(error);
			}
			setLoading(false);
		}
	};

	return (
		<button
			className="plex-login-button"
			type="button"
			onClick={() => {
				plexOAuth.preparePopup();
				setTimeout(() => getPlexLogin(), 1500);
			}}
			disabled={loading || props.isProcessing}>
			<span>
				{loading ?
					"Loading..."
					: props.isProcessing ?
						"Signing In..."
						: props.text ?? "Sign In"}
			</span>
		</button>
	);
};
