#!/bin/bash
# The request board contact sheet: the shop's item list (the default tab), every state of the Requests tab, and the room with a saved board in both modes, at 320, 360 and 390 wide (pixel ratio 2), as
# $VERIFY_OUT/sheets-board/sheet-<W>x<H>-<group>.png. Look at these before trusting any check about the layout.
. "$(dirname "$0")/lib.sh"
"$HERE/gen-saves-board.sh" > "$VERIFY_OUT/gen-saves-board.log" 2>&1 || { echo "gen-saves-board failed (see $VERIFY_OUT/gen-saves-board.log)" >&2; exit 2; }
# A Ctrl-C or a kill, even during the wait for the server to answer, must not leave vite preview on the port: the next run would refuse to start.
# (SERVER_PID is set inside serve(), before its wait loop; an empty one is harmless to stop_server.)
trap 'stop_server "$SERVER_PID"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
serve_dist 4173
PID=$SERVER_PID
cd "$HERE" || exit 2
node sheet-board.mjs --base http://127.0.0.1:4173 > "$VERIFY_OUT/sheet-board.out" 2>&1
rc=$?
stop_server "$PID"
tail -n 2 "$VERIFY_OUT/sheet-board.out"
[ $rc -eq 0 ] || exit $rc
python3 stitch-board.py
