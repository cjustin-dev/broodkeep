#!/bin/bash
# The Book recipe contact sheet (A4.4): the Book (the top, a card open for a baby, a kid, a young, a tier 1 and a tier 4 adult and the special, the stars, the bottom row's card, the
# completed lives, all raised, and Kid Mode for comparison) and the Forecast's Perfect line, at 320, 360 and 390 wide (pixel ratio 2), as $VERIFY_OUT/sheets-recipes/sheet-<W>x<H>-<group>.png.
# Look at these before trusting any check about the layout.
. "$(dirname "$0")/lib.sh"
"$HERE/gen-saves-recipes.sh" > "$VERIFY_OUT/gen-saves-recipes.log" 2>&1 || { echo "gen-saves-recipes failed (see $VERIFY_OUT/gen-saves-recipes.log)" >&2; exit 2; }
# A Ctrl-C or a kill, even during the wait for the server to answer, must not leave vite preview on the port: the next run would refuse to start.
# (SERVER_PID is set inside serve(), before its wait loop; an empty one is harmless to stop_server.)
trap 'stop_server "$SERVER_PID"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
serve_dist 4178
PID=$SERVER_PID
cd "$HERE" || exit 2
node sheet-recipes.mjs --base http://127.0.0.1:4178 > "$VERIFY_OUT/sheet-recipes.out" 2>&1
rc=$?
stop_server "$PID"
tail -n 2 "$VERIFY_OUT/sheet-recipes.out"
[ $rc -eq 0 ] || exit $rc
python3 stitch-recipes.py
