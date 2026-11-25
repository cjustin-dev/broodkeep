#!/bin/bash
# The hat contact sheet: the game's own hat code on every form in four pictures, as $VERIFY_OUT/hats-sheet/<hat>-<picture>.png (16 sheets). Look at these before trusting any
# check about the hats. Needs Pillow for python3.
. "$(dirname "$0")/lib.sh"
cd "$ROOT" || exit 2
rm -f "$VERIFY_OUT"/hats-sheet/*.png "$VERIFY_OUT/hats-sheet/sprites.json"
npx vitest run --config tools/verify/vitest.dump.config.mjs > "$VERIFY_OUT/hats-dump.log" 2>&1
rc=$?
[ $rc -eq 0 ] || { echo "the dump failed (see $VERIFY_OUT/hats-dump.log)" >&2; exit $rc; }
[ -s "$VERIFY_OUT/hats-sheet/sprites.json" ] || { echo "the dump wrote no sprites.json" >&2; exit 2; }
python3 "$HERE/sheet-hats.py" "$VERIFY_OUT/hats-sheet"
