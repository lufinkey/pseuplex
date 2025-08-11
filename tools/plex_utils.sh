#!/bin/bash

pms_appdata_path=
pms_cache_path=
platform=
subcmd=

# parse command line options

function parse_cmdarg_single_nonempty {
	local varname="$1"
	shift
	if [ -n "$pms_appdata_path" ]; then
		>&2 echo "$1 given multiple times. Only the last argument will be used."
	elif [ -z "$2" ]; then
		>&2 echo "Empty string is not a valid value for $1"
		exit 1
	fi
	declare "$varname"="$2"
}

while [[ $# -gt 0 ]]; do
	case $1 in
		--appdata-path)
			parse_cmdarg_single_nonempty pms_appdata_path "$1" "$2"
			shift; shift;
			;;
		--cache-path)
			parse_cmdarg_single_nonempty pms_cache_path "$1" "$2"
			shift; shift;
			;;
		--platform)
			parse_cmdarg_single_nonempty platform "$1" "$2"
			shift; shift;
			if [ "$platform" != "Linux" ] && [ "$platform" != "MacOS" ] && [ "$platform" != "Windows" ]; then
				>&2 echo "Unknown platform $platform"
				exit 1
			fi
			;;
		-*|--*)
			>&2 echo "Unknown option $1"
			exit 1
			;;
		*)
			subcmd="$1"
			shift
			if [ -z "$subcmd" ]; then
				>&2 echo "Empty string is not a valid subcommand"
				exit 1
			fi
			break
		;;
	esac
done
if [ -z "$subcmd" ]; then
	>&2 echo "No subcommand given"
	exit 1
fi


# Helper functions

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

function windows_reg_query {
	if [ -z "$2" ]; then
		>&2 echo "no registry key provided"
		return 1
	fi
	(reg query "$1" -v "$2" || return $?) | ( while read -r line; do
		line=$(tr -d '\0\n\r' <<< "$line")
		if [ -z "$line" ] || [ "$line" == "$1" ]; then
			continue
		elif [[ $line != "$2"* ]]; then
			continue
		fi
		local key_len="${#2}"
		((key_len++))
		line=$(cut -c "$key_len"- <<< "$line" | sed -E 's/^ {1,4}[a-zA-Z0-9_-]+ {1,4}//')
		echo "$line"
		return 0
	done; return 1; )
	result=$?
	if [ $result -ne 0 ]; then
		>&2 echo "Failed to parse reg query output for $1\\$2"
		return $result
	fi
	return 0
}

function plex_windows_reg_query {
	windows_reg_query 'HKEY_CURRENT_USER\Software\Plex, Inc.\Plex Media Server' "$@" || return $?
}



# AppData paths

function pms_appdata_linux {
	echo "/var/lib/plexmediaserver/Library/Application Support/Plex Media Server"
}
function pms_appdata_macos {
	echo ~/"Library/Application Support/Plex Media Server"
}
function pms_appdata_windows {
	reg_output=$(plex_windows_reg_query "LocalAppDataPath")
	result=$?
	if [ $result -eq 0 ] && [ -n "$reg_output" ]; then
		echo "$reg_output"
		return 0
	fi
	if [ -z "$LOCALAPPDATA" ]; then
		>&2 echo "LOCALAPPDATA environment variable is not defined"
		return 1
	fi
	echo "$LOCALAPPDATA/Plex Media Server";
}

function get_appdata_path {
	if [ -z "$platform" ]; then
		platform=$(get_platform)
		local result=$?
		if [ $result -ne 0 ]; then
			return $result
		fi
	fi
	case "$platform" in
		Linux) pms_appdata_linux || return $? ;;
		MacOS) pms_appdata_macos || return $? ;;
		Windows) pms_appdata_windows || return $? ;;
		*)
			>&2 echo "Unknown determine appdata path for platform $platform"
			return 1
			;;
	esac
}


# Cache paths

function pms_cache_linux {
	if [ -z "$pms_appdata_path" ]; then
		pms_appdata_path=$(pms_appdata_linux)
	fi
	local result=$?
	if [ $result -ne 0 ]; then
		return $result
	fi
	echo "$pms_appdata_path/Cache";
}
function pms_cache_macos {
	echo ~/"Library/Caches/PlexMediaServer";
}
function pms_cache_windows {
	if [ -z "$pms_appdata_path" ]; then
		pms_appdata_path=$(pms_appdata_windows)
	fi
	local result=$?
	if [ $result -ne 0 ]; then
		return $result
	fi
	echo "$pms_appdata_path/Cache";
}

function get_cache_path {
	if [ -z "$platform" ]; then
		platform=$(get_platform)
		local result=$?
		if [ $result -ne 0 ]; then
			return $result
		fi
	fi
	case "$platform" in
		Linux) pms_cache_linux || return $? ;;
		MacOS) pms_cache_macos || return $? ;;
		Windows) pms_cache_windows || return $? ;;
		*)
			>&2 echo "Cannot determine cache path for platform $platform"
			return 1
			;;
	esac
}


# SSL Certificate

function get_ssl_cert_p12_path {
	local result=0
	if [ -z "$platform" ]; then
		platform=$(get_platform)
		result=$?
		if [ $result -ne 0 ]; then
			return $result
		fi
	fi
	case "$platform" in
		Linux)
			if [ -z "$pms_cache_path" ]; then
				pms_cache_path=$(pms_cache_linux)
				result=$?
			fi
			;;
		MacOS)
			if [ -z "$pms_cache_path" ]; then
				pms_cache_path=$(pms_cache_macos)
				result=$?
			fi
			;;
		Windows)
			if [ -z "$pms_cache_path" ]; then
				pms_cache_path=$(pms_cache_windows)
				result=$?
			fi
			;;
		*)
			>&2 echo "Cannot determine SSL p12 path for platform $platform"
			return 1
			;;
	esac
	if [ $result -ne 0 ]; then
		return $result
	fi
	echo "$pms_cache_path/cert-v2.p12"
}

function get_ssl_cert_p12_password {
	local pmi=$(get_prefs_value "ProcessedMachineIdentifier")
	local result=$?
	if [ $result -ne 0 ]; then
		return $result
	fi
	echo -n "plex$pmi" | (sha512sum || return $?) | (grep -o '^\S\+' || return $?)
}

function output_ssl_cert {
	local cert_pass=$(get_ssl_cert_p12_password)
	local result=$?
	if [ $result -ne 0 ]; then
		return $result
	fi
	local cert_path=$(get_ssl_cert_p12_path)
	result=$?
	if [ $result -ne 0 ]; then
		return $result
	fi
	local cert_out_path="$1"
	if [ -z "$cert_out_path" ]; then
		>&2 echo "No output path given"
		return 1
	fi
	openssl pkcs12 -in "$cert_path" -out "$cert_out_path" -clcerts -nokeys -passin "pass:$cert_pass" || return $?
}

function output_ssl_privatekey {
	local cert_pass=$(get_ssl_cert_p12_password)
	local result=$?
	if [ $result -ne 0 ]; then
		return $result
	fi
	local cert_path=$(get_ssl_cert_p12_path)
	result=$?
	if [ $result -ne 0 ]; then
		return $result
	fi
	local key_out_path="$1"
	if [ -z "$key_out_path" ]; then
		>&2 echo "No output path given"
		return 1
	fi
	openssl pkcs12 -in "$cert_path" -out "$key_out_path" -nocerts -nodes -passin "pass:$cert_pass" || return $?
}


# Plex Server Preferences

function get_prefs_value {
	local prefname="$1"
	local result
	if [ -z "$platform" ]; then
		platform=$(get_platform)
		result=$?
		if [ $result -ne 0 ]; then
			return $result
		fi
	fi
	case "$platform" in
		Linux)
			if [ -z "$pms_appdata_path" ]; then
				pms_appdata_path=$(pms_appdata_linux)
			fi
			prefxml_path="$pms_appdata_path/Preferences.xml"
			if [ ! -f "$prefxml_path" ]; then
				>&2 echo "Could not find plex preferences at $prefxml_path"
				return 2
			fi
			if [ -z "$(which xq)" ]; then
				>&2 echo "xq must be installed to read from plex's Preferences.xml"
				return 3
			fi
			(cat "$prefxml_path" || return $?) | (xq -x "//Preferences/@$prefname" || return $?)
			;;
		MacOS)
			defaults read com.plexapp.plexmediaserver "$prefname" || return $?
			;;
		Windows)
			plex_windows_reg_query "$prefname" || return $?
			;;
		*)
			>&2 echo "Unknown platform $platform"
			return 1
			;;
	esac
	result=$?
	if [ $result -ne 0 ]; then
		return $result
	fi
}


# Handle command

case "$subcmd" in
	path)
		subcmd="$1"
		shift
		case "$subcmd" in
			appdata)
				get_appdata_path "$@" || exit $?
				exit 0
				;;
			cache)
				get_cache_path "$@" || exit $?
				exit 0
				;;
			ssl-cert-p12)
				get_ssl_cert_12_path "$@" || exit $?
				exit 0
				;;
			*)
				>&2 echo "Unknown subcommand $subcmd"
				exit 1
				;;
		esac
		;;
	pref)
		get_prefs_value "$@" || exit $?
		exit 0
		;;
	ssl-cert)
		subcmd="$1"
		shift
		case "$subcmd" in
			p12-password)
				get_ssl_cert_p12_password "$@" || exit $?
				exit 0
				;;
			output-cert)
				output_ssl_cert "$@" || exit $?
				exit 0
				;;
			output-privatekey)
				output_ssl_privatekey "$@" || exit $?
				exit 0
				;;
			*)
				>&2 echo "Unknown subcommand $subcmd"
				exit 1
				;;
		esac
		;;
	*)
		>&2 echo "Unknown subcommand $subcmd"
		exit 1
		;;
esac
