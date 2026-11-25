#!/bin/bash
# Writes the saved games the browser checks start from to $VERIFY_OUT/saves (20 files). The run scripts call it each time, so the saves follow src/game/state.ts.
. "$(dirname "$0")/lib.sh"
cd "$ROOT" || exit 2
npx esbuild "$HERE/gen-saves.ts" --bundle --platform=node --format=esm --outfile="$VERIFY_OUT/gen-saves.mjs" --log-level=warning || exit 2
node "$VERIFY_OUT/gen-saves.mjs"
