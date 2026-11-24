#!/bin/bash
# Writes the saved games the shop contact sheet and the shop browser checks start from to $VERIFY_OUT/saves (shop-<scenario>-<mode>.json).
# The run scripts call it each time, so the saves follow src/game/state.ts.
. "$(dirname "$0")/lib.sh"
cd "$ROOT" || exit 2
npx esbuild "$HERE/gen-saves-shop.ts" --bundle --platform=node --format=esm --outfile="$VERIFY_OUT/gen-saves-shop.mjs" --log-level=warning || exit 2
node "$VERIFY_OUT/gen-saves-shop.mjs"
