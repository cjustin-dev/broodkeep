#!/bin/bash
# The H0 home mock (docs/home-plan.md): serves the source with `vite` (the mock imports the game's own drawings) and shoots the contact sheets to $VERIFY_OUT/sheets-home/.
. "$(dirname "$0")/lib.sh"
trap 'stop_server "$SERVER_PID"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
cd "$ROOT" && serve 4174 "$VERIFY_OUT/vite-dev-4174.log" npx vite --host 127.0.0.1 --port 4174 --strictPort
PID=$SERVER_PID
cd "$HERE" || exit 2
node home-mock.mjs --base http://127.0.0.1:4174 > "$VERIFY_OUT/home-mock.out" 2>&1
rc=$?
stop_server "$PID"
cat "$VERIFY_OUT/home-mock.out"
exit $rc
