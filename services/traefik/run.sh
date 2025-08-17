#!/bin/bash

# enter base folder
cd "${BASH_SOURCE%/*}" || exit $?

# define vars
PLATFORM=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(arch)
if [ -z "$TRAEFIK_VERSION" ]; then
	export TRAEFIK_VERSION="3.5.0"
fi

# get traefik if needed
"../../tools/fetch_traefik.sh" || exit $?

# load environment vars
if [ ! -f .env ]; then
	>&2 echo ".env file doesn't exist"
	exit 1
fi
set -a
source .env || exit $?
set +a

# run traefik
"../../external/traefik_v${TRAEFIK_VERSION}_${PLATFORM}_${ARCH}/traefik" --configFile=traefik.yml || exit $?
