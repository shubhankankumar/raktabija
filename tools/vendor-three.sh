#!/bin/sh
# Rebuilds js/vendor/three-0.160.0.min.js holding only the three.js parts js/render.js uses (tree-shaken:
# ~107 KB over the network instead of 200 KB for the full library, and less JavaScript for the phone to parse).
# Run it after using a new THREE.* name in js/render.js; `npm test` fails and names the missing part until you do.
# Needs Node and internet (downloads three and esbuild into a temp folder; nothing is added to this repo).
set -e
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
names=$(grep -oE 'THREE\.[A-Za-z0-9]+' js/render.js | sort -u | sed 's/THREE\.//' | paste -sd, -)
echo "export { $names } from 'three';" > "$tmp/entry.js"
(cd "$tmp" && npm i --silent --no-save three@0.160.0 esbuild@0.25.10 >/dev/null && npx esbuild entry.js --bundle --minify --format=esm --legal-comments=eof --outfile=out.js)
cp "$tmp/out.js" js/vendor/three-0.160.0.min.js
rm -rf "$tmp"
echo "updated js/vendor/three-0.160.0.min.js"
