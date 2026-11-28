#!/usr/bin/env python3
"""Mutation runner for the SCREEN side of Timed combat (Broodkeep, A4.3, docs/adult-a4-plan.md sections 10 and 13): the timing pad and its ring, the word each tap earns, the keyboard, the guards against a
second round, a fight left with the pad open, the one sulk's words, the numbers that wait for the blows, the wild creature's shown move, Kid Mode's untouched Arena, the result card that the winning tap must
not put away, the notes under the health bars and the layout. The rules (grading, the parry, the meter, the plan, the sulk cap, the ladder) are the unit runner's: mutate-combat-unit.py.

Works only on a copy of the repo at $VERIFY_OUT/combat-ui-copy (never the real repo).
Each mutant is one or more exact text replaces in the copy. The copy is rebuilt, served by
`vite preview` on port 4186 (the only port this runner uses; 4180-4189 are reserved for the mutation runners), and
the browser checker combat-browser.mjs runs with only the check ids that the mutant must break, at the window size the mutant names.

Usage:
  python3 mutate-combat-ui.py    --check-targets   verify each `old` occurs exactly once in the copy; print the table
  python3 mutate-combat-ui.py    --check-targets --equivalents   the same for the EQUIVALENT list (a displaced one is only found this way)
  python3 mutate-combat-ui.py                      clean baseline, every mutant, final clean rebuild
  python3 mutate-combat-ui.py    --equivalents     clean baseline, then the EQUIVALENT mutants: every check must still pass (SURVIVED) for the run to be OK

Exit codes: 0 every mutant CAUGHT (with --equivalents: every one SURVIVED) and the final checks pass; 1 some mutant not as expected, or a final check
failed; 2 the run stopped (copy out of sync, clean build failed its own checks, build or serve broke).

Edge cases this runner handles (each is a path in the code, not only a happy path):
  - an `old` text that occurs 0 or 2+ times: that mutant is ERROR and is not applied
  - a build that breaks for one mutant: ERROR for that mutant, the file is restored
  - a checker that hangs: killed by process group after 4 minutes, ERROR
  - a served page that is not the build just made: the run refuses to count that mutant (ERROR)
  - a server already answering on the port before ours starts: the run stops (exit 2) instead of testing the wrong server
  - the clean-build baseline runs every check id at ONE size (360x640@2, both modes); a mutant runs only the ids it must break, at its own size: the
    all-sizes proof for the clean build is a separate full run of combat-browser.mjs (run-combat.sh). A mutant that names another size (320x568@1) first gets a
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
COPY = os.path.join(VERIFY_OUT, "combat-ui-copy")
CHECKER = os.path.join(HERE, "combat-browser.mjs")
LOGS = os.path.join(VERIFY_OUT, "mutate-combat-ui-logs")
PORT = 4186  # ports 4180-4189 are the mutation runners'; this one uses 4186 only
SIZE = "360x640@2"
BUILD_TIMEOUT = 600
BASELINE_TIMEOUT = 1500
MUTANT_TIMEOUT = 240

ALL_IDS = ["cb-pad", "cb-words", "cb-early", "cb-keyboard", "cb-double", "cb-stale", "cb-leave", "cb-sulk", "cb-numbers", "cb-intent", "cb-kid", "cb-result", "cb-notes", "cb-layout"]

ARENA = "src/ui/ArenaBar.tsx"
GAME = "src/ui/game.ts"
STAGE = "src/ui/Stage.tsx"
DATA = "src/data/combat.ts"
CSS = "src/ui/app.css"

# Text the timed bar and the result card share with other code is anchored on a neighbour.
PAD_CSS = "  overflow: hidden;\n  min-height: 76px;\n  background: var(--panel);"
NOTE_CSS = ".reason-box.arena {\n  padding-top: 19%;"
DISABLED = 'disabled={waiting || (a.id === "special" && !full)}'
FINISH_GUARD = "    if (resolved.current) return;\n    resolved.current = true;"
PLAYING_GUARD = "if (!arena || arena.battle.over || this.playing) return;"
CLICK_ZERO = "if (e.detail === 0) tap(); // a click that no pointer made: assistive technology"
BACK_REF = "  const back = useRef<BattleAction | null>(null); // the action to give focus back to once its round has played\n"
CLEANUP = BACK_REF + "  useEffect(() => () => window.clearTimeout(timer.current), []);"
CLOSE_AFTER = "t.ringMs + timingWindows.goodMs + t.graceMs);"
RESULT_MS = "resultGuardMs: 600,"
SULK_WORD = 'const word = sulked ? "Sulking: discipline too low. Training helps." : timingWord(choice, timing, offsetMs, parried);'
RUN_COL = "grid-template-columns: 1fr 1fr 1fr 0.7fr; /* Run keeps"


# edits: (file, old, new), applied in order. `old` must occur exactly once in that file of the copy.
# expect: check ids, one of which must FAIL for the mutant to count as caught. kid_only: the checker runs --modes kid. size: the window the checker runs at.
def m(id, expect, what, edits, size="360x640@2", kid_only=False):
    return dict(id=id, expect=expect, kid_only=kid_only, size=size, what=what, edits=edits)


MUTANTS = [
    # the pad and its ring
    m("pad-has-no-name", ["cb-pad"], "the pad has no accessible name", [(ARENA, '            aria-label={`${chosen.word}: tap when the ring meets the circle`}\n', "")]),
    m("pad-not-focused", ["cb-pad", "cb-keyboard"], "the pad does not take focus when it opens", [(ARENA, "    if (prompt) pad.current?.focus();", "    if (prompt) void pad;")]),
    m("special-always-pressable", ["cb-pad"], "Special can be pressed with no charge", [(ARENA, DISABLED, "disabled={waiting}")]),
    m("special-label-always-plain", ["cb-pad"], "Special is never called not charged yet", [(ARENA, 'aria-label={a.id === "special" && !full ? "Special (not charged yet)" : a.word}', "aria-label={a.word}")]),
    m("ring-is-still", ["cb-pad"], "the ring has no animation", [(CSS, "animation: timing-ring linear both;", "animation: none;")]),
    m("ring-twice-as-fast", ["cb-pad"], "the ring shrinks in half the time the pad waits", [(ARENA, "animation-duration: ${t.ringMs}ms; --ring-ms: ${t.ringMs}ms", "animation-duration: ${t.ringMs / 2}ms; --ring-ms: ${t.ringMs}ms")]),
    m("reduced-motion-ring-overridden", ["cb-pad"], "the rule that stops animations for a player who asked for none stops the lit ring too", [(CSS, "steps(1, end) both !important;", "steps(1, end) both;")]),
    m("pad-narrower-than-the-buttons", ["cb-pad", "cb-layout"], "the pad covers one column, not the three buttons' footprint", [(CSS, ".fightbtns.timed .timing-pad {\n  grid-column: 1 / span 3;\n}", ".fightbtns.timed .timing-pad {\n  grid-column: 1;\n}")]),
    m("pad-is-short", ["cb-pad", "cb-layout"], "the pad is 30 px tall", [(CSS, PAD_CSS, "  overflow: hidden;\n  min-height: 30px;\n  height: 30px;\n  align-self: start;\n  background: var(--panel);")]),
    # the word each tap earns
    m("tap-timed-from-opening", ["cb-words", "cb-early"], "a tap is measured from the moment the pad opened, not from the ring meeting the circle", [(ARENA, "const offset = tapAt === null ? null : tapAt - (openedAt + t.ringMs);", "const offset = tapAt === null ? null : tapAt - openedAt;")]),
    m("grade-ignored", ["cb-words"], "every tap plays as Normal", [(ARENA, 'game.round(choice, offset === null ? "normal" : gradeTap(offset), offset);', 'game.round(choice, "normal", offset);')]),
    m("offset-not-passed-on", ["cb-words", "cb-early"], "the game is not told how far from the target the tap was (no Early, no Late)", [(ARENA, "gradeTap(offset), offset);", "gradeTap(offset), null);")]),
    m("pad-closes-late", ["cb-words"], "the pad waits two seconds more than the ring", [(ARENA, CLOSE_AFTER, "t.ringMs + 2000);")]),
    m("pad-closes-at-the-target", ["cb-words"], "the pad closes the moment the ring meets the circle", [(ARENA, CLOSE_AFTER, "t.ringMs);")]),
    m("early-tap-ignored", ["cb-early", "cb-words"], "a tap more than 300 ms before the target does nothing", [(ARENA, "    if (prompt) finish(prompt.choice, prompt.openedAt, performance.now());", "    if (prompt && performance.now() - prompt.openedAt > t.ringMs - 300) finish(prompt.choice, prompt.openedAt, performance.now());")]),
    # the keyboard and assistive technology
    m("keys-taken-at-keyup", ["cb-keyboard"], "the pad takes Space and Enter when the key comes up, not when it goes down", [(ARENA, "            onKeyDown={(e) => {\n              if (e.key", "            onKeyUp={(e) => {\n              if (e.key")]),
    m("assistive-click-ignored", ["cb-keyboard"], "a click that no pointer made does nothing", [(ARENA, CLICK_ZERO, "if (false) tap(); // a click that no pointer made: assistive technology")]),
    # one round for one prompt, and a fight left with the pad open
    m("buttons-pressable-while-a-round-plays", ["cb-double"], "Attack and Guard can be pressed while a round plays", [(ARENA, DISABLED, 'disabled={a.id === "special" && !full}')]),
    m("both-guards-against-a-second-round-removed", ["cb-double"], "a second pointerdown in the same frame plays a second round", [(ARENA, FINISH_GUARD, "    resolved.current = true;"), (GAME, PLAYING_GUARD, "if (!arena || arena.battle.over) return;")]),
    m("leaving-keeps-the-pads-timer", ["cb-leave"], "a fight left with the pad open lets the pad's timer go on", [(ARENA, CLEANUP, BACK_REF + "  useEffect(() => {}, []);")]),
    # the sulk's words
    m("sulk-says-a-grade-word", ["cb-sulk"], "a sulked round says its tap's grade, not the sulk", [(GAME, SULK_WORD, "const word = timingWord(choice, timing, offsetMs, parried);")]),
    m("sulk-words-shortened", ["cb-sulk"], "the sulk note is one word", [(GAME, '"Sulking: discipline too low. Training helps." : timingWord', '"Sulking." : timingWord')]),
    m("sulk-never-noticed", ["cb-sulk"], "the screen never sees that the round was a sulk", [(GAME, 'const sulked = arena.battle.events.some((e) => e.actor === "me" && e.kind === "sulk");', "const sulked = false;")]),
    # the numbers and the shown move
    m("numbers-do-not-wait", ["cb-numbers"], "the numbers show the HP after the blows while they are still playing back", [(ARENA, '(waiting ? b.hpBefore[side] : b[side].hp)', 'b[side].hp')]),
    m("shown-move-stays-while-playing", ["cb-numbers"], "the wild creature's next move is shown while the round plays", [(ARENA, 'visibility: waiting || !next ? "hidden" : "visible"', 'visibility: !next ? "hidden" : "visible"')]),
    m("shown-move-is-another", ["cb-intent"], "the line shows a move that is not the planned one", [(ARENA, "timedActions.find((a) => a.id === b.foeNext)", "timedActions.find((a) => a.id !== b.foeNext)")]),
    m("shown-move-has-no-word", ["cb-intent"], "the line shows the icon but no word", [(ARENA, '<span class="arena-move">{next?.id ?? ""}</span>', '<span class="arena-move" />')]),
    m("shown-move-capitalizing-the-whole-row", ["cb-intent"], "the whole line is capitalized, so it reads Foe Next", [(CSS, ".arena-intent {\n  gap: 6px;\n}", ".arena-intent {\n  gap: 6px;\n  text-transform: capitalize;\n}")]),
    m("shown-move-not-capitalized", ["cb-intent"], "the move's word is not capitalized", [(CSS, ".arena-move {\n  text-transform: capitalize;", ".arena-move {\n  text-transform: none;")]),
    m("pad-word-removed", ["cb-pad"], "the pad shows no word", [(ARENA, '<span class="timing-word" aria-hidden="true">\n              {chosen.word}\n', '<span class="timing-word" aria-hidden="true">\n              {""}\n')]),
    # the keyboard, a right-button press, and focus
    m("enter-not-taken-at-keydown", ["cb-keyboard"], "the pad's key handler takes Space only: Enter's own click (and a held Enter's repeats, each a click) take the tap", [(ARENA, 'if (e.key === " " || e.key === "Enter") {', 'if (e.key === " ") {')]),
    m("repeat-is-a-tap", ["cb-keyboard"], "a repeat of a held key is a tap", [(ARENA, "                if (!e.repeat) tap();", "                tap();")]),
    m("keydown-default-not-prevented", ["cb-keyboard"], "the key handler does not stop the button's own click for Enter, so a held Enter's repeat is a click", [(ARENA, "                e.preventDefault(); // also stops the button's own click for Enter: a held key repeats into the pad, and a repeat is not a tap\n", "")]),
    m("right-button-is-a-tap", ["cb-double"], "a right-button or middle-button press on the pad is graded", [(ARENA, "              if (e.button !== 0) return; // a touch, the pen's tip and the mouse's main button are 0; a right or middle press is not a tap\n", "")]),
    m("held-key-opens-an-action", ["cb-keyboard"], "a key still held from the pad's tap repeats into the button that focus went back to, and opens a pad nobody chose", [(ARENA, "                if (e.repeat && (e.key === \" \" || e.key === \"Enter\")) e.preventDefault(); // a key still held from the pad's tap repeats into the button that focus went back to: not a choice\n", "")]),
    m("focus-not-restored", ["cb-keyboard"], "focus is not given back to the action played once its round is over", [(ARENA, "    if (waiting || !back.current) return;", "    return;")]),
    m("timer-kept-after-the-round", ["cb-stale"], "the pad's timer is not cleared when the round is played, so it can close a pad opened within 1.1 s", [(ARENA, "    window.clearTimeout(timer.current);\n    back.current = choice;", "    back.current = choice;")]),
    # Kid Mode
    m("kid-gets-the-timed-bar", ["cb-kid"], "a fight that is not timed shows the pad", [(ARENA, "if (arena && arena.battle.timed) return <TimedFight", "if (arena) return <TimedFight")], kid_only=True),
    m("kid-result-card-guarded", ["cb-kid"], "a won Kid fight's result card ignores a tap for 600 ms too", [(ARENA, "if (game.arena?.battle.timed && performance.now() - shownAt.current < combatTuning.timed.resultGuardMs) return;", "if (performance.now() - shownAt.current < combatTuning.timed.resultGuardMs) return;")], kid_only=True),
    # the result card
    m("result-card-not-guarded", ["cb-result"], "the click of the winning tap puts the card away at once", [(DATA, RESULT_MS, "resultGuardMs: 0,")]),
    m("result-card-guard-never-ends", ["cb-result"], "the card ignores a tap for ten minutes", [(DATA, RESULT_MS, "resultGuardMs: 600000,")]),
    m("result-card-guard-short", ["cb-result"], "the card ignores a tap for 100 ms only", [(DATA, RESULT_MS, "resultGuardMs: 100,")]),
    # the notes
    m("note-over-the-bars", ["cb-notes"], "the arena's note box has no arena class, so the note sits at the top of the picture", [(STAGE, 'class={game.atArena ? "reason-box arena" : "reason-box"}', 'class="reason-box"')]),
    m("note-padding-small", ["cb-notes"], "the note starts 3 percent down, on the bars", [(CSS, NOTE_CSS, ".reason-box.arena {\n  padding-top: 3%;")]),
    m("note-spills-below-the-picture", ["cb-notes"], "the note starts 97 percent down and ends below the picture", [(CSS, NOTE_CSS, ".reason-box.arena {\n  padding-top: 97%;")]),
    # the layout
    m("run-column-too-narrow", ["cb-layout"], "the Run button's column is 0.3 of a button", [(CSS, RUN_COL, "grid-template-columns: 1fr 1fr 1fr 0.3fr; /* Run keeps")]),
    m("pad-taller-than-the-buttons", ["cb-layout"], "the pad is 120 px tall and moves the rows when it opens", [(CSS, PAD_CSS, "  overflow: hidden;\n  min-height: 120px;\n  background: var(--panel);")]),
]

# Not mutated (each argued from the code; `--equivalents` applies each one and exits 0 only when every check still passes, which is the proof that the argument holds):
#  - the guard against a second round has two parts, `resolved` in the pad and `playing` in the game: either one alone stops a second round, so each alone changes nothing (both removed is a mutant, caught by cb-double).
#  - the numbers rows' `flex-wrap: wrap` (`.arena-nums, .arena-intent`) is NOT mutated and is NOT argued equivalent: it was never applied in a browser (not tried). By the CSS rules the spans would shrink to one word each and wrap inside,
#    so nothing would run past the window and cb-layout could not fail, but that changes the row's height, which nothing measures. It is an untested rule (docs/known-issues.md), not an equivalent mutant.
#  - (the pad's timer not cleared, and Enter's keydown not taken, were argued equivalent in the first version of this list. Both were wrong: a pad opened within 1.1 s of a calm round is closed by the old timer, and a held Enter
#    repeats into the pad as clicks. They are mutants now, caught by cb-stale and cb-keyboard.)
#  - `preventDefault` on pointerdown: it stops the emulated mouse events and a focus change; the click that follows has a detail above 0 and is ignored either way (the stray click that matters is the result card's).
EQUIVALENT = [
    m("finish-guard-removed", ["cb-double"], "only the pad's guard against a second round is removed (the game's still holds)", [(ARENA, FINISH_GUARD, "    resolved.current = true;")]),
    m("playing-guard-removed", ["cb-double"], "only the game's guard against a second round is removed (the pad's still holds)", [(GAME, PLAYING_GUARD, "if (!arena || arena.battle.over) return;")]),
    m("pointerdown-not-prevented", ["cb-double"], "pointerdown does not call preventDefault", [(ARENA, "              e.preventDefault();\n              tap();\n            }}", "              tap();\n            }}")]),
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
        raise Stop("the copy differs from the repo before the run (delete $VERIFY_OUT/combat-ui-copy to start again):\n" + diff_text)
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
    ap = argparse.ArgumentParser(description="Mutation runner for the Timed combat screen checks (A4.3).")
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
