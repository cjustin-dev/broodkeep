#!/bin/bash
# Writes the saved games the habitat browser checks start from to $VERIFY_OUT/saves (22 files, hab-<scenario>-<mode>.json).
# The run scripts call it each time, so the saves follow src/game/state.ts.
. "$(dirname "$0")/lib.sh"
cd "$ROOT" || exit 2
npx esbuild "$HERE/gen-saves-habitat.ts" --bundle --platform=node --format=esm --outfile="$VERIFY_OUT/gen-saves-habitat.mjs" --log-level=warning || exit 2
node "$VERIFY_OUT/gen-saves-habitat.mjs"
