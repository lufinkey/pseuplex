
# validate args
for arg in "$@"; do
	if [[ ! $arg == -* ]]; then
		echo "Invalid arg $arg"
	fi
done

# get paths
base_dir="$(dirname "$(realpath "$0")")/../"
plexutils_path="$base_dir/tools/plex_utils.sh"
privatekey_path="$base_dir/keys/plex_privatekey.pem"
certchain_path="$base_dir/keys/plex_certchain.pem"

# extract ssl keys
echo "Extracting plex private key"
"$plexutils_path" "$@" ssl-cert output-privatekey "$privatekey_path" || return $?
echo "Updating privatekey permissions"
chmod 600 "$privatekey_path" || return $?

echo "Extracting plex certificate chain"
"$plexutils_path" "$@" ssl-cert output-certchain "$certchain_path" || return $?
echo "Updating certchain permissions"
chmod 644 "$certchain_path" || return $?
