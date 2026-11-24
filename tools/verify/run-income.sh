#!/bin/bash
# Prints what a simulated day of play earns for three kinds of player (income.ts). Run it before writing or changing a shop price.
. "$(dirname "$0")/lib.sh"
cd "$ROOT" || exit 2
npx esbuild "$HERE/income.ts" --bundle --platform=node --format=esm --outfile="$VERIFY_OUT/income.mjs" --log-level=warning || exit 2
node "$VERIFY_OUT/income.mjs"
