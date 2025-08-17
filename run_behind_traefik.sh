#!/bin/bash

# enter base directory
cd "${BASH_SOURCE%/*}" || exit $?

# install app dependencies and build
npm install || exit $?
npm run build || exit $?

# fetch traefik
./tools/fetch_traefik.sh || exit $?

# watch plex SSL certificate
watch_plex_certificates() {
	./tools/auto_decrypt_plex_cert.sh | while read -r line; do
		echo "Touching traefik config for \"$line\""
		touch ./traefik/traefik.yml
	done
}

# run the app
export NODE_ENV=production
( npm start -- --config=config/config.json || exit $? ) &
pseuplex_pid=$!

# watch plex certificates
watch_plex_certificates &
watchcerts_pid=$!

# run traefik
"./services/traefik/run.sh" || exit $?

# kill background processes
if kill -0 $pseuplex_pid  2> /dev/null ; then
	kill -15 $pseuplex_pid
fi
if kill -0 $watchcerts_pid 2> /dev/null ; then
	kill -15 $watchcerts_pid
fi
