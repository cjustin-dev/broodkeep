#!/bin/bash
# The shop contact sheet: every state of the header, the room's looks and the shop panel at 320, 360 and 390 wide (pixel ratio 2), as
# $VERIFY_OUT/sheets-shop/sheet-<W>x<H>-<group>.png. Look at these before trusting any check about the layout.
. "$(dirname "$0")/lib.sh"
"$HERE/gen-saves-shop.sh" > "$VERIFY_OUT/gen-saves-shop.log" 2>&1 || { echo "gen-saves-shop failed (see $VERIFY_OUT/gen-saves-shop.log)" >&2; exit 2; }
serve_dist 4173
PID=$SERVER_PID
cd "$HERE" || exit 2
node sheet-shop.mjs --base http://127.0.0.1:4173 > "$VERIFY_OUT/sheet-shop.out" 2>&1
rc=$?
stop_server "$PID"
tail -n 2 "$VERIFY_OUT/sheet-shop.out"
[ $rc -eq 0 ] || exit $rc
python3 stitch-shop.py
