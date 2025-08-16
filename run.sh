#!/bin/bash

# enter base directory
cd "${BASH_SOURCE%/*}" || exit $?

# install dependencies and build
npm install || exit $?
npm run build || exit $?

# run the app
export NODE_ENV=production
npm start -- --config=config/config.json || exit $?
