#!/bin/sh
# read args
plex_cfg_path="$1"
if [ -z "$plex_cfg_path" ]; then
	>&2 echo "no plex config path provided"
	exit 1;
fi
# get machine ID from preferences
pmi=$(cat "$plex_cfg_path/Library/Application Support/Plex Media Server/Preferences.xml" | xq -x "//Preferences/@CertificateUUID")
# hash machine ID
shapmi=$(echo "plex$pmi" | sha512sum | grep -o '^\S\+' )
echo -n "$shapmi"
