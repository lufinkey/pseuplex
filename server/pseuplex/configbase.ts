
export type PseuplexConfigBase<TPerUserConfig extends {}> = {
	perUser: { [email: string]: TPerUserConfig }
};
