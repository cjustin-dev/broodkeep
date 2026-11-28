#!/bin/bash
# The Book recipe browser checks (A4.4) against the built game (dist/). Extra arguments go to the checker: --only id1,id2  --sizes 320x568@1  --modes kid
# The exit code is the checker's: 0 all passed, 1 a check failed, 2 the run could not start. Output: $VERIFY_OUT/recipes-browser.out
. "$(dirname "$0")/lib.sh"
"$HERE/gen-saves-recipes.sh" > "$VERIFY_OUT/gen-saves-recipes.log" 2>&1 || { echo "gen-saves-recipes failed (see $VERIFY_OUT/gen-saves-recipes.log)" >&2; exit 2; }
# A Ctrl-C or a kill, even during the wait for the server to answer, must not leave vite preview on the port: the next run would refuse to start.
# (SERVER_PID is set inside serve(), before its wait loop; an empty one is harmless to stop_server.)
trap 'stop_server "$SERVER_PID"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
serve_dist 4177
PID=$SERVER_PID
cd "$HERE" || exit 2
node recipes-browser.mjs --base http://127.0.0.1:4177 "$@" > "$VERIFY_OUT/recipes-browser.out" 2>&1
rc=$?
stop_server "$PID"
tail -n 3 "$VERIFY_OUT/recipes-browser.out"
exit $rc
