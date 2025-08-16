#!/bin/bash

FSWATCH_VERSION=1.18.3

# enter base directory
cd "${BASH_SOURCE%/*}/../" || exit $?
mkdir -p external || exit $?

# extract fswatch
fswatch_archive_path="external/fswatch-$FSWATCH_VERSION.tar.gz"
if [ ! -d "external/fswatch-$FSWATCH_VERSION" ]; then
	if [ ! -f "external/fswatch-$FSWATCH_VERSION.tar.gz" ]; then
		curl -L "https://github.com/emcrisostomo/fswatch/releases/download/$FSWATCH_VERSION/fswatch-$FSWATCH_VERSION.tar.gz" -o "$fswatch_archive_path" || exit $?
	fi
	tar -xzf "$fswatch_archive_path" -C external || exit $?
fi

# compile fswatch
cd external/fswatch-$FSWATCH_VERSION || exit $?
./configure "$@" || exit $?
make || exit $?
