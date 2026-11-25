#!/bin/bash
# Kid Mode must look the same as in the build it came from. Builds <old-ref> (default origin/main, the build this one will merge into) into $VERIFY_OUT/dist-old, takes the current
# dist/ as the new build, and compares both with kid-compare.mjs at pixel ratio 1 and 2 (with the self-test), plus a control run of the old
# build against itself. Exit 0 only when all three runs exit 0. Output: $VERIFY_OUT/kid-*.out
. "$(dirname "$0")/lib.sh"
# Arguments: an optional git ref (default origin/main) and an optional --expect-home, in either order. --expect-home: the differences the home makes on purpose are expected
# (see kid-compare.mjs); the two build-against-build runs get it, the control run never does.
REF=origin/main
EXTRA=
for arg in "$@"; do
  case "$arg" in
    --expect-home) EXTRA=--expect-home ;;
    --*) echo "unknown option $arg" >&2; exit 2 ;;
    *) REF=$arg ;;
  esac
done
require_dist
fresh_saves
SRC="$VERIFY_OUT/old-src"
rm -rf "$SRC" "$VERIFY_OUT/dist-old" "$VERIFY_OUT/dist-new"
mkdir -p "$SRC" && git -C "$ROOT" archive "$REF" | tar -x -C "$SRC" || exit 2
ln -s "$ROOT/node_modules" "$SRC/node_modules"
(cd "$SRC" && npx vite build > "$VERIFY_OUT/build-old.log" 2>&1) || { echo "build of $REF failed (see $VERIFY_OUT/build-old.log)" >&2; exit 2; }
cp -r "$SRC/dist" "$VERIFY_OUT/dist-old" && cp -r "$ROOT/dist" "$VERIFY_OUT/dist-new" || exit 2
serve 4190 "$VERIFY_OUT/srv-old.log" python3 -m http.server 4190 --bind 127.0.0.1 --directory "$VERIFY_OUT/dist-old"
OLD=$SERVER_PID
serve 4191 "$VERIFY_OUT/srv-new.log" python3 -m http.server 4191 --bind 127.0.0.1 --directory "$VERIFY_OUT/dist-new"
NEW=$SERVER_PID
cd "$HERE" || exit 2
node kid-compare.mjs --old http://127.0.0.1:4190 --new http://127.0.0.1:4191 --selftest $EXTRA --dpr 1 > "$VERIFY_OUT/kid-dpr1.out" 2>&1
r1=$?
node kid-compare.mjs --old http://127.0.0.1:4190 --new http://127.0.0.1:4191 --selftest $EXTRA --dpr 2 > "$VERIFY_OUT/kid-dpr2.out" 2>&1
r2=$?
node kid-compare.mjs --old http://127.0.0.1:4190 --new http://127.0.0.1:4190 --dpr 1 > "$VERIFY_OUT/kid-control.out" 2>&1
r3=$?
stop_server "$OLD"
stop_server "$NEW"
echo "exit codes: ratio1=$r1 ratio2=$r2 control=$r3"
tail -qn 1 "$VERIFY_OUT/kid-dpr1.out" "$VERIFY_OUT/kid-dpr2.out" "$VERIFY_OUT/kid-control.out"
[ $r1 -eq 0 ] && [ $r2 -eq 0 ] && [ $r3 -eq 0 ]
