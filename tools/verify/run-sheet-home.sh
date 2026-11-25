#!/bin/bash
# The home contact sheet: the picture of the home in every state a saved game can be in, with the camera moved, and the whole page in both modes, at 320, 360 and 390 wide (pixel ratio 2), as
# $VERIFY_OUT/sheets-home-h1/sheet-<W>x<H>-<group>.png. Look at these before trusting any check about the layout.
. "$(dirname "$0")/lib.sh"
fresh_saves
# A Ctrl-C or a kill, even during the wait for the server to answer, must not leave vite preview on the port: the next run would refuse to start.
trap 'stop_server "$SERVER_PID"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
serve_dist 4173
PID=$SERVER_PID
cd "$HERE" || exit 2
node sheet-home.mjs --base http://127.0.0.1:4173 > "$VERIFY_OUT/sheet-home.out" 2>&1
rc=$?
stop_server "$PID"
tail -n 2 "$VERIFY_OUT/sheet-home.out"
[ $rc -eq 0 ] || exit $rc
python3 stitch-home.py
