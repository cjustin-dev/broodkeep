#!/bin/bash
# The home browser checks (H1) against the built game (dist/). Extra arguments go to the checker: --only id1,id2  --sizes 320x568@2  --modes kid
# The exit code is the checker's: 0 all passed, 1 a check failed, 2 the run could not start. Output: $VERIFY_OUT/home-browser.out
. "$(dirname "$0")/lib.sh"
fresh_saves
# A Ctrl-C or a kill, even during the wait for the server to answer, must not leave vite preview on the port: the next run would refuse to start.
trap 'stop_server "$SERVER_PID"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
serve_dist 4173
PID=$SERVER_PID
cd "$HERE" || exit 2
node home-browser.mjs --base http://127.0.0.1:4173 "$@" > "$VERIFY_OUT/home-browser.out" 2>&1
rc=$?
stop_server "$PID"
tail -n 3 "$VERIFY_OUT/home-browser.out"
exit $rc
