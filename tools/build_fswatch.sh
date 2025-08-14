#!/bin/bash

FSWATCH_VERSION=1.18.3

# enter base directory
cd "$(dirname "$(realpath "$0")")/../" || exit $?
mkdir -p external || exit $?

# extract fswatch
if [ ! -d "external/fswatch-$FSWATCH_VERSION" ]; then
	if [ ! -f "external/fswatch-$FSWATCH_VERSION.tar.gz" ]; then
		curl -L "https://github.com/emcrisostomo/fswatch/releases/download/$FSWATCH_VERSION/fswatch-$FSWATCH_VERSION.tar.gz" -o external/fswatch-$FSWATCH_VERSION.tar.gz || exit $?
	fi
	tar -xzf external/fswatch-$FSWATCH_VERSION.tar.gz -C external || exit $?
fi

# compile fswatch
cd external/fswatch-$FSWATCH_VERSION || exit $?
./configure "$@" || exit $?
make || exit $?
