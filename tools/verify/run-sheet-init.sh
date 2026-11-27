#!/bin/bash
# The initiatives contact sheet (A3.3): one picture per state and window in $VERIFY_OUT/sheet-init/. No assertions; look at the pictures. Extra arguments go to sheet-init.mjs (--sizes 360x640@2, --only play,gift-coin).
. "$(dirname "$0")/lib.sh"
fresh_saves
serve_dist 4173
PID=$SERVER_PID
NODE=
trap '[ -n "$NODE" ] && kill -- -"$NODE" 2>/dev/null; stop_server "$PID"' EXIT INT TERM  # an interrupted run stops the checker (its own process group, so its browser too) and the server
cd "$HERE" || exit 2
setsid node sheet-init.mjs --base http://127.0.0.1:4173 "$@" > "$VERIFY_OUT/sheet-init.out" 2>&1 &
NODE=$!
wait "$NODE"
rc=$?
stop_server "$PID"
tail -n 2 "$VERIFY_OUT/sheet-init.out"
exit $rc
