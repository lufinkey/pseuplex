#!/bin/sh
# read args
if [ $# -lt 2 ]; then
	>&2 echo "Usage:"
    >&2 echo "  Arg 1: the path to the plex config directory. Ex: /var/lib/plexmediaserver"
    >&2 echo "  Arg 2: the password that the plex p12 file is encrypted with"
    >&2 echo "  ./plex_ssl_key_v2.sh /var/lib/plexmediaserver somelongpassword"
    exit 1
fi
plex_cfg_path="$1"
shapmi="$2"
# extract public key
cert_path="$plex_cfg_path/Library/Application Support/Plex Media Server/Cache/cert-v2.p12"
openssl pkcs12 -in "$cert_path" -out plex.key -nocerts -nodes -passin "pass:$shapmi"
