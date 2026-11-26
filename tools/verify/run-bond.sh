#!/bin/bash
# The Bond browser checks (A3.1) against the built game (dist/). Extra arguments go to the checker: --only id1,id2  --sizes 360x640@2  --modes kid
# The exit code is the checker's: 0 all passed, 1 a check failed, 2 the run could not start. Output: $VERIFY_OUT/bond-browser.out
. "$(dirname "$0")/lib.sh"
fresh_saves
serve_dist 4173
PID=$SERVER_PID
cd "$HERE" || exit 2
node bond-browser.mjs --base http://127.0.0.1:4173 "$@" > "$VERIFY_OUT/bond-browser.out" 2>&1
rc=$?
stop_server "$PID"
tail -n 3 "$VERIFY_OUT/bond-browser.out"
exit $rc
