#!/bin/sh
cd "$(dirname "$(realpath "$0")")" || exit $?
npm install || exit $?
npm run build || exit $?
export NODE_ENV=production
npm start -- --config=config/config.json || exit $?
