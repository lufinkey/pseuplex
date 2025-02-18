import { useState } from 'react';
import { Drawer } from '@mui/material';
import PlexLoginButton from '@webapp/components/PlexLoginButton';

import type { Route } from './+types/index';

export function meta({}: Route.MetaArgs) {
	return [
		{ title: "Login" },
		{ name: "description", content: "Login In with Plex" },
	];
}

export default function Login() {
	return (
		<>
			<PlexLoginButton onAuthToken={(authToken) => {}}/>
		</>
	);
}
