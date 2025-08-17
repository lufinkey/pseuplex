#!/bin/bash

PLATFORM=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(arch)
if [ -z "$TRAEFIK_VERSION" ]; then
	TRAEFIK_VERSION="3.5.0"
fi

# enter directory
cd "${BASH_SOURCE%/*}/../" || exit $?
mkdir -p external || exit $?

# download traefik if it doesn't exist
traefik_archive_name="traefik_v${TRAEFIK_VERSION}_${PLATFORM}_${ARCH}"
traefik_archive_path="./external/$traefik_archive_name.tar.gz"
traefik_path="./external/$traefik_archive_name/traefik"
if [ ! -f "$traefik_path" ]; then
	if [ ! -f "$traefik_archive_path" ]; then
		curl -L "https://github.com/traefik/traefik/releases/download/v$TRAEFIK_VERSION/$traefik_archive_name.tar.gz" -o "$traefik_archive_path" || exit $?
	fi
	mkdir -p "./external/$traefik_archive_name" || exit $?
	tar -xzf "$traefik_archive_path" -C "./external/$traefik_archive_name" || exit $?
fi
