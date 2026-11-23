#!/bin/bash
# The contact sheet: every state of the Retire section at 320, 360 and 390 wide (pixel ratio 2), as $VERIFY_OUT/sheets/sheet-<W>x<H>.png.
# Look at these before trusting any check about the layout.
. "$(dirname "$0")/lib.sh"
fresh_saves
serve_dist 4173
PID=$SERVER_PID
cd "$HERE" || exit 2
node sheet-retire.mjs --base http://127.0.0.1:4173 > "$VERIFY_OUT/sheet.out" 2>&1
rc=$?
stop_server "$PID"
tail -n 2 "$VERIFY_OUT/sheet.out"
[ $rc -eq 0 ] || exit $rc
python3 stitch-sheets.py
