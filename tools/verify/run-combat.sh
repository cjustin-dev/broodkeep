#!/bin/bash
# The Timed combat browser checks (A4.3) against the built game (dist/). Extra arguments go to the checker: --only id1,id2  --sizes 360x640@2  --modes kid
# The exit code is the checker's: 0 all passed, 1 a check failed, 2 the run could not start. Output: $VERIFY_OUT/combat-browser.out
. "$(dirname "$0")/lib.sh"
fresh_saves
serve_dist 4176
PID=$SERVER_PID
NODE=
trap '[ -n "$NODE" ] && kill -- -"$NODE" 2>/dev/null; stop_server "$PID"' EXIT INT TERM  # an interrupted run stops the checker (its own process group, so its browser too) and the server
cd "$HERE" || exit 2
setsid node combat-browser.mjs --base http://127.0.0.1:4176 "$@" > "$VERIFY_OUT/combat-browser.out" 2>&1 &
NODE=$!
wait "$NODE"
rc=$?
stop_server "$PID"
tail -n 3 "$VERIFY_OUT/combat-browser.out"
exit $rc
