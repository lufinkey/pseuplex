#!/bin/sh
# read args
if [ $# -lt 1 ]; then
	>&2 echo "Usage:"
    >&2 echo "  Arg 1: the path to the plex config directory. Ex: /var/lib/plexmediaserver"
    >&2 echo "  ./plex_ssl_p12_pass_v1.sh /var/lib/plexmediaserver"
    exit 1
fi
plex_cfg_path="$1"
# get machine ID from preferences
pmi=$(cat "$plex_cfg_path/Library/Application Support/Plex Media Server/Preferences.xml" | xq -x "//Preferences/@ProcessedMachineIdentifier")
# hash machine ID
shapmi=$(echo "plex$pmi" | sha512sum | grep -o '^\S\+' )
echo -n "$shapmi"
