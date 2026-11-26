#!/bin/bash
# The Bond contact sheet (A3.1): one picture per state and window in $VERIFY_OUT/sheet-bond/. No assertions; look at the pictures. Extra arguments go to sheet-bond.mjs (--sizes 360x640@2).
. "$(dirname "$0")/lib.sh"
fresh_saves
serve_dist 4173
PID=$SERVER_PID
cd "$HERE" || exit 2
node sheet-bond.mjs --base http://127.0.0.1:4173 "$@" > "$VERIFY_OUT/sheet-bond.out" 2>&1
rc=$?
stop_server "$PID"
tail -n 2 "$VERIFY_OUT/sheet-bond.out"
exit $rc
