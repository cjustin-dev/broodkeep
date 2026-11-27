#!/usr/bin/env python3
"""Mutation runner for the SCREEN side of Stack & Balance (Broodkeep, A4.2): the third picker button and the start card, the moving block and its clock, the drop and the words, the stack's blocks, the
pause, the touch, the names and the layout.

Works only on a copy of the repo at $VERIFY_OUT/stack-ui-copy (never the real repo).
Each mutant is one or more exact text replaces in the copy. The copy is rebuilt, served by
`vite preview` on port 4185 (the only port this runner uses; 4180-4189 are reserved for the mutation runners), and
the browser checker stack-browser.mjs runs with only the check ids that the mutant must break, at the window size the mutant names.

Usage:
  python3 mutate-stack-ui.py    --check-targets   verify each `old` occurs exactly once in the copy; print the table
  python3 mutate-stack-ui.py                      clean baseline, every mutant, final clean rebuild
  python3 mutate-stack-ui.py    --equivalents     clean baseline, then the EQUIVALENT mutants: every check must still pass (SURVIVED) for the run to be OK

Exit codes: 0 every mutant CAUGHT (with --equivalents: every one SURVIVED) and the final checks pass; 1 some mutant not as expected, or a final check
failed; 2 the run stopped (copy out of sync, clean build failed its own checks, build or serve broke).

Edge cases this runner handles (each is a path in the code, not only a happy path):
  - an `old` text that occurs 0 or 2+ times: that mutant is ERROR and is not applied
  - a build that breaks for one mutant: ERROR for that mutant, the file is restored
  - a checker that hangs: killed by process group after 4 minutes, ERROR
  - a served page that is not the build just made: the run refuses to count that mutant (ERROR)
  - a server already answering on the port before ours starts: the run stops (exit 2) instead of testing the wrong server
  - the clean-build baseline runs every check id at ONE size (360x640@2, both modes); a mutant runs only the ids it must break, at its own size: the
    all-sizes proof for the clean build is a separate full run of stack-browser.mjs (run-stack.sh). A mutant that names another size (320x568@1) first gets a
    clean run of its ids at that size; a failure there stops the run (exit 2) before any mutant is counted
  - Ctrl-C or SIGTERM mid-mutant: the file under edit is restored in a `finally`, servers are stopped
  - a checker exit 1 whose FAIL lines name only other ids: CAUGHT-BY-OTHER, not CAUGHT
  - a checker exit 1 with no FAIL line at all: ERROR (a crash that looks like a failure)
  - a checker exit 0 on a mutant: SURVIVED
  - the final clean rebuild must match the first clean build (file names and hashes) and the copy's
    src/ must match the real src/ (diff -r empty), else the run is not OK
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
COPY = os.path.join(VERIFY_OUT, "stack-ui-copy")
CHECKER = os.path.join(HERE, "stack-browser.mjs")
LOGS = os.path.join(VERIFY_OUT, "mutate-stack-ui-logs")
PORT = 4185  # ports 4180-4189 are the mutation runners'; this one uses 4185 only
SIZE = "360x640@2"
BUILD_TIMEOUT = 600
BASELINE_TIMEOUT = 1500
MUTANT_TIMEOUT = 240

ALL_IDS = ["sb-kid", "sb-pick", "sb-clock", "sb-drop", "sb-hidden", "sb-touch", "sb-run", "sb-a11y", "sb-fit"]

TRAIN = "src/ui/TrainGame.tsx"
ARENA = "src/ui/ArenaBar.tsx"
CSS = "src/ui/app.css"

# Text only StackRun has. Run (Bug Catch) and RhythmRun share much of their code with it, so a mutant of StackRun anchors on a neighbour that the others do not have.
STACK_PAUSE = '          <span>\n            Height <b ref={heightEl}>{heightOf(run)}</b>\n          </span>\n        </p>\n        <div class="train-buttons">\n          <button\n            class="btn small"\n            onClick={() => {\n              pause(run);\n              bump();'
STACK_RESUME = '            if (e.detail === 0) dropped();\n          }}\n        />\n        {run.paused && (\n          <button\n            class="train-paused"\n            onClick={() => {\n              resume(run);\n              bump();'
STACK_VISIBLE = '      stepStack(run, dt);\n      place();\n      if (run.over) {\n        game.finishTraining();\n        return;\n      }\n      raf = requestAnimationFrame(frame);\n    };\n    raf = requestAnimationFrame(frame);\n    return () => cancelAnimationFrame(raf);\n  }, [run]);\n\n  useEffect(() => {\n    const onVisibility = (): void => {\n      if (document.visibilityState === "hidden" && !run.over) {'
STACK_FINISH = "      stepStack(run, dt);\n      place();\n      if (run.over) {\n        game.finishTraining();\n        return;"
STACK_WRITES = "    if (timeEl.current) timeEl.current.textContent = String(secondsLeft(run));\n    if (scoreEl.current) scoreEl.current.textContent = String(scoreOf(run));\n    if (heightEl.current) heightEl.current.textContent = String(heightOf(run));\n"

# edits: (file, old, new), applied in order. `old` must occur exactly once in that file of the copy.
# expect: check ids, one of which must FAIL for the mutant to count as caught. kid_only: the checker runs --modes kid. size: the window the checker runs at.
def m(id, expect, what, edits, size="360x640@2", kid_only=False):
    return dict(id=id, expect=expect, kid_only=kid_only, size=size, what=what, edits=edits)


MUTANTS = [
    # the picker and the start card (the first fifteen are the same mutants of the shared card as Rhythm Grove's runner has, with this checker's ids)
    m("picker-has-no-group-role", ["sb-pick", "sb-a11y"], "the picker is not a group", [(TRAIN, 'role="group" aria-label="Training game"', 'aria-label="Training game"')]),
    m("picker-has-no-name", ["sb-pick", "sb-a11y"], "the picker's group has no name", [(TRAIN, 'role="group" aria-label="Training game"', 'role="group"')]),
    m("picker-has-no-pressed-state", ["sb-pick"], "the picker's buttons do not say which is pressed", [(TRAIN, "aria-pressed={picked === id} ", "")]),
    m("picker-click-does-nothing", ["sb-pick"], "a click on a picker button picks nothing", [(TRAIN, "onClick={() => game.pickTrainGame(id)}", "onClick={() => {}}")]),
    m("go-does-nothing", ["sb-pick"], "the start card's Go button does nothing", [(TRAIN, "ref={goRef} onClick={() => game.beginTraining()}", "ref={goRef} onClick={() => {}}")]),
    m("done-does-nothing", ["sb-run"], "the result card's Done button does nothing", [(TRAIN, "ref={doneRef} onClick={() => game.closeTraining()}", "ref={doneRef} onClick={() => {}}")]),
    m("go-not-focused", ["sb-pick"], "the start card's Go button is not focused", [(TRAIN, "  useEffect(() => goRef.current?.focus(), []);", "  useEffect(() => {}, []);")]),
    m("done-not-focused", ["sb-run"], "the result card's Done button is not focused", [(TRAIN, "  useEffect(() => doneRef.current?.focus(), []);", "  useEffect(() => {}, []);")]),
    m("dialog-says-bug-catch", ["sb-pick", "sb-a11y", "sb-run"], "the dialog is named Bug Catch whatever the game", [(TRAIN, "aria-label={trainGames[t.game].name}", 'aria-label="Bug Catch"')]),
    m("result-heading-says-bug-catch", ["sb-run"], "the result card's heading is Bug Catch whatever the game", [(TRAIN, 'trainGames[game.training?.game ?? "bug"].name', '"Bug Catch"')]),
    m("reward-counts-speed", ["sb-pick"], "the start card's line counts Speed sessions for Stack & Balance", [(TRAIN, "trainedToday(c, stat, localDay(game.now())).count", 'trainedToday(c, "spd", localDay(game.now())).count')]),
    m("page-behind-scrolls", ["sb-touch"], "the page behind an open panel is not locked", [(CSS, "body:has(.panel) {\n  overflow: hidden;\n}", "body:has(.panel) {\n  overflow: visible;\n}")]),
    m("picker-buttons-are-short", ["sb-fit"], "the picker's buttons are 30 px tall", [(CSS, ".train-picker .btn {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n}", ".train-picker .btn {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  height: 30px;\n  min-height: 0;\n}")]),
    m("picker-wider-than-the-window", ["sb-fit"], "each picker button is 400 px wide, wider than the 320 px window (200 px each wrapped and fitted: the picker wraps)", [(CSS, ".train-picker .btn {\n  display: inline-flex;", ".train-picker .btn {\n  width: 400px;\n  flex: none;\n  display: inline-flex;")], size="320x568@1"),
    m("kid-mode-gets-the-train-button", ["sb-kid"], "Kid Mode shows Adult Mode's Fight and Train row", [(ARENA, '  if (adult) {\n    return (\n      <div class="actions">\n        {noteRow}\n        <div class="trainbtns"', '  if (true) {\n    return (\n      <div class="actions">\n        {noteRow}\n        <div class="trainbtns"')], kid_only=True),
    m("card-always-shows-bug-catch", ["sb-pick"], "the start card reads Bug Catch whatever the pick", [(TRAIN, 'const picked = game.training?.game ?? "bug";', 'const picked = "bug" as TrainGameId;')]),
    m("blurb-window-is-kids", ["sb-pick"], "the start card gives the kid's Perfect window for an adult", [(TRAIN, "Perfect is within ${perfectWindowMs(stage)} ms", 'Perfect is within ${perfectWindowMs("kid")} ms')]),
    m("blurb-forgets-the-narrow-block", ["sb-pick"], "the blurb does not say the window is less on a narrow block", [(TRAIN, " (less on a narrow block)", "")]),
    m("blurb-stage-is-kids", ["sb-pick"], 'the start card asks for the blurb of a kid', [(TRAIN, '{blurbOf(picked, game.training?.stage ?? "adult")}', '{blurbOf(picked, "kid")}')]),
    m("stat-word-is-speed", ["sb-pick"], "the start card says it trains Speed", [(TRAIN, "It trains {statName}.", "It trains Speed.")]),
    m("quit-does-nothing", ["sb-pick"], "Quit during a run does nothing", [(TRAIN, 'onClick={() => game.closeTraining()}>\n            Quit\n          </button>\n        </div>\n      </div>\n      <div class="train-field stack-field">', 'onClick={() => {}}>\n            Quit\n          </button>\n        </div>\n      </div>\n      <div class="train-field stack-field">')]),
    # the clock and the moving block
    m("block-clock-not-fed", ["sb-clock"], "the run's clock is never fed the frame's time, so the block never moves", [(TRAIN, "      stepStack(run, dt);\n", "")]),
    m("mover-left-edge-is-the-centre", ["sb-clock"], "the moving block's left edge is put at its centre", [(TRAIN, "mover.style.left = pct(blockX(run) - run.w / 2);", "mover.style.left = pct(blockX(run));")]),
    m("mover-is-a-third-as-wide", ["sb-clock"], "the moving block is drawn 100 units wide, not 300", [(TRAIN, "mover.style.width = pct(run.w);", "mover.style.width = pct(100);")]),
    m("time-not-shown", ["sb-clock"], "the seconds left are written only when the component is drawn again, not by the per-frame write", [(TRAIN, STACK_WRITES, STACK_WRITES.replace("    if (timeEl.current) timeEl.current.textContent = String(secondsLeft(run));\n", "", 1))]),
    m("score-not-shown", ["sb-run"], "the score is written only when a drop draws the component again, not by the per-frame write", [(TRAIN, STACK_WRITES, STACK_WRITES.replace("    if (scoreEl.current) scoreEl.current.textContent = String(scoreOf(run));\n", "", 1))]),
    m("pause-button-does-not-pause", ["sb-clock"], "the Pause button redraws and does not pause", [(TRAIN, STACK_PAUSE, STACK_PAUSE.replace("              pause(run);\n", "", 1))]),
    m("paused-card-does-not-resume", ["sb-clock", "sb-hidden"], "a tap on the Paused card does not go on", [(TRAIN, STACK_RESUME, STACK_RESUME.replace("              resume(run);\n", "", 1))]),
    m("hidden-page-keeps-running", ["sb-hidden"], "a hidden page does not pause the run", [(TRAIN, STACK_VISIBLE, STACK_VISIBLE.replace('if (document.visibilityState === "hidden" && !run.over) {', "if (false && !run.over) {", 1))]),
    # the drop and the words
    m("mover-never-hidden", ["sb-drop"], "the moving block stays on the screen in the gap after a drop", [(TRAIN, 'run.elapsedMs >= run.readyAt && !run.over ? "visible" : "hidden"', '"visible"')]),
    m("mover-comes-late", ["sb-drop"], "the moving block comes back 400 ms after the gap is over", [(TRAIN, "run.elapsedMs >= run.readyAt && !run.over", "run.elapsedMs >= run.readyAt + 400 && !run.over")]),
    m("said-text-not-written", ["sb-drop"], "the line over the field never gets its words", [(TRAIN, "      saidEl.current.textContent = stackSaidLine(said);\n", "")]),
    m("said-judge-not-marked", ["sb-drop"], "the line over the field carries no data-judge", [(TRAIN, "      saidEl.current.textContent = stackSaidLine(said);\n      saidEl.current.dataset.judge = said.judge;\n", "      saidEl.current.textContent = stackSaidLine(said);\n")]),
    m("drop-does-not-redraw", ["sb-drop"], "a drop does not draw the stack's blocks again", [(TRAIN, "    if (dropStack(run)) bump();", "    dropStack(run);")]),
    m("top-block-drawn-last", ["sb-drop"], "the blocks are drawn from the bottom up, so the DOM lists the base first", [(TRAIN, "const drawn = run.blocks.slice(-ROOM).reverse();", "const drawn = run.blocks.slice(-ROOM);")]),
    m("block-left-edge-is-the-centre", ["sb-drop"], "a block's left edge is put at its centre", [(TRAIN, "left: pct(b.x - b.w / 2), width: pct(b.w)", "left: pct(b.x), width: pct(b.w)")]),
    m("base-not-marked", ["sb-clock"], "the base carries no data-base", [(TRAIN, 'data-base={index === 0 ? "yes" : undefined}', "data-base={undefined}")]),
    m("finish-never-called", ["sb-run"], "the end of the run never reaches the game (no result, no pay)", [(TRAIN, STACK_FINISH, STACK_FINISH.replace("        game.finishTraining();\n", "", 1))]),
    # the touch
    m("drop-on-release", ["sb-touch"], "a drop counts when the finger lifts, not when it presses", [(TRAIN, "onPointerDown={() => dropped()}", "onPointerUp={() => dropped()}")]),
    m("a-touch-never-drops", ["sb-touch", "sb-run"], "a finger's press counts for nothing (only a click with no detail does)", [(TRAIN, "onPointerDown={() => dropped()}", "onPointerDown={() => {}}")]),
    m("lift-drops-again", ["sb-touch"], "the click after a press counts as a second drop", [(TRAIN, "            if (e.detail === 0) dropped();\n          }}\n        />\n        {run.paused", "            dropped();\n          }}\n        />\n        {run.paused")]),
    # the names and the keyboard
    m("pad-has-no-name", ["sb-a11y"], "the pad has no accessible name", [(TRAIN, '          aria-label="Drop the block"\n', "")]),
    m("enter-does-not-drop", ["sb-a11y"], "Enter on the focused pad does nothing", [(TRAIN, "            if (e.detail === 0) dropped();\n          }}\n        />\n        {run.paused", "            if (false) dropped();\n          }}\n        />\n        {run.paused")]),
    m("said-is-a-live-region", ["sb-a11y"], "the line over the field is a live region", [(TRAIN, '<p class="stack-said" ref={saidEl} />', '<p class="stack-said" aria-live="polite" ref={saidEl} />')]),
    m("blocks-have-names", ["sb-a11y"], "the stack's blocks are not hidden from a screen reader", [(TRAIN, '              aria-hidden="true"\n              style={{ left: pct(b.x - b.w / 2)', '              style={{ left: pct(b.x - b.w / 2)')]),
    m("mover-has-a-name", ["sb-a11y"], "the moving block is not hidden from a screen reader", [(TRAIN, '<span class="stack-mover" ref={moverEl} aria-hidden="true" />', '<span class="stack-mover" ref={moverEl} />')]),
    # the stack
    m("all-blocks-drawn", ["sb-fit"], "every block of the stack is drawn, not the top 14", [(TRAIN, "const drawn = run.blocks.slice(-ROOM).reverse();", "const drawn = [...run.blocks].reverse();")]),
    m("room-for-twice-as-many", ["sb-fit"], "the field is said to have room for 28 blocks", [(TRAIN, "/ stackTuning.blockH); // how many blocks", "/ (stackTuning.blockH / 2)); // how many blocks")]),
    m("camera-never-scrolls", ["sb-fit"], "the top block keeps going up the field as the stack grows", [(TRAIN, "const top = Math.max(stackTuning.laneTop, trainTuning.field - stackTuning.blockH * run.blocks.length);", "const top = trainTuning.field - stackTuning.blockH * run.blocks.length;")]),
    m("blocks-are-twice-as-tall", ["sb-fit"], "a block is drawn 100 units tall", [(TRAIN, "height: pct(stackTuning.blockH) }}", "height: pct(stackTuning.blockH * 2) }}")]),
    m("stack-grows-upside-down", ["sb-fit"], "each block of the stack is drawn above the one before", [(TRAIN, "top: pct(top + i * stackTuning.blockH)", "top: pct(top - i * stackTuning.blockH)")]),
    # the layout
    m("mover-lane-is-low", ["sb-fit"], "the moving block's lane is 60 percent down, on the stack", [(CSS, ".stack-mover {\n  top: 23%;", ".stack-mover {\n  top: 60%;")]),
    m("pad-is-narrower-than-the-field", ["sb-fit"], "the pad covers only 60 percent of the field's width", [(CSS, ".stack-pad {\n  position: absolute;\n  inset: 0;", ".stack-pad {\n  position: absolute;\n  inset: 0 40% 0 0;")]),
    m("words-below-the-field", ["sb-fit"], "the words over the field hang below it", [(CSS, "  top: 6%;\n  margin: 0;\n  padding: 0 6px;", "  top: 110%;\n  margin: 0;\n  padding: 0 6px;")]),
    m("go-scrolls-away", ["sb-fit"], "the start card's Go button is not kept on the screen when the card is taller than the window (320 px phone)", [(CSS, "  position: sticky;\n  bottom: calc(12px + env(safe-area-inset-bottom));", "  position: static;\n  bottom: calc(12px + env(safe-area-inset-bottom));")], size="320x568@1"),
]

# Not mutated (each argued from the code; `--equivalents` applies each one and exits 0 only when every check still passes, which is the proof that the argument holds):
#  - the per-frame write of Height: Height changes only when a block is placed, which is a drop, and a drop draws the component again (`bump()`), which writes `{heightOf(run)}`.
#  - a drop that always draws the component again (`dropStack(run); bump();`): one more redraw changes nothing the screen shows.
#  - `overflow: hidden` on `.stack-field`: every drawn block lies inside the field by construction (at most 14 blocks, from the top block down), and the moving block stays between 0 and 1000 units.
#  - `touch-action: none` on `.stack-pad`: the pad's parent, `.train-field`, has it too, and a browser takes the most restrictive touch-action along the ancestors up to the scroller.
EQUIVALENT = [
    m("height-not-written-per-frame", ["sb-run"], "Height is written only when a drop draws the component again", [(TRAIN, STACK_WRITES, STACK_WRITES.replace("    if (heightEl.current) heightEl.current.textContent = String(heightOf(run));\n", "", 1))]),
    m("drop-always-redraws", ["sb-drop"], "a drop that placed nothing draws the component again too", [(TRAIN, "    if (dropStack(run)) bump();", "    dropStack(run);\n    bump();")]),
    m("stack-field-does-not-clip", ["sb-fit"], "the field does not clip what lies outside it", [(CSS, ".stack-field {\n  overflow: hidden;", ".stack-field {\n  overflow: visible;")]),
    m("stack-pad-touch-action-dropped", ["sb-touch"], "the pad has no touch-action of its own, the field's still holds", [(CSS, "  cursor: pointer;\n  touch-action: none;\n}\n\n/* A short, wide window (a phone on its side)", "  cursor: pointer;\n}\n\n/* A short, wide window (a phone on its side)")]),
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


def run_checker(base, ids, modes, timeout, log_path, size):
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
        rc, text = run_checker(server.base, m["expect"], modes, MUTANT_TIMEOUT, log_path, m["size"])
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
    theirs = re.findall(r'^  "([a-z0-9-]+)":', block.group(1), re.M) if block else []
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
    if args.equivalents:
        MUTANTS[:] = EQUIVALENT  # (the coverage check above ran on the real list)
    if not args.check_targets:
        gen = subprocess.run([os.path.join(HERE, "gen-saves.sh")], capture_output=True, text=True)
        if gen.returncode != 0:
            raise Stop("gen-saves.sh failed:\n" + gen.stdout[-800:] + gen.stderr[-800:])
    ensure_copy()
    same, diff_text = copy_matches_real()
    if not same:
        raise Stop("the copy differs from the repo before the run (delete $VERIFY_OUT/stack-ui-copy to start again):\n" + diff_text)
    rows = target_rows()
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
        rc, text = run_checker(base.base, ALL_IDS, None, BASELINE_TIMEOUT, base_log, SIZE)
        # a mutant that names its own window gets a clean run in that window first: a clean build that fails there would make every mutant of that window read as caught
        own = {}
        for mu in MUTANTS:
            if mu["size"] != SIZE:
                own.setdefault(mu["size"], set()).update(mu["expect"])
        own_runs = []
        for size, ids in sorted(own.items()):
            own_log = os.path.join(LOGS, f"baseline-{size}.log")
            own_runs.append((size, run_checker(base.base, sorted(ids), None, MUTANT_TIMEOUT, own_log, size)[0], own_log))
        base.stop()
    except Infra as e:
        raise Stop(f"clean build: {e}")
    last = text.strip().splitlines()[-1:] if text.strip() else ["(no output)"]
    print(f"baseline checker on the clean build: exit {rc}; last line: {last[0]}", flush=True)
    if rc != 0:
        raise Stop(f"the clean build fails its own checks: checker exit {rc} (log {base_log})")
    for size, own_rc, own_log in own_runs:
        print(f"clean build at {size} (the window some mutants name): exit {own_rc}", flush=True)
        if own_rc != 0:
            raise Stop(f"the clean build fails its checks at {size}: checker exit {own_rc} (log {own_log})")

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
    ok = (counts["SURVIVED"] if args.equivalents else counts["CAUGHT"]) == len(results) and final_ok
    print("RUN OK" if ok else "RUN NOT OK", flush=True)
    return 0 if ok else 1


def main():
    ap = argparse.ArgumentParser(description="Mutation runner for the Stack & Balance screen checks (A4.2).")
    ap.add_argument("--check-targets", action="store_true",
                    help="only verify that each old text occurs exactly once in the copy, and print the table")
    ap.add_argument("--equivalents", action="store_true", help="run the EQUIVALENT mutants instead: each must leave every check passing (SURVIVED)")
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
