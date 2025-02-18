
const ipv4AsIpv6Prefix = '::ffff:';
const ipv4Regex = /^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)\.?\b){4}$/;

export enum IPv4NormalizeMode {
	/// Don't normalize ipv4 addresses
	DontChange,
	/// Change ipv4 as ipv6 addresses (ie `::ffff:192.168.1.123`) to normal ipv4 addresses (`192.168.1.123`)
	ToIPv4,
	/// Convert ipv4 addresses (`192.168.1.123`) to ipv6 addresses (ie `::ffff:192.168.1.123`)
	ToIPv6
}

export type IPv4NormalizeModeKey = keyof IPv4NormalizeMode;

export function normalizeIPAddress(address: string, ipv4Mode: IPv4NormalizeMode) {
	switch(ipv4Mode) {
		case IPv4NormalizeMode.ToIPv4: {
			if(!address || !address.startsWith(ipv4AsIpv6Prefix)) {
				return address;
			}
			const possibleIPv4 = address.substring(ipv4AsIpv6Prefix.length);
			if(!ipv4Regex.test(possibleIPv4)) {
				return address;
			}
			return possibleIPv4;
		}

		case IPv4NormalizeMode.ToIPv6: {
			if(!address || !ipv4Regex.test(address)) {
				return address;
			}
			return ipv4AsIpv6Prefix + address;
		}

		case IPv4NormalizeMode.DontChange:
		default:
			return address;
	}
}
