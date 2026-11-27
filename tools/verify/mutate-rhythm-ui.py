#!/usr/bin/env python3
"""Mutation runner for the SCREEN side of Rhythm Grove (Broodkeep, A4.1): the picker on the start card, the track and its notes, the tap, the pause, the creature's hop, the words and the layout.

Works only on a copy of the repo at $VERIFY_OUT/rhythm-ui-copy (never the real repo).
Each mutant is one or more exact text replaces in the copy. The copy is rebuilt, served by
`vite preview` on port 4184 (the only port this runner uses; 4180-4189 are reserved for the mutation runners), and
the browser checker rhythm-browser.mjs runs with only the check ids that the mutant must break, at the window size the mutant names.

Usage:
  python3 mutate-rhythm-ui.py    --check-targets   verify each `old` occurs exactly once in the copy; print the table
  python3 mutate-rhythm-ui.py                      clean baseline, every mutant, final clean rebuild
  python3 mutate-rhythm-ui.py    --equivalents     clean baseline, then the EQUIVALENT mutants: every check must still pass (SURVIVED) for the run to be OK

Exit codes: 0 every mutant CAUGHT (with --equivalents: every one SURVIVED) and the final checks pass; 1 some mutant not as expected, or a final check
failed; 2 the run stopped (copy out of sync, clean build failed its own checks, build or serve broke).

Edge cases this runner handles (each is a path in the code, not only a happy path):
  - an `old` text that occurs 0 or 2+ times: that mutant is ERROR and is not applied
  - a build that breaks for one mutant: ERROR for that mutant, the file is restored
  - a checker that hangs: killed by process group after 4 minutes, ERROR
  - a served page that is not the build just made: the run refuses to count that mutant (ERROR)
  - a server already answering on the port before ours starts: the run stops (exit 2) instead of testing the wrong server
  - the clean-build baseline runs every check id at ONE size (360x640@2, both modes); a mutant runs only the ids it must break, at its own size: the
    all-sizes proof for the clean build is a separate full run of rhythm-browser.mjs (run-rhythm.sh)
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
COPY = os.path.join(VERIFY_OUT, "rhythm-ui-copy")
CHECKER = os.path.join(HERE, "rhythm-browser.mjs")
LOGS = os.path.join(VERIFY_OUT, "mutate-rhythm-ui-logs")
PORT = 4184  # ports 4180-4189 are the mutation runners'; this one uses 4184 only
SIZE = "360x640@2"
BUILD_TIMEOUT = 600
BASELINE_TIMEOUT = 1500
MUTANT_TIMEOUT = 240

ALL_IDS = ["rg-kid", "rg-pick", "rg-clock", "rg-beat", "rg-hop", "rg-hidden", "rg-touch", "rg-run", "rg-a11y", "rg-fit"]

TRAIN = "src/ui/TrainGame.tsx"
ARENA = "src/ui/ArenaBar.tsx"
CSS = "src/ui/app.css"
DATA = "src/data/rhythm.ts"

# Text only RhythmRun has. Run (Bug Catch) shares much of its code with it, so a mutant of RhythmRun anchors on a neighbour that Run does not have.
RHYTHM_PAUSE = "              pause(run);\n              bump();\n            }}\n          >\n            Pause\n          </button>\n          <button class=\"btn small\" onClick={() => game.closeTraining()}>\n            Quit\n          </button>\n        </div>\n      </div>\n      <div class=\"train-field rhythm-track\""
RHYTHM_RESUME = "            if (e.detail === 0) tapped();\n          }}\n        />\n        {run.paused && (\n          <button\n            class=\"train-paused\"\n            onClick={() => {\n              resume(run);\n              bump();"
RHYTHM_VISIBLE = "    const onVisibility = (): void => {\n      if (document.visibilityState === \"hidden\" && !run.over) {\n        pause(run);\n        bump();\n      }\n    };\n    document.addEventListener(\"visibilitychange\", onVisibility);\n    return () => document.removeEventListener(\"visibilitychange\", onVisibility);\n  }, [run]);\n\n  // A tap (the press, not the release"
RHYTHM_FINISH = "      if (stepRhythm(run, dt)) bump();\n      place();\n      if (run.over) {\n        game.finishTraining();\n        return;"
RHYTHM_WRITES = "    if (timeEl.current) timeEl.current.textContent = String(secondsLeft(run));\n    if (scoreEl.current) scoreEl.current.textContent = String(run.score);\n    if (streakEl.current) streakEl.current.textContent = String(run.streak);\n    const said = run.said;"

# edits: (file, old, new), applied in order. `old` must occur exactly once in that file of the copy.
# expect: check ids, one of which must FAIL for the mutant to count as caught. kid_only: the checker runs --modes kid. size: the window the checker runs at.
def m(id, expect, what, edits, size="360x640@2", kid_only=False):
    return dict(id=id, expect=expect, kid_only=kid_only, size=size, what=what, edits=edits)


MUTANTS = [
    # the picker and the start card
    m("picker-has-no-group-role", ["rg-pick", "rg-a11y"], "the picker is not a group", [(TRAIN, 'role="group" aria-label="Training game"', 'aria-label="Training game"')]),
    m("picker-has-no-name", ["rg-pick", "rg-a11y"], "the picker's group has no name", [(TRAIN, 'role="group" aria-label="Training game"', 'role="group"')]),
    m("picker-has-no-pressed-state", ["rg-pick"], "the picker's buttons do not say which is pressed", [(TRAIN, "aria-pressed={picked === id} ", "")]),
    m("picker-click-does-nothing", ["rg-pick"], "a click on a picker button picks nothing", [(TRAIN, "onClick={() => game.pickTrainGame(id)}", "onClick={() => {}}")]),
    m("card-always-shows-bug-catch", ["rg-pick"], "the start card reads Bug Catch whatever the pick", [(TRAIN, 'const picked = game.training?.game ?? "bug";', 'const picked = "bug" as "bug" | "rhythm";')]),
    m("reward-counts-speed", ["rg-pick"], "the start card's line counts Speed sessions for Rhythm Grove", [(TRAIN, "trainedToday(c, stat, localDay(game.now())).count", 'trainedToday(c, "spd", localDay(game.now())).count')]),
    m("blurb-is-bug-catchs", ["rg-pick"], "the start card gives Bug Catch's blurb for Rhythm Grove", [(TRAIN, "{blurbs[picked]} It trains {statName}.", "{blurbs.bug} It trains {statName}.")]),
    m("stat-word-is-speed", ["rg-pick"], "the start card says it trains Speed", [(TRAIN, "{blurbs[picked]} It trains {statName}.", "{blurbs[picked]} It trains Speed.")]),
    m("dialog-says-bug-catch", ["rg-pick", "rg-a11y", "rg-run"], "the dialog is named Bug Catch whatever the game", [(TRAIN, "aria-label={trainGames[t.game].name}", 'aria-label="Bug Catch"')]),
    m("result-heading-says-bug-catch", ["rg-run"], "the result card's heading is Bug Catch whatever the game", [(TRAIN, 'trainGames[game.training?.game ?? "bug"].name', '"Bug Catch"')]),
    m("go-does-nothing", ["rg-pick"], "the start card's Go button does nothing", [(TRAIN, "ref={goRef} onClick={() => game.beginTraining()}", "ref={goRef} onClick={() => {}}")]),
    m("quit-does-nothing", ["rg-pick"], "Quit during a run does nothing", [(TRAIN, 'onClick={() => game.closeTraining()}>\n            Quit\n          </button>\n        </div>\n      </div>\n      <div class="train-field rhythm-track"', 'onClick={() => {}}>\n            Quit\n          </button>\n        </div>\n      </div>\n      <div class="train-field rhythm-track"')]),
    m("done-does-nothing", ["rg-run"], "the result card's Done button does nothing", [(TRAIN, "ref={doneRef} onClick={() => game.closeTraining()}", "ref={doneRef} onClick={() => {}}")]),
    m("go-not-focused", ["rg-pick"], "the start card's Go button is not focused", [(TRAIN, "  useEffect(() => goRef.current?.focus(), []);", "  useEffect(() => {}, []);")]),
    m("done-not-focused", ["rg-run"], "the result card's Done button is not focused", [(TRAIN, "  useEffect(() => doneRef.current?.focus(), []);", "  useEffect(() => {}, []);")]),
    # the clock and the notes
    m("notes-come-on-late", ["rg-clock"], "a note is on the track 1200 ms before its time, not 1600", [(DATA, "approachMs: 1600,", "approachMs: 1200,")]),
    m("track-does-not-clip", ["rg-clock"], "a note that comes on at the top edge is not clipped by the track", [(CSS, ".rhythm-track {\n  overflow: hidden;\n}", ".rhythm-track {\n  overflow: visible;\n}")]),
    m("line-is-half-way", ["rg-clock"], "the line the notes fall to is half way down, not 0.74", [(TRAIN, "const LINE = 0.74;", "const LINE = 0.5;")]),
    m("pause-button-does-not-pause", ["rg-clock"], "the Pause button redraws and does not pause", [(TRAIN, RHYTHM_PAUSE, RHYTHM_PAUSE.replace("              pause(run);\n", "", 1))]),
    m("paused-card-does-not-resume", ["rg-clock", "rg-hidden"], "a tap on the Paused card does not go on", [(TRAIN, RHYTHM_RESUME, RHYTHM_RESUME.replace("              resume(run);\n", "", 1))]),
    m("hidden-page-keeps-running", ["rg-hidden"], "a hidden page does not pause the run", [(TRAIN, RHYTHM_VISIBLE, RHYTHM_VISIBLE.replace('if (document.visibilityState === "hidden" && !run.over) {', "if (false && !run.over) {", 1))]),
    # what a tap says
    m("said-text-not-written", ["rg-beat"], "the line over the track never gets its words", [(TRAIN, "      saidEl.current.textContent = saidLine(said);\n", "")]),
    m("said-judge-not-marked", ["rg-beat", "rg-hop"], "the line over the track carries no data-judge", [(TRAIN, "      saidEl.current.dataset.judge = said.judge;\n", "")]),
    m("said-offset-not-marked", ["rg-beat"], "the line over the track carries no data-delta", [(TRAIN, "      saidEl.current.dataset.delta = String(said.deltaMs);\n", "")]),
    m("score-not-shown", ["rg-beat"], "the score number is never written by the per-frame write", [(TRAIN, RHYTHM_WRITES, RHYTHM_WRITES.replace("    if (scoreEl.current) scoreEl.current.textContent = String(run.score);\n", "", 1))]),
    m("time-not-shown", ["rg-clock"], "the seconds left are written only when the component is drawn again, not by the per-frame write", [(TRAIN, RHYTHM_WRITES, RHYTHM_WRITES.replace("    if (timeEl.current) timeEl.current.textContent = String(secondsLeft(run));\n", "", 1))]),
    m("line-is-a-little-low", ["rg-clock"], "the line the notes fall to is 0.78 down, not 0.74", [(TRAIN, "const LINE = 0.74;", "const LINE = 0.78;")]),
    m("streak-not-shown", ["rg-beat", "rg-run"], "the streak number is never written by the per-frame write", [(TRAIN, RHYTHM_WRITES, RHYTHM_WRITES.replace("    if (streakEl.current) streakEl.current.textContent = String(run.streak);\n", "", 1))]),
    # the hop
    m("hop-attribute-never-set", ["rg-hop"], "the face never gets its data-hop", [(TRAIN, 'data-hop={hops > 0 ? "yes" : undefined}', "data-hop={undefined}")]),
    m("face-key-dropped", ["rg-hop"], "the face is the same element after a second hit, so the hop would not start again", [(TRAIN, 'class="rhythm-face" key={hops} data-hop=', 'class="rhythm-face" data-hop=')]),
    m("a-stray-makes-the-face-hop", ["rg-hop"], "the face hops for a stray too", [(TRAIN, 'if (said.judge === "perfect" || said.judge === "good") setHops((h) => h + 1);', 'if (said.judge !== "miss") setHops((h) => h + 1);')]),
    m("the-face-never-hops", ["rg-hop"], "the hop has no animation", [(CSS, ".rhythm-face[data-hop] {\n  animation: rhythm-hop 220ms ease-out;\n}", ".rhythm-face[data-hop] {\n  animation: none;\n}")]),
    # Two edits: the page's global reduced-motion rule (animation: none !important) already stops the hop, so the hop's own rule alone is the equivalent mutant below.
    m("reduced-motion-still-hops", ["rg-hop"], "no reduced-motion rule is left for the hop", [(CSS, "    animation: none !important;\n    transition: none !important;\n", "    transition: none !important;\n"), (CSS, "  .rhythm-face[data-hop] {\n    animation: none;\n  }", "  .rhythm-face[data-hop] {\n    animation: rhythm-hop 220ms ease-out;\n  }")]),
    # the touch
    m("tap-on-release", ["rg-touch"], "a tap counts when the finger lifts, not when it presses", [(TRAIN, "onPointerDown={() => tapped()}", "onPointerUp={() => tapped()}")]),
    m("a-touch-never-taps", ["rg-touch"], "a finger's press counts for nothing (only a click with no detail does)", [(TRAIN, "onPointerDown={() => tapped()}", "onPointerDown={() => {}}")]),
    m("lift-taps-again", ["rg-touch"], "the click after a press counts as a second tap", [(TRAIN, "            if (e.detail === 0) tapped();\n          }}\n        />\n        {run.paused", "            tapped();\n          }}\n        />\n        {run.paused")]),
    m("page-behind-scrolls", ["rg-touch"], "the page behind an open panel is not locked", [(CSS, "body:has(.panel) {\n  overflow: hidden;\n}", "body:has(.panel) {\n  overflow: visible;\n}")]),
    # the run and the card
    m("finish-never-called", ["rg-run"], "the end of the run never reaches the game (no result, no pay)", [(TRAIN, RHYTHM_FINISH, RHYTHM_FINISH.replace("        game.finishTraining();\n", "", 1))]),
    # the names and the keyboard
    m("a-note-has-a-name", ["rg-a11y"], "a note's picture has a name a screen reader would read", [(TRAIN, '<Pic sprite={icons.note} id="icon:note" px={40} class="rhythm-note-pic" />', '<img alt="note" class="rhythm-note-pic" />')]),
    m("pad-has-no-name", ["rg-a11y"], "the pad has no accessible name", [(TRAIN, '          aria-label="Tap on the beat"\n', "")]),
    m("enter-does-not-tap", ["rg-a11y"], "Enter on the focused pad does nothing", [(TRAIN, "            if (e.detail === 0) tapped();\n          }}\n        />\n        {run.paused", "            if (false) tapped();\n          }}\n        />\n        {run.paused")]),
    m("said-is-a-live-region", ["rg-a11y"], "the line over the track is a live region", [(TRAIN, '<p class="rhythm-said" ref={saidEl}', '<p class="rhythm-said" aria-live="polite" ref={saidEl}')]),
    # the layout
    m("picker-buttons-are-short", ["rg-fit"], "the picker's buttons are 30 px tall", [(CSS, ".train-picker .btn {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n}", ".train-picker .btn {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  height: 30px;\n  min-height: 0;\n}")]),
    m("pad-is-narrower-than-the-track", ["rg-fit"], "the pad covers only 60 percent of the track's width", [(CSS, ".rhythm-pad {\n  position: absolute;\n  inset: 0;", ".rhythm-pad {\n  position: absolute;\n  inset: 0 40% 0 0;")]),
    m("face-below-the-track", ["rg-fit"], "the creature's face hangs 30 px below the track", [(CSS, "  left: 8px;\n  bottom: 8px;\n  pointer-events: none;", "  left: 8px;\n  bottom: -30px;\n  pointer-events: none;")]),
    m("picker-wider-than-the-window", ["rg-fit"], "each picker button is 400 px wide, wider than the 320 px window (200 px each wrapped and fitted: the picker wraps)", [(CSS, ".train-picker .btn {\n  display: inline-flex;", ".train-picker .btn {\n  width: 400px;\n  flex: none;\n  display: inline-flex;")], size="320x568@1"),
    # Kid Mode
    m("kid-mode-gets-the-train-button", ["rg-kid"], "Kid Mode shows Adult Mode's Fight and Train row", [(ARENA, '  if (adult) {\n    return (\n      <div class="actions">\n        {noteRow}\n        <div class="trainbtns"', '  if (true) {\n    return (\n      <div class="actions">\n        {noteRow}\n        <div class="trainbtns"')], kid_only=True),
]

# Not mutated (each argued from the code; `--equivalents` applies each one and exits 0 only when every check still passes, which is the proof that the argument holds):
#  - the hop's own reduced-motion rule (`.rhythm-face[data-hop] { animation: none }` in `app.css`): the global rule just above the Creature Book (`animation: none !important` on every element) already stops it, so dropping it changes nothing.
#  - `touch-action: none` on `.rhythm-pad`: the pad's parent, `.train-field`, has it too, and a browser takes the most restrictive touch-action along the ancestors up to the scroller.
EQUIVALENT = [
    m("reduced-motion-hop-rule-dropped", ["rg-hop"], "the hop has no reduced-motion rule of its own, the global one still holds", [(CSS, "  .rhythm-face[data-hop] {\n    animation: none;\n  }", "  .rhythm-face[data-hop] {\n    animation: rhythm-hop 220ms ease-out;\n  }")]),
    m("pad-touch-action-dropped", ["rg-touch"], "the pad has no touch-action of its own, the field's still holds", [(CSS, "  inset: 0;\n  padding: 0;\n  border: 0;\n  border-radius: inherit;\n  background: transparent;\n  cursor: pointer;\n  touch-action: none;", "  inset: 0;\n  padding: 0;\n  border: 0;\n  border-radius: inherit;\n  background: transparent;\n  cursor: pointer;")]),
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
        raise Stop("the copy differs from the repo before the run (delete $VERIFY_OUT/rhythm-ui-copy to start again):\n" + diff_text)
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
        base.stop()
    except Infra as e:
        raise Stop(f"clean build: {e}")
    last = text.strip().splitlines()[-1:] if text.strip() else ["(no output)"]
    print(f"baseline checker on the clean build: exit {rc}; last line: {last[0]}", flush=True)
    if rc != 0:
        raise Stop(f"the clean build fails its own checks: checker exit {rc} (log {base_log})")

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
    ap = argparse.ArgumentParser(description="Mutation runner for the Bug Catch screen checks (A3.2).")
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
