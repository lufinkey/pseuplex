#!/bin/sh
export NODE_ENV=production
cd "$(dirname "$(realpath "$0")")" || exit $?
npm run build || exit $?
npm start -- --config=config/config.json || exit $?
