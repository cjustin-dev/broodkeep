#!/bin/bash
# The Timed combat contact sheet (A4.3): one picture per state and window in $VERIFY_OUT/sheet-combat/, then (with no extra arguments) one joined sheet per window by stitch-combat.py. No assertions; look at the pictures.
# Extra arguments go to sheet-combat.mjs (--sizes 360x640@2); the joined sheets need every window, so they are made only for a full run.
. "$(dirname "$0")/lib.sh"
fresh_saves
serve_dist 4175
PID=$SERVER_PID
NODE=
trap '[ -n "$NODE" ] && kill -- -"$NODE" 2>/dev/null; stop_server "$PID"' EXIT INT TERM  # an interrupted run stops the checker (its own process group, so its browser too) and the server
cd "$HERE" || exit 2
setsid node sheet-combat.mjs --base http://127.0.0.1:4175 "$@" > "$VERIFY_OUT/sheet-combat.out" 2>&1 &
NODE=$!
wait "$NODE"
rc=$?
stop_server "$PID"
tail -n 2 "$VERIFY_OUT/sheet-combat.out"
[ $rc -eq 0 ] || exit $rc
[ $# -eq 0 ] || exit 0
python3 stitch-combat.py
