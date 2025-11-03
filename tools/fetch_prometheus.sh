#!/bin/bash

PLATFORM=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(arch)
if [ -z "$PROMETHEUS_VERSION" ]; then
	PROMETHEUS_VERSION="3.5.0"
fi

# enter directory
cd "${BASH_SOURCE%/*}/../" || exit $?
mkdir -p external || exit $?

# download prometheus if it doesn't exist
prometheus_archive_name="prometheus-${PROMETHEUS_VERSION}.${PLATFORM}-${ARCH}"
prometheus_archive_path="./external/$prometheus_archive_name.tar.gz"
prometheus_path="./external/$prometheus_archive_name/prometheus"
if [ ! -f "$prometheus_path" ]; then
	if [ ! -f "$prometheus_archive_path" ]; then
		curl -L "https://github.com/prometheus/prometheus/releases/download/v$PROMETHEUS_VERSION/$prometheus_archive_name.tar.gz" -o "$prometheus_archive_path" || exit $?
	fi
	mkdir -p "./external/$prometheus_archive_name" || exit $?
	tar -xzf "$prometheus_archive_path" -C "./external" || exit $?
fi
