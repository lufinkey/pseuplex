import { useState } from 'react';
import HeaderBar from '@webapp/components/HeaderBar';
import { Drawer } from '@mui/material';

import type { Route } from './+types/index';

export function meta({}: Route.MetaArgs) {
	return [
		{ title: "Home" },
		{ name: "description", content: "Welcome to React Router!" },
	];
}

export default function Home() {
	const [drawerOpen,setDrawerOpen] = useState(false);
	return (
		<>
			<HeaderBar
				title="Home"
				onClickSidemenuButton={() => setDrawerOpen(true)}/>
			<Drawer
				open={drawerOpen}
				onClose={() => setDrawerOpen(false)}>
				<p>hello world</p>
			</Drawer>
		</>
	);
}
