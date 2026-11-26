#!/bin/bash
# The training contact sheet (A3.2): one picture per state and window in $VERIFY_OUT/sheet-train/. No assertions; look at the pictures. Extra arguments go to sheet-train.mjs (--sizes 360x640@2).
. "$(dirname "$0")/lib.sh"
fresh_saves
serve_dist 4173
PID=$SERVER_PID
NODE=
trap '[ -n "$NODE" ] && kill -- -"$NODE" 2>/dev/null; stop_server "$PID"' EXIT INT TERM  # an interrupted run stops the checker (its own process group, so its browser too) and the server
cd "$HERE" || exit 2
setsid node sheet-train.mjs --base http://127.0.0.1:4173 "$@" > "$VERIFY_OUT/sheet-train.out" 2>&1 &
NODE=$!
wait "$NODE"
rc=$?
stop_server "$PID"
tail -n 2 "$VERIFY_OUT/sheet-train.out"
exit $rc
