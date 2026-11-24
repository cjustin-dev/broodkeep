#!/bin/bash
# The habitat contact sheet: every state of the spot card, the job card and the haul card at 320, 360 and 390 wide (pixel ratio 2), as
# $VERIFY_OUT/sheets-habitat/sheet-<W>x<H>-<group>.png. Look at these before trusting any check about the layout.
. "$(dirname "$0")/lib.sh"
"$HERE/gen-saves-habitat.sh" > "$VERIFY_OUT/gen-saves-habitat.log" 2>&1 || { echo "gen-saves-habitat failed (see $VERIFY_OUT/gen-saves-habitat.log)" >&2; exit 2; }
serve_dist 4173
PID=$SERVER_PID
cd "$HERE" || exit 2
node sheet-habitat.mjs --base http://127.0.0.1:4173 > "$VERIFY_OUT/sheet-habitat.out" 2>&1
rc=$?
stop_server "$PID"
tail -n 2 "$VERIFY_OUT/sheet-habitat.out"
[ $rc -eq 0 ] || exit $rc
python3 stitch-habitat.py
