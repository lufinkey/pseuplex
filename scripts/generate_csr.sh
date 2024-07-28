#!/bin/sh
if [ $# -lt 3 ]; then
    >&2 echo "Usage:"
    >&2 echo "  Arg 1: the path to the CSR config"
    >&2 echo "  Arg 2: the file to output the CSR"
    >&2 echo "  Arg 3: the file to output the private key"
    >&2 echo "  ./generate_csr.sh csr.config.sh my_domain.csr my_domain.key"
    exit 1
fi
csr_config_path="$1"
outfile="$2"
keyoutfile="$3"
source "$csr_config_path"
openssl req -new -newkey rsa:2048 -nodes -out "$outfile" -keyout "$keyoutfile" -subj "/C=$country/ST=$state/L=$city/O=$orgname/CN=$commonname"
