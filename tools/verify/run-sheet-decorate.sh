#!/bin/bash
# The Decorate contact sheet: the page in each state of Decorate mode, both modes, at 320, 360 and 390 wide (pixel ratio 2, 2, 3), as $VERIFY_OUT/sheets-decorate-h2b/<mode>-<W>x<H>@<ratio>-<n>-<state>.png. Look at these before trusting any check about the layout.
. "$(dirname "$0")/lib.sh"
fresh_saves
# A Ctrl-C or a kill, even during the wait for the server to answer, must not leave vite preview on the port: the next run would refuse to start.
trap 'stop_server "$SERVER_PID"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
serve_dist 4173
PID=$SERVER_PID
cd "$HERE" || exit 2
node sheet-decorate.mjs --base http://127.0.0.1:4173 > "$VERIFY_OUT/sheet-decorate.out" 2>&1
rc=$?
stop_server "$PID"
tail -n 2 "$VERIFY_OUT/sheet-decorate.out"
[ $rc -eq 0 ] || exit $rc
