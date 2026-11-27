#!/usr/bin/env python3
"""Mutation runner for the SCREEN side of the home (Broodkeep, Home slice H1, docs/home-plan.md): the camera, the gestures, the Find button, the touch rules.

Works only on a copy of the repo at $VERIFY_OUT/home-ui-copy (never the real repo).
Each mutant is one or more exact text replaces in the copy. The copy is rebuilt, served by
`vite preview` on port 4182 (the only port this runner uses; 4180-4189 are reserved for the mutation runners), and
the browser checker home-browser.mjs runs with only the check ids that the mutant must break, at 360x640@2.

Usage:
  python3 mutate-home-ui.py    --check-targets   verify each `old` occurs exactly once in the copy; print the table
  python3 mutate-home-ui.py                      clean baseline, every mutant, final clean rebuild
  python3 mutate-home-ui.py --only id1,id2       the same baselines, then only these mutants (an unknown or empty id stops the run, exit 2)

Exit codes: 0 every mutant CAUGHT and the final checks pass; 1 some mutant not caught, or a final check
failed; 2 the run stopped (copy out of sync, clean build failed its own checks, build or serve broke).

The edge cases it handles are the board runner's (mutate-board-ui.py): an `old` that occurs 0 or 2+ times is ERROR and not applied; a build that
breaks, a checker that hangs (killed by process group), a served page that is not the build just made, a server already answering on the port, a
checker exit 1 whose FAIL lines name only other ids (CAUGHT-BY-OTHER), exit 1 with no FAIL line (ERROR), exit 0 (SURVIVED); Ctrl-C or SIGTERM
restores the file under edit and stops the servers; the final clean rebuild must equal the first one and the copy's src/ must equal the real src/.
"""

import argparse
import hashlib
import os
import re
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
REAL = os.path.abspath(os.path.join(HERE, "..", ".."))  # the repo this file is in
# Everything this runner makes (the copy, the logs) goes to VERIFY_OUT, never into the repo.
VERIFY_OUT = os.environ.get("VERIFY_OUT") or os.path.join(tempfile.gettempdir(), "broodkeep-verify")
COPY = os.path.join(VERIFY_OUT, "home-ui-copy")
CHECKER = os.path.join(HERE, "home-browser.mjs")
LOGS = os.path.join(VERIFY_OUT, "mutate-home-ui-logs")
PORT = 4182  # ports 4180-4189 are the mutation runners'; this one uses 4182 only
SIZE = "360x640@2"
BUILD_TIMEOUT = 600
BASELINE_TIMEOUT = 1500
MUTANT_TIMEOUT = 240

ALL_IDS = ["home-open", "home-pan", "home-pinch", "home-find", "home-pet", "home-asleep", "home-layout", "home-keys", "home-mouse"]

STAGE = "src/ui/Stage.tsx"
ROOM = "src/art/room.ts"
HOME = "src/art/home.ts"
STATE = "src/game/state.ts"
CAM = "src/art/camera.ts"
GES = "src/ui/gesture.ts"
IDLE = "src/art/idle.ts"
CSS = "src/ui/app.css"

# edits: (file, old, new), applied in order. `old` must occur exactly once in that file of the copy.
# expect: check ids that must FAIL for the mutant to count as caught. kid_only: the checker runs --modes kid. size: the one window the checker runs
# at for this mutant (default SIZE, 360x640@2).
def M(id, expect, what, edits, **kw):
    return dict(id=id, expect=expect, kid_only=kw.get("kid_only", False), what=what, edits=edits, **({"size": kw["size"]} if "size" in kw else {}))


MUTANTS = [
    # where the home opens, and how far it zooms
    M("default-zoom-one-less", ["home-open"], "the home opens one device pixel per game pixel smaller than it should",
      [(CAM, "Math.max(MIN_ZOOM, Math.floor(vp.h / world.h))", "Math.max(MIN_ZOOM, Math.floor(vp.h / world.h) - 1)")]),
    M("max-zoom-too-big", ["home-pinch"], "the largest zoom is 3.5 CSS pixels per game pixel, not 2.5",
      [(CAM, "Math.round(2.5 * dpr)", "Math.round(3.5 * dpr)")]),
    M("snap-floors", ["home-pinch"], "a pinch settles on the whole number below, not the nearest",
      [(CAM, "Math.max(MIN_ZOOM, Math.round(zoom))", "Math.max(MIN_ZOOM, Math.floor(zoom))")]),
    M("snap-not-whole", ["home-pinch"], "a pinch settles on whatever the fingers made (a fractional zoom)",
      [(CAM, "Math.max(MIN_ZOOM, Math.round(zoom))", "Math.max(MIN_ZOOM, zoom)")]),
    M("settle-never-comes", ["home-pinch"], "the last finger lifting does not settle the zoom",
      [(GES, 'return settle ? [{ type: "end" }] : [];', "return [];")]),
    M("pinch-does-nothing", ["home-pinch"], "two fingers moving do not change the zoom",
      [(GES, 'if (this.mode === "pinch" && this.down_.size >= 2) {', 'if (false && this.mode === "pinch" && this.down_.size >= 2) {')]),
    # the camera stays inside the home
    M("camera-leaves-home-sideways", ["home-pan"], "the camera can be dragged past the home's left and right walls",
      [(CAM, "world.w / 2 : Math.min(world.w - halfW, Math.max(halfW, cam.x));", "world.w / 2 : cam.x;")]),
    M("short-home-not-centred", ["home-open"], "a home shorter than the picture sits at its top, not in the middle",
      [(CAM, "const y = halfH * 2 >= world.h ? world.h / 2 :", "const y = halfH * 2 >= world.h ? halfH :")]),
    M("vertical-not-clamped", ["home-pan"], "the camera can be dragged up and down although the home fits",
      [(CAM, "const y = halfH * 2 >= world.h ? world.h / 2 : Math.min(world.h - halfH, Math.max(halfH, cam.y));", "const y = cam.y;")]),
    # a drag
    M("drag-goes-the-wrong-way", ["home-pan"], "the home moves opposite to the finger",
      [(CAM, "x: cam.x - dx / cam.zoom", "x: cam.x + dx / cam.zoom")]),
    M("drag-ignores-zoom", ["home-pan"], "the home moves by the finger's travel in game pixels, not device pixels per zoom step",
      [(CAM, "x: cam.x - dx / cam.zoom", "x: cam.x - dx")]),
    M("slop-too-big", ["home-pan"], "a finger must move 20 CSS pixels before it pans (the slop is 8)",
      [(GES, "export const SLOP = 8;", "export const SLOP = 20;")]),
    M("slop-none", ["home-pan"], "any movement at all is a pan",
      [(GES, "export const SLOP = 8;", "export const SLOP = 0;")]),
    M("first-pan-step-lost", ["home-pan"], "the pan counts from where the finger passed the slop, so the first part of the travel is lost",
      [(GES, "this.last = f.start;", "this.last = p;")]),
    M("touch-action-left-alone", ["home-open"], "the picture has no touch-action of its own (the computed value is not none)",
      [(STAGE, 'touchAction: inHome ? "none" : undefined', "touchAction: undefined")]),
    M("page-follows-a-finger", ["home-pan"], "the picture lets the page behind scroll up and down under a finger (touch-action pan-y)",
      [(STAGE, 'touchAction: inHome ? "none" : undefined', 'touchAction: inHome ? "pan-y" : undefined')]),
    # the keys
    M("picture-not-focusable", ["home-open"], "the picture cannot take keyboard focus",
      [(STAGE, "tabIndex={inHome ? 0 : undefined}", "tabIndex={undefined}")]),
    M("key-step-bigger", ["home-keys"], "an arrow key pans a quarter of the picture, not a fifth",
      [(CAM, "const step = Math.round(vp.w / 5);", "const step = Math.round(vp.w / 4);")]),
    M("ctrl-key-pans", ["home-keys"], "Ctrl and a key is the picture's key too (the browser's zoom also zooms the picture)",
      [(STAGE, "|| !cam || e.ctrlKey || e.metaKey || e.altKey) return;", "|| !cam || e.metaKey || e.altKey) return;")]),
    M("meta-key-pans", ["home-keys"], "Meta and a key is the picture's key too",
      [(STAGE, "|| !cam || e.ctrlKey || e.metaKey || e.altKey) return;", "|| !cam || e.ctrlKey || e.altKey) return;")]),
    M("alt-key-pans", ["home-keys"], "Alt and a key is the picture's key too (the browser's back button also pans the picture)",
      [(STAGE, "|| !cam || e.ctrlKey || e.metaKey || e.altKey) return;", "|| !cam || e.ctrlKey || e.metaKey) return;")]),
    M("plus-steps-two", ["home-keys"], "the plus key zooms in two whole steps",
      [(CAM, "snapZoom(cam.zoom + 1, dpr)", "snapZoom(cam.zoom + 2, dpr)")]),
    # the touch on the creature
    M("pet-slack-none", ["home-pet"], "a touch must be on the picture of the creature itself (no slack)",
      [(STAGE, "const PET_PAD_CSS = 14;", "const PET_PAD_CSS = 0;")]),
    M("pet-slack-huge", ["home-pet"], "a touch 40 CSS pixels past the creature still counts",
      [(STAGE, "const PET_PAD_CSS = 14;", "const PET_PAD_CSS = 40;")]),
    M("pet-comes-late", ["home-pet"], "the first pet comes after 1.5 seconds, not 450 ms",
      [(STAGE, "\n        }, 450);", "\n        }, 1500);")]),
    M("tickle-needs-four", ["home-pet"], "the tickle needs four quick taps",
      [(STAGE, "if (taps.current.length >= 3) {", "if (taps.current.length >= 4) {")]),
    M("tickle-at-second-tap", ["home-pet"], "the tickle comes at the second quick tap",
      [(STAGE, "if (taps.current.length >= 3) {", "if (taps.current.length >= 2) {")]),
    M("second-finger-keeps-the-hold", ["home-pet"], "a second finger landing does not end the hold",
      [(GES, "this.pinchC = middle(a.now, b.now);\n      return true;", "this.pinchC = middle(a.now, b.now);\n      return false;")]),
    M("pan-keeps-the-hold", ["home-pet"], "a drag that started on the creature still pets it",
      [(STAGE, "endHold(); // a pan or a pinch is never a pet", "/* the hold is kept */")]),
    M("egg-tap-does-nothing", ["home-pet"], "tapping the egg shaves nothing off",
      [(STAGE, "game.act((s, now) => tapEgg(s, now));", "/* no tap */")]),
    M("mouse-right-button-counts", ["home-mouse"], "the right mouse button drags and pets like the main one",
      [(STAGE, 'if (e.pointerType === "mouse" && e.button !== 0) return; // only the main mouse button', "// (any button)")]),
    # Find
    M("find-never-shown", ["home-find"], "the Find button never appears",
      [(STAGE, "const wanted: IconName | null = visible ? null :", "const wanted: IconName | null = true ? null :")]),
    M("find-always-shown", ["home-open"], "the Find button is always there, even when the creature is in view",
      [(STAGE, "const wanted: IconName | null = visible ? null :", "const wanted: IconName | null = false ? null :")]),
    M("find-always-jumps", ["home-find"], "Find jumps the camera although motion is welcome",
      [(STAGE, "if (window.matchMedia?.(MOTION_QUERY).matches) {", "if (true) {")]),
    M("find-never-jumps", ["home-find"], "Find glides even when less motion is asked for",
      [(STAGE, "if (window.matchMedia?.(MOTION_QUERY).matches) {", "if (false) {")]),
    M("find-glide-takes-3-seconds", ["home-find"], "the glide takes 3 seconds, not 0.35",
      [(STAGE, "const GLIDE_SECONDS = 0.35;", "const GLIDE_SECONDS = 3;")]),
    M("find-button-small", ["home-find"], "the Find button is 30 by 30 CSS pixels",
      [(CSS, ".btn.find {\n  grid-area: 1 / 1;\n  justify-self: end;\n  align-self: end;\n  z-index: 2;\n  width: 48px;\n  min-height: 48px;\n  height: 48px;", ".btn.find {\n  grid-area: 1 / 1;\n  justify-self: end;\n  align-self: end;\n  z-index: 2;\n  width: 30px;\n  min-height: 30px;\n  height: 30px;")]),
    M("kid-picture-pushed-down", ["home-find"], "the picture has no grid cell of its own, so a placed Find button pushes it into the next row (Kid Mode)",
      [(CSS, ".stage > .room {\n  grid-area: 1 / 1;\n}", ".stage > .room {\n  min-width: 0;\n}")]),
    M("stage-cell-not-picture-sized", ["home-find"], "the stage's one cell is as tall as the stage, so the Find button lands under the picture on a tall screen (Kid Mode)",
      [(CSS, "place-content: center; /* the one cell is as big as the picture and in the middle, so the Find button (below) lands on the picture's corner and not the stage's, which can be taller */", "/* removed */")]),
    # the walk to bed, and the words
    M("words-keep-the-first-room", ["home-asleep"], "the words for a screen reader are not made again when the creature walks into another room",
      [(STAGE, "setRoomState(room);", "/* no render */")]),
    M("never-lies-down", ["home-asleep"], "a sleeping creature walks to the front of the bed and stays standing there",
      [(IDLE, "    view.y = at.y;\n    setPose(view, \"sleep\");\n  }\n}", "    view.y = at.y;\n    setPose(view, \"idle\");\n  }\n}")]),
    M("walk-to-bed-too-slow", ["home-asleep"], "a sleeping creature walks to bed at 2 pixels a second, not 20",
      [(IDLE, "followPath(view, 20 * dt)", "followPath(view, 2 * dt)")]),
    # the layout in the save (H2a): what is drawn and where the creature walks and lies follow `save.home`
    M("layout-not-drawn", ["home-layout"], "the picture is made from the starter layout whatever the save holds",
      [(ROOM, "  layout: layoutOf(save.home, roomsBuilt(save.owned)),\n", "  layout: STARTER,\n")]),
    M("solid-pieces-at-the-starter-place", ["home-layout"], "the sofa, bed and other solid pieces are drawn where the starter home has them",
      [(ROOM, "show: (p: Piece) => boolean): void {\n  for (const p of piecesOf(look.layout)) if (p.solid && show(p))", "show: (p: Piece) => boolean): void {\n  for (const p of piecesOf(STARTER)) if (p.solid && show(p))")]),
    M("flat-pieces-at-the-starter-place", ["home-layout"], "the rug and the Feeding Mat are drawn where the starter home has them",
      [(ROOM, "// The flat pieces: the rugs, and the Feeding Mat.\n  for (const p of piecesOf(look.layout)) if (!p.solid)", "// The flat pieces: the rugs, and the Feeding Mat.\n  for (const p of piecesOf(STARTER)) if (!p.solid)")]),
    M("bed-art-at-the-starter-place", ["home-layout"], "the bed's own picture is drawn at the starter bed's place",
      [(ROOM, "const { left: bed, y } = bedOf(at);", "const { left: bed, y } = bedOf(STARTER.bed as Placement);")]),
    M("layout-never-put-in-force", ["home-layout"], "the walk keeps the starter layout in force: the creature walks to the starter bed",
      [(STAGE, "if (layout !== layoutInForce() || rooms !== roomsInForce()) {", "if (false) {")]),
    M("sleeper-walks-to-the-starter-bed", ["home-layout"], "the tile a sleeper walks to is the starter bed's front",
      [(HOME, "nearestFree(bedNow().front.col, bedNow().front.row,", "nearestFree(bedOf(STARTER.bed as Placement).front.col, bedOf(STARTER.bed as Placement).front.row,")]),
    M("sleeper-lies-at-the-starter-bed", ["home-layout"], "a sleeper that has walked to the new bed is drawn lying where the starter bed is",
      [(HOME, "({ x: bedNow().left + BED_WIDTH / 2 - size / 2, y: bedNow().y + 16 - size });", "({ x: bedOf(STARTER.bed as Placement).left + BED_WIDTH / 2 - size / 2, y: bedOf(STARTER.bed as Placement).y + 16 - size });")]),
    M("sleeper-stands-in-front-of-the-moved-bed", ["home-layout"], "a sleeping creature walks to the front of the moved bed and stays standing there",
      [(IDLE, "    view.y = at.y;\n    setPose(view, \"sleep\");\n  }\n}", "    view.y = at.y;\n    setPose(view, \"idle\");\n  }\n}")]),
    M("sleeper-lies-beside-the-moved-bed", ["home-layout"], "a sleeper that has walked to the moved bed is drawn lying 60 pixels to its left, still in the picture",
      [(HOME, "({ x: bedNow().left + BED_WIDTH / 2 - size / 2, y:", "({ x: bedNow().left + BED_WIDTH / 2 - size / 2 - 60, y:")]),
    M("saved-layout-dropped-on-load", ["home-layout"], "a save's home is thrown away when the game loads it",
      [(STATE, "  if (home) value.home = ownedWalls(home, value.owned);\n  else delete value.home;", "  delete value.home;")]),
    # what is drawn
    M("void-colour-changed", ["home-open"], "outside the home the picture is black, not the void colour",
      [(STAGE, 'c.fillStyle = "#120c20";', 'c.fillStyle = "#000000";')]),
]


class Infra(Exception):
    """A build, serve or fetch failed for one mutant (ERROR), or for the clean build (stop)."""


class Stop(Exception):
    """The run cannot go on: exit 2."""


ACTIVE = []  # servers started and not yet stopped; stopped in main's finally


def _on_term(signum, frame):
    raise KeyboardInterrupt


def stop_group(proc, grace=5):
    """Stop a process and anything in its process group (it was started with start_new_session)."""
    def send(sig):
        try:
            os.killpg(proc.pid, sig)
        except ProcessLookupError:
            pass
    send(signal.SIGTERM)
    try:
        proc.wait(timeout=grace)
    except subprocess.TimeoutExpired:
        send(signal.SIGKILL)
        proc.wait()
    send(signal.SIGKILL)  # children the leader left behind (no-op when none are left)


def run_group(cmd, cwd, log_path, timeout):
    """Run cmd in its own process group. Returns the exit code, or the string 'timeout' (the group is stopped)."""
    with open(log_path, "w", encoding="utf-8") as out:
        proc = subprocess.Popen(cmd, cwd=cwd, stdout=out, stderr=subprocess.STDOUT, start_new_session=True)
    try:
        return proc.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        stop_group(proc)
        return "timeout"
    except KeyboardInterrupt:
        stop_group(proc)
        raise


def read_bytes(p):
    with open(p, "rb") as f:
        return f.read()


def write_bytes(p, b):
    with open(p, "wb") as f:
        f.write(b)


def read_text(p):
    with open(p, encoding="utf-8", newline="") as f:
        return f.read()


def write_text(p, s):
    with open(p, "w", encoding="utf-8", newline="") as f:
        f.write(s)


def sha256_bytes(b):
    return hashlib.sha256(b).hexdigest()


def dist_manifest(dist):
    rows = []
    for root, _dirs, files in os.walk(dist):
        for name in files:
            p = os.path.join(root, name)
            rows.append((os.path.relpath(p, dist), sha256_bytes(read_bytes(p))))
    return sorted(rows)


def ensure_copy():
    """Make the copy the first time: the repo without node_modules, dist and .git, and node_modules symlinked to the real one."""
    if os.path.isdir(COPY):
        return
    print(f"creating copy {COPY}", flush=True)
    shutil.copytree(REAL, COPY, ignore=shutil.ignore_patterns("node_modules", "dist", ".git"))
    os.symlink(os.path.join(REAL, "node_modules"), os.path.join(COPY, "node_modules"))


# What the build reads. The copy is made once, so each of these must still equal the real one before and after a run.
BUILD_INPUTS = ["src", "public", "index.html", "vite.config.ts", "pwa-manifest.ts", "package.json"]


def copy_matches_real():
    """(True, '') when every build input of the copy equals the real one (diff -r prints nothing); else (False, the diff)."""
    ok, text = True, ""
    for name in BUILD_INPUTS:
        r = subprocess.run(["diff", "-r", os.path.join(REAL, name), os.path.join(COPY, name)], capture_output=True, text=True)
        if r.returncode != 0 or r.stdout != "":
            ok = False
            text += r.stdout + r.stderr
    return ok, text


def build(label):
    log_path = os.path.join(LOGS, f"build-{label}.log")
    rc = run_group(["npx", "vite", "build"], COPY, log_path, BUILD_TIMEOUT)
    if rc != 0:
        raise Infra(f"vite build ({label}) exit {rc}, log {log_path}")
    dist = os.path.join(COPY, "dist")
    if not os.path.isfile(os.path.join(dist, "index.html")):
        raise Infra(f"vite build ({label}) wrote no dist/index.html")
    with open(log_path, encoding="utf-8", errors="replace") as f:
        warn_lines = sum(1 for line in f if "warn" in line.lower())
    print(f"build {label}: ok ({warn_lines} output lines mention warn)", flush=True)
    return dist_manifest(dist)


def http_get(url):
    try:
        with urllib.request.urlopen(url, timeout=10) as r:
            return r.read()
    except OSError as e:
        raise Infra(f"GET {url}: {e}")


class Server:
    """vite preview of the copy's dist on PORT, in its own process group."""

    def __init__(self, label):
        self.label = label
        self.base = f"http://127.0.0.1:{PORT}"
        self.proc = None

    def start(self):
        try:
            socket.create_connection(("127.0.0.1", PORT), timeout=1).close()  # any listener counts, whatever it answers to "/"
        except OSError:
            pass  # nothing listens on the port: good
        else:
            # a server already on the port (left by an earlier run killed with SIGKILL): it would answer for the new one and never be stopped
            raise Stop(f"something already answers on {self.base}: stop it first (find it with `ss -ltnp | grep {PORT}`)")
        log_path = os.path.join(LOGS, f"preview-{self.label}.log")
        out = open(log_path, "w", encoding="utf-8")
        try:
            self.proc = subprocess.Popen(
                ["npx", "vite", "preview", "--outDir", "dist", "--host", "127.0.0.1",
                 "--port", str(PORT), "--strictPort"],
                cwd=COPY, stdout=out, stderr=subprocess.STDOUT, start_new_session=True)
        finally:
            out.close()  # the child keeps its own copy of the descriptor
        ACTIVE.append(self)
        deadline = time.time() + 60
        while time.time() < deadline:
            if self.proc.poll() is not None:
                raise Infra(f"vite preview exited early, log {log_path}")
            try:
                with urllib.request.urlopen(self.base + "/", timeout=2) as r:
                    if r.status == 200:
                        if self.proc.poll() is not None:  # our own process died while something else answered
                            raise Infra(f"vite preview exited while the port answered, log {log_path}")
                        return
            except OSError:
                pass
            time.sleep(0.5)
        raise Infra(f"vite preview not answering after 60 s, log {log_path}")

    def stop(self):
        if self.proc is not None:
            stop_group(self.proc)
            self.proc = None
        if self in ACTIVE:
            ACTIVE.remove(self)


def verify_serving(base, dist):
    """The server must serve the build in dist: the index and every js/css it names must match dist byte for byte."""
    index = http_get(base + "/")
    if index != read_bytes(os.path.join(dist, "index.html")):
        raise Infra("served / differs from dist/index.html (the server is not serving this build)")
    refs = re.findall(r'(?:src|href)="(/[^"]+\.(?:js|css))"', index.decode("utf-8", "replace"))
    if not refs:
        raise Infra("index.html names no js or css asset")
    for ref in refs:
        local = os.path.join(dist, ref.lstrip("/"))
        if not os.path.isfile(local):
            raise Infra(f"{ref} is named by index.html but is not in dist")
        if http_get(base + ref) != read_bytes(local):
            raise Infra(f"served {ref} differs from dist (the server is not serving this build)")
    return len(refs)


def run_checker(base, ids, modes, timeout, log_path, size=SIZE):
    cmd = ["node", CHECKER, "--base", base, "--only", ",".join(ids), "--sizes", size]
    if modes:
        cmd += ["--modes", modes]
    rc = run_group(cmd, HERE, log_path, timeout)
    with open(log_path, encoding="utf-8", errors="replace") as f:
        return rc, f.read()


def verdict(rc, text, expect):
    if rc == "timeout":
        return "ERROR", "checker timed out"
    if rc == 0:
        return "SURVIVED", "checker exit 0"
    fails = re.findall(r"^FAIL (\S+)", text, re.M)
    if rc == 1:
        named = "FAIL " + ",".join(sorted(set(fails)))
        if any(f in expect for f in fails):
            return "CAUGHT", named
        if fails:
            return "CAUGHT-BY-OTHER", named
        return "ERROR", "checker exit 1 with no FAIL line"
    return "ERROR", f"checker exit {rc}"


def target_rows():
    """For each mutant: (mutant, error or None, occurrence counts of each old in the copy's file)."""
    rows = []
    for m in MUTANTS:
        err, counts = None, []
        for f, old, _new in m["edits"]:
            n = read_text(os.path.join(COPY, f)).count(old)
            counts.append(n)
            if n != 1 and err is None:
                err = f"{f}: old text occurs {n} times (need exactly 1)"
        rows.append((m, err, counts))
    return rows


def apply_edits(m):
    for f, old, new in m["edits"]:
        p = os.path.join(COPY, f)
        text = read_text(p)
        n = text.count(old)
        if n != 1:
            raise Infra(f"{m['id']}: old text occurs {n} times in {f} at apply time")
        write_text(p, text.replace(old, new, 1))


def run_mutant(m):
    files = sorted({f for f, _o, _n in m["edits"]})
    originals = {f: read_bytes(os.path.join(COPY, f)) for f in files}
    server = None
    try:
        apply_edits(m)
        dist = os.path.join(COPY, "dist")
        build(m["id"])
        server = Server(m["id"])
        server.start()
        verify_serving(server.base, dist)
        modes = "kid" if m["kid_only"] else None
        log_path = os.path.join(LOGS, f"check-{m['id']}.log")
        rc, text = run_checker(server.base, m["expect"], modes, MUTANT_TIMEOUT, log_path, m.get("size", SIZE))
        return verdict(rc, text, m["expect"])
    except Infra as e:
        return "ERROR", str(e)
    finally:
        if server is not None:
            server.stop()
        for f, b in originals.items():
            write_bytes(os.path.join(COPY, f), b)


def print_targets(rows):
    print(f"{'id':<28} {'file':<22} {'expect':<16} {'modes':<6} {'old count':<10} status", flush=True)
    for m, err, counts in rows:
        files = ",".join(sorted({f.split('/')[-1] for f, _o, _n in m["edits"]}))
        status = "OK" if err is None else f"ERROR {err}"
        print(f"{m['id']:<28} {files:<22} {','.join(m['expect']):<16} {'kid' if m['kid_only'] else 'both':<6} "
              f"{','.join(str(c) for c in counts):<10} {status}", flush=True)


def coverage_problems():
    """Every check id the checker has must be named by at least one mutant, and ALL_IDS here must be the checker's own list."""
    with open(CHECKER, encoding="utf-8") as f:
        text = f.read()
    block = re.search(r"const CHECK_MODES = \{(.*?)\n\};", text, re.S)
    theirs = re.findall(r'^  "([a-z-]+)":', block.group(1), re.M) if block else []
    problems = []
    if theirs != ALL_IDS:
        problems.append(f"ALL_IDS differs from the checker's list: {sorted(set(theirs) ^ set(ALL_IDS))}")
    named = {i for m in MUTANTS for i in m["expect"]}
    problems += [f"no mutant must fail {i}" for i in ALL_IDS if i not in named]
    problems += [f"mutant {m['id']} expects {i}, which is not a check id" for m in MUTANTS for i in m["expect"] if i not in ALL_IDS]
    return problems


def run(args):
    gaps = coverage_problems()
    if gaps:
        raise Stop("coverage: " + "; ".join(gaps))
    if not args.check_targets:
        gen = subprocess.run([os.path.join(HERE, "gen-saves.sh")], capture_output=True, text=True)
        if gen.returncode != 0:
            raise Stop("gen-saves.sh failed:\n" + gen.stdout[-800:] + gen.stderr[-800:])
    ensure_copy()
    same, diff_text = copy_matches_real()
    if not same:
        raise Stop("the copy differs from the repo before the run (delete $VERIFY_OUT/home-ui-copy to start again):\n" + diff_text)
    rows = target_rows()
    if args.only is not None:  # (an empty value is an unknown id, not "all")
        wanted = args.only.split(",")
        unknown = [w for w in wanted if w not in {m["id"] for m, _e, _c in rows}]
        if unknown:
            raise Stop(f"--only names no mutant: {', '.join(unknown)}")
        rows = [r for r in rows if r[0]["id"] in wanted]
    if args.check_targets:
        print_targets(rows)
        bad = [m["id"] for m, err, _c in rows if err is not None]
        print(f"targets: {len(rows) - len(bad)} of {len(rows)} OK", flush=True)
        return 0 if not bad else 1

    dist = os.path.join(COPY, "dist")
    base_log = os.path.join(LOGS, "baseline.log")
    try:
        m0 = build("clean-1")
        base = Server("baseline")
        base.start()
        verify_serving(base.base, dist)
        rc, text = run_checker(base.base, ALL_IDS, None, BASELINE_TIMEOUT, base_log)
        # A mutant that names its own window (size) is only caught by its edit if the clean build passes the checks it must break in that window too.
        extra_rcs = []
        for other in sorted({m["size"] for m in MUTANTS if m.get("size", SIZE) != SIZE}) if rc == 0 else []:  # (a failed first baseline stops the run below)
            log = os.path.join(LOGS, "baseline-" + other.replace("@", "-") + ".log")
            wanted = sorted({i for m in MUTANTS if m.get("size", SIZE) == other for i in m["expect"]})  # (the ids those mutants must break: the others were built for portrait windows)
            extra_rcs.append((other, log, run_checker(base.base, wanted, None, BASELINE_TIMEOUT, log, other)[0]))
        base.stop()
    except Infra as e:
        raise Stop(f"clean build: {e}")
    last = text.strip().splitlines()[-1:] if text.strip() else ["(no output)"]
    print(f"baseline checker on the clean build: exit {rc}; last line: {last[0]}", flush=True)
    if rc != 0:
        raise Stop(f"the clean build fails its own checks: checker exit {rc} (log {base_log})")
    for other, log, other_rc in extra_rcs:
        print(f"baseline checker on the clean build at {other}: exit {other_rc}", flush=True)
        if other_rc != 0:
            raise Stop(f"the clean build fails its own checks at {other}: checker exit {other_rc} (log {log})")

    results = []
    for m, err, _c in rows:
        if err is not None:
            results.append((m, "ERROR", err))
            print(f"{m['id']}: ERROR ({err})", flush=True)
            continue
        v, detail = run_mutant(m)
        results.append((m, v, detail))
        print(f"{m['id']}: {v} ({detail})", flush=True)

    final_ok = True
    same, diff_text = copy_matches_real()
    if not same:
        final_ok = False
        print("final: the copy differs from the repo after the run:\n" + diff_text, flush=True)
    try:
        m1 = build("clean-2")
    except Infra as e:
        raise Stop(f"final clean rebuild: {e}")
    if m1 != m0:
        final_ok = False
        names = sorted(set(m0) ^ set(m1))
        print(f"final: dist differs from the first clean build; files that differ: {names}", flush=True)
    else:
        print(f"final: dist equals the first clean build ({len(m1)} files, names and hashes)", flush=True)

    print()
    print(f"{'id':<28} {'file':<22} {'expect':<16} {'verdict':<17} detail")
    for m, v, detail in results:
        files = ",".join(sorted({f.split('/')[-1] for f, _o, _n in m["edits"]}))
        print(f"{m['id']:<28} {files:<22} {','.join(m['expect']):<16} {v:<17} {detail}")
    counts = Counter(v for _m, v, _d in results)
    print(f"SUMMARY caught={counts['CAUGHT']} other={counts['CAUGHT-BY-OTHER']} "
          f"survived={counts['SURVIVED']} error={counts['ERROR']} of {len(results)}", flush=True)
    ok = counts["CAUGHT"] == len(results) and final_ok
    print("RUN OK" if ok else "RUN NOT OK", flush=True)
    return 0 if ok else 1


def main():
    ap = argparse.ArgumentParser(description="Mutation runner for the home screen checks (H1).")
    ap.add_argument("--check-targets", action="store_true",
                    help="only verify that each old text occurs exactly once in the copy, and print the table")
    ap.add_argument("--only", help="run only these mutants (comma separated ids), after the same clean baselines; the summary counts only them")
    args = ap.parse_args()
    assert PORT in range(4180, 4190), "this runner may use only ports 4180-4189"
    os.makedirs(LOGS, exist_ok=True)
    signal.signal(signal.SIGTERM, _on_term)
    try:
        return run(args)
    except KeyboardInterrupt:
        print("interrupted: servers stopped; any file under edit was restored", flush=True)
        return 130
    except Stop as e:
        print(f"STOP: {e}", flush=True)
        return 2
    finally:
        for s in list(ACTIVE):
            s.stop()


if __name__ == "__main__":
    sys.exit(main())
