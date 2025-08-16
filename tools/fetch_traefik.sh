#!/bin/bash

platform=$(uname -s | tr '[:upper:]' '[:lower:]')
arch=$(arch)
TRAEFIK_VERSION="v3.5.0"

# enter directory
cd "${BASH_SOURCE%/*}/../" || exit $?

# download traefik if it doesn't exist
traefik_archive_name="traefik_${TRAEFIK_VERSION}_${platform}_${arch}"
traefik_archive_path="./external/$traefik_archive_name.tar.gz"
traefik_path="./external/$traefik_archive_name/traefik"
if [ ! -f "$traefik_path" ]; then
	if [ ! -f "$traefik_archive_path" ]; then
		curl -L "https://github.com/traefik/traefik/releases/download/$TRAEFIK_VERSION/$traefik_archive_name.tar.gz" -o "$traefik_archive_path" || exit $?
	fi
	mkdir -p "./external/$traefik_archive_name" || exit $?
	tar -xzf "$traefik_archive_path" -C "./external/$traefik_archive_name" || exit $?
fi
