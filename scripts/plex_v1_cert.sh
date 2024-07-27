#!/bin/sh
# read args
plex_cfg_path="$1"
if [ -z "$plex_cfg_path" ]; then
	>&2 echo "no plex config path provided"
	exit 1;
fi
shapmi="$2"
# extract public key
cert_path="$plex_cfg_path/Library/Application Support/Plex Media Server/Cache/cert-v2.p12"
openssl pkcs12 -in "$cert_path" -out plex.cert -clcerts -nokeys -passin "pass:$shapmi"
