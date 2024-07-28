#!/bin/sh
if [ $# -lt 3 ]; then
    >&2 echo "Usage:"
    >&2 echo "  Arg 1: the path to the key file"
    >&2 echo "  Arg 2: the path to the cert file"
    >&2 echo "  Arg 3: the output path for the p12 file"
    >&2 echo "  Arg 4: the password to use to encrypt the p12 file"
    >&2 echo "  ./create_pkcs12.sh my_domain.key my_domain.crt my_domain.p12 pass123"
    exit 1
fi
inkey="$1"
incert="$2"
outfile="$3"
outpass="$4"
openssl pkcs12 -export -out "$outfile" -inkey "$inkey" -in "$incert" -passout "pass:$outpass"
