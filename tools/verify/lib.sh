# Shared by the run-*.sh scripts. Source it; do not run it.
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
# Everything the scripts make (saves, screenshots, builds, copies, logs) goes here, never into the repo.
export VERIFY_OUT=${VERIFY_OUT:-${TMPDIR:-/tmp}/broodkeep-verify}
mkdir -p "$VERIFY_OUT"

# serve <port> <log> <command...>: starts a server in its own process group and sets SERVER_PID once it answers.
# A port that already answers stops the run (exit 2): the checks would be testing someone else's server.
serve() {
  local port=$1 log=$2
  shift 2
  if curl -s -o /dev/null -m 2 "http://127.0.0.1:$port/"; then
    echo "port $port already answers; stop that server first" >&2
    exit 2
  fi
  setsid "$@" > "$log" 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 60); do
    curl -s -o /dev/null -m 2 "http://127.0.0.1:$port/" && return 0
    sleep 1
  done
  echo "nothing answers on port $port (see $log)" >&2
  kill -- -"$SERVER_PID" 2>/dev/null
  exit 2
}

# require_dist: dist/ exists and is newer than every source file, so a run never tests a build that is not the code in front of you.
require_dist() {
  [ -f "$ROOT/dist/index.html" ] || { echo "no dist/index.html: run npm run build first" >&2; exit 2; }
  local newer
  newer=$(find "$ROOT/src" "$ROOT/public" "$ROOT/index.html" "$ROOT/vite.config.ts" "$ROOT/pwa-manifest.ts" "$ROOT/package.json" -newer "$ROOT/dist/index.html" -print -quit) \
    || { echo "could not look for newer source files" >&2; exit 2; }
  if [ -n "$newer" ]; then
    echo "dist/ is older than the source ($newer): run npm run build first" >&2
    exit 2
  fi
}

# fresh_saves: the saved games are always rebuilt from the current rules (a few seconds), so they cannot lag behind src/game/state.ts.
fresh_saves() {
  "$HERE/gen-saves.sh" > "$VERIFY_OUT/gen-saves.log" 2>&1 || { echo "gen-saves failed (see $VERIFY_OUT/gen-saves.log)" >&2; exit 2; }
}

# serve_dist <port>: the built game (dist/), served by `vite preview` like the real site (headers, page fallback).
serve_dist() {
  require_dist
  cd "$ROOT" && serve "$1" "$VERIFY_OUT/preview-$1.log" npx vite preview --outDir dist --host 127.0.0.1 --port "$1" --strictPort
}

stop_server() {
  kill -- -"$1" 2>/dev/null
}
