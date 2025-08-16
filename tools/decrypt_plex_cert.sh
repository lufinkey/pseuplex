#!/bin/bash

# validate args
for arg in "$@"; do
	if [[ ! $arg == -* ]]; then
		echo "Invalid arg $arg"
	fi
done

# get paths
base_path="${BASH_SOURCE%/*}/.."
plexutils_path="$base_path/tools/plex_utils.sh"
privatekey_path="$base_path/keys/plex_privatekey.pem"
certchain_path="$base_path/keys/plex_certchain.pem"

# extract ssl keys
echo "Extracting plex private key"
"$plexutils_path" "$@" ssl-cert output-privatekey "$privatekey_path" || exit $?
echo "Updating privatekey permissions"
chmod 600 "$privatekey_path" || exit $?

echo "Extracting plex certificate chain"
"$plexutils_path" "$@" ssl-cert output-certchain "$certchain_path" || exit $?
echo "Updating certchain permissions"
chmod 644 "$certchain_path" || exit $?
