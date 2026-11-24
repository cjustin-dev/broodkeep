#!/bin/bash
# The shop browser checks (A2.2a) against the built game (dist/). Extra arguments go to the checker: --only id1,id2  --sizes 320x568@1  --modes kid
# The exit code is the checker's: 0 all passed, 1 a check failed, 2 the run could not start. Output: $VERIFY_OUT/shop-browser.out
. "$(dirname "$0")/lib.sh"
"$HERE/gen-saves-shop.sh" > "$VERIFY_OUT/gen-saves-shop.log" 2>&1 || { echo "gen-saves-shop failed (see $VERIFY_OUT/gen-saves-shop.log)" >&2; exit 2; }
serve_dist 4173
PID=$SERVER_PID
cd "$HERE" || exit 2
node shop-browser.mjs --base http://127.0.0.1:4173 "$@" > "$VERIFY_OUT/shop-browser.out" 2>&1
rc=$?
stop_server "$PID"
tail -n 3 "$VERIFY_OUT/shop-browser.out"
exit $rc
