#!/bin/bash
# The Playroom contact sheet (H3): the grown home in Decorate mode, at 320, 360 and 390 wide, as $VERIFY_OUT/sheets-grow/<W>x<H>@<ratio>-<state>.png. Look at these before trusting any check about the layout.
. "$(dirname "$0")/lib.sh"
fresh_saves
# A Ctrl-C or a kill, even during the wait for the server to answer, must not leave vite preview on the port: the next run would refuse to start.
trap 'stop_server "$SERVER_PID"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
serve_dist 4173
PID=$SERVER_PID
cd "$HERE" || exit 2
node sheet-grow.mjs --base http://127.0.0.1:4173 > "$VERIFY_OUT/sheet-grow.out" 2>&1
rc=$?
stop_server "$PID"
tail -n 2 "$VERIFY_OUT/sheet-grow.out"
exit $rc
