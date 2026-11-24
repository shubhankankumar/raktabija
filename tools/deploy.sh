#!/bin/sh
# Publishes the game to Cloudflare Pages (https://raktabija.pages.dev). Uploads only the files the game needs,
# never notes, tests, legacy/ or node_modules. Usage: sh tools/deploy.sh          (live site)
#                                                     sh tools/deploy.sh preview  (a private preview URL first)
set -e
cd "$(dirname "$0")/.."
npm test
rm -rf .deploy && mkdir .deploy && cp -r index.html _headers css fonts js .deploy/
# "main" is the Pages production branch; any other --branch value (e.g. "preview") makes a preview deployment.
npx --yes wrangler@4.157.0 pages deploy .deploy --project-name raktabija --branch "${1:-main}" --commit-dirty=true
rm -rf .deploy
