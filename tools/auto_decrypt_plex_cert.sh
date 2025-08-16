#!/bin/bash

# validate that all args are flags
for arg in "$@"; do
	if [[ ! $arg == -* ]]; then
		>&2 echo "Invalid arg $arg"
	fi
done

# get paths
base_path="${BASH_SOURCE%/*}/.."
plexutils_path="$base_path/tools/plex_utils.sh"

# get p12 path
p12_path=$("$plexutils_path" "$@" path ssl-cert-p12)
result=$?
if [ $result -ne 0 ]; then
    exit $result
fi

# decrypt plex cert
>&2 echo "Decrypting plex cert $p12_path"
"$base_path/tools/decrypt_plex_cert.sh" "$@"

# watch for file changes
while "$base_path/tools/watch_filechange.sh" "$p12_path" 1> /dev/null ; do
	echo "Plex certificate changed at $p12_path"
	# decrypt the plex certificate
	"$base_path/tools/decrypt_plex_cert.sh" "$@"
done
>&2 echo "Stopped listening for plex cert changes"
