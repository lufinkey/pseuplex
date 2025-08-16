#!/bin/bash

base_path="${BASH_SOURCE%/*}/.."

function get_platform {
	local unameOut=$(uname -s)
	case "$unameOut" in
		Linux*) echo "Linux" ;;
		Darwin*) echo "MacOS" ;;
		CYGWIN*) echo "Windows" ;;
		MINGW*) echo "Windows" ;;
		MSYS_NT*) echo "Windows" ;;
		Windows*) echo "Windows" ;;
		*)
			>&2 echo "Unknown uname $unameOut"
			return 1
			;;
	esac
}

case "$(get_platform)" in
	Linux)
		file_pattern=$(basename "$1" | sed 's/[].[^$*+?(){|\\]/\\&/g')
		>&2 echo "Listening for changes to $1"
		inotifywait -e modify,create,move "$(dirname "$1")" --include "^$file_pattern\$" || exit $?
		;;
	MacOS)
		FSWATCH_VERSION=1.18.3
		fswatch_path="$base_path/external/fswatch-$FSWATCH_VERSION/fswatch/src/fswatch"
		if [ ! -f "$fswatch_path" ]; then
			"$base_path/tools/build_fswatch.sh"
		fi
		>&2 echo "Listening for changes to $1"
		"$fswatch_path" -1 "$1" || exit $?
		;;
	Windows)
		# TODO implement windows
		;;
esac
