import {
	AppBar,
	Toolbar,
	IconButton,
	Typography,
	Button
} from '@mui/material';
import HamburgerIcon from '@webapp/components/HamburgerIcon';
import './style.css';

export type Props = {
	title: string,
	onClickSidemenuButton: () => void
};

export default function HeaderBar(props: Props) {
	return (
		<AppBar position='static'>
			<Toolbar>
				<IconButton
					size="large"
					edge="start"
					color="inherit"
					aria-label="menu"
					sx={{ mr: 2 }}
					style={{textAlign:'center'}}
					onClick={props.onClickSidemenuButton}>
					<HamburgerIcon/>
				</IconButton>
				<Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
					{props.title}
				</Typography>
				<Button color="inherit">Login</Button>
			</Toolbar>
		</AppBar>
	);
}
