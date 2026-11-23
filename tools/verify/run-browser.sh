#!/bin/bash
# The Retire browser checks against the built game (dist/). Extra arguments go to the checker: --only id1,id2  --sizes 320x568@1  --modes kid
# The exit code is the checker's: 0 all passed, 1 a check failed, 2 the run could not start. Output: $VERIFY_OUT/browser.out
. "$(dirname "$0")/lib.sh"
fresh_saves
serve_dist 4173
PID=$SERVER_PID
cd "$HERE" || exit 2
node retire-browser.mjs --base http://127.0.0.1:4173 "$@" > "$VERIFY_OUT/browser.out" 2>&1
rc=$?
stop_server "$PID"
tail -n 3 "$VERIFY_OUT/browser.out"
exit $rc
