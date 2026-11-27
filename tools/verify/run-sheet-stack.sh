#!/bin/bash
# The Stack & Balance contact sheet (A4.2): one picture per state and window in $VERIFY_OUT/sheet-stack/, then (with no extra arguments) one joined sheet per window by stitch-stack.py. No assertions; look at the pictures.
# Extra arguments go to sheet-stack.mjs (--sizes 360x640@2); the joined sheets need every window, so they are made only for a full run.
. "$(dirname "$0")/lib.sh"
fresh_saves
serve_dist 4173
PID=$SERVER_PID
NODE=
trap '[ -n "$NODE" ] && kill -- -"$NODE" 2>/dev/null; stop_server "$PID"' EXIT INT TERM  # an interrupted run stops the checker (its own process group, so its browser too) and the server
cd "$HERE" || exit 2
setsid node sheet-stack.mjs --base http://127.0.0.1:4173 "$@" > "$VERIFY_OUT/sheet-stack.out" 2>&1 &
NODE=$!
wait "$NODE"
rc=$?
stop_server "$PID"
tail -n 2 "$VERIFY_OUT/sheet-stack.out"
[ $rc -eq 0 ] || exit $rc
[ $# -eq 0 ] || exit 0
python3 stitch-stack.py
