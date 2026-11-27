#!/usr/bin/env python3
"""Mutation runner for the SCREEN side of field tappables (Broodkeep, A3.4): the picture's draw, the Stage's hit test, hold and lift, the canvas attributes and accessible name, the burst's
overlay and card, Kid Mode, and the leaves and the calm blocks as the browser sees them. (The rules and the Game wiring are mutated by mutate-tap-unit.py.)

Works only on a copy of the repo at $VERIFY_OUT/tap-ui-copy (never the real repo).
Each mutant is one or more exact text replaces in the copy. The copy is rebuilt, served by
`vite preview` on port 4180 (the only port this runner uses; 4180-4189 are reserved for it), and
the browser checker tap-browser.mjs runs with only the check ids that the mutant must break, at the window size the mutant names.

Usage:
  python3 mutate-tap-ui.py    --check-targets   verify each `old` occurs exactly once in the copy; print the table
  python3 mutate-tap-ui.py                      clean baseline, every mutant, final clean rebuild
  python3 mutate-tap-ui.py    --equivalents     clean baseline, then the EQUIVALENT mutants: every check must still pass (SURVIVED) for the run to be OK
  python3 mutate-tap-ui.py    --only id1,id2    clean baseline, then only those mutants (combine with --equivalents to pick among those)

Exit codes: 0 every mutant CAUGHT (with --equivalents: every one SURVIVED) and the final checks pass; 1 some mutant not as expected, or a final check
failed; 2 the run stopped (copy out of sync, clean build failed its own checks, build or serve broke).

Edge cases this runner handles (each is a path in the code, not only a happy path):
  - an `old` text that occurs 0 or 2+ times: that mutant is ERROR and is not applied
  - a build that breaks for one mutant: ERROR for that mutant, the file is restored
  - a checker that hangs: killed by process group after 7 minutes, ERROR
  - a served page that is not the build just made: the run refuses to count that mutant (ERROR)
  - a server already answering on the port before ours starts: the run stops (exit 2) instead of testing the wrong server
  - the clean-build baseline runs every check id at ONE size (360x640@2, both modes); a mutant runs only the ids it must break, at its own size: the
    all-sizes proof for the clean build is a separate full run of tap-browser.mjs (run-tap.sh)
  - Ctrl-C or SIGTERM mid-mutant: the file under edit is restored in a `finally`, servers are stopped
  - a checker exit 1 whose FAIL lines name only other ids: CAUGHT-BY-OTHER, not CAUGHT
  - a FAIL line of the named id whose message is a crash or a wait that ran out (TypeError, "timed out after", no button...): CAUGHT-BY-ERROR, not CAUGHT; every CAUGHT row prints its assertion message to be read
  - --equivalents with an empty EQUIVALENT list: the run stops (exit 2); zero mutants would otherwise print RUN OK
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
COPY = os.path.join(VERIFY_OUT, "tap-ui-copy")
CHECKER = os.path.join(HERE, "tap-browser.mjs")
LOGS = os.path.join(VERIFY_OUT, "mutate-tap-ui-logs")
PORT = 4180  # ports 4180-4189 are this runner's; it uses 4180 only
SIZE = "360x640@2"
BUILD_TIMEOUT = 600
BASELINE_TIMEOUT = 2400
MUTANT_TIMEOUT = 420

ALL_IDS = ["tap-appear", "tap-pay", "tap-pickup", "tap-rustle", "tap-burst", "tap-hit", "tap-finger", "tap-order", "tap-kid", "tap-gate", "tap-leave", "tap-four", "tap-fit"]

STAGE = "src/ui/Stage.tsx"
SCENE = "src/art/scene.ts"
ART = "src/art/tappables.ts"
GAME = "src/ui/game.ts"
DATA = "src/data/tappables.ts"
RULES = "src/game/tappables.ts"
TRAIN = "src/game/training.ts"

# edits: (file, old, new), applied in order. `old` must occur exactly once in that file of the copy.
# expect: check ids that must FAIL for the mutant to count as caught (the first real run confirms each one). kid_only: the checker runs --modes kid. size: the window the checker runs at.
MUTANTS = [
    # --- the picture and what the canvas says
    dict(id="tappables-not-drawn", expect=["tap-appear"], kid_only=False, size="360x640@2", what="the scene draws nothing on the ground (the pixels of the box do not change when the thing is gone)",
         edits=[(SCENE, 'if (view.tappables.length > 0 && c.place !== "home") drawTappables(ctx, view, c.place);', "if (false) drawTappables(ctx, view, c.place as never);")]),
    dict(id="tappables-drawn-elsewhere", expect=["tap-appear"], kid_only=False, size="360x640@2", what="a thing is drawn 40 game pixels from where the canvas says it is",
         edits=[(ART, "drawSprite(ctx, spriteCanvas(sprite, key), p.x, p.y + (Math.floor(view.clock * 2 + p.id) % 2));", "drawSprite(ctx, spriteCanvas(sprite, key), p.x + 40, p.y + (Math.floor(view.clock * 2 + p.id) % 2));")]),
    dict(id="attribute-box-shifted", expect=["tap-appear"], kid_only=False, size="360x640@2", what="`data-tappables` is 40 CSS pixels from where the thing is",
         edits=[(STAGE, "[p.x * size.k * css, p.y * size.k * css, tapTuning.size", "[p.x * size.k * css + 40, p.y * size.k * css, tapTuning.size")]),
    dict(id="attribute-box-wide", expect=["tap-fit"], kid_only=False, size="360x640@2", what="`data-tappables` says the box is three times as wide as it is",
         edits=[(STAGE, "tapTuning.size * size.k * css, tapTuning.size * size.k * css].map(round)", "tapTuning.size * size.k * css * 3, tapTuning.size * size.k * css].map(round)")]),
    dict(id="accessible-name-silent", expect=["tap-appear"], kid_only=False, size="360x640@2", what="the accessible name does not say there is something on the ground",
         edits=[(STAGE, '(game.view.tappables.length > 0 ? " Something to tap on the ground." : "")', '""')]),
    dict(id="fade-never", expect=["tap-appear"], kid_only=False, size="360x640@2", what="a thing nobody taps never fades (the life is ten times as long)",
         edits=[(DATA, "lifeMs: 90_000,", "lifeMs: 900_000,")]),
    dict(id="first-wait-short", expect=["tap-appear"], kid_only=False, size="360x640@2", what="every wait is 5 to 40 s (the draw's wait is no longer when the first one shows)",
         edits=[(DATA, "delayMs: [20_000, 40_000] as [number, number],", "delayMs: [5_000, 40_000] as [number, number],")]),
    dict(id="seed-from-global-random", expect=["tap-appear"], kid_only=False, size="360x640@2", what="the visit's seed comes from the global Math.random, which the page has swapped for a constant (the queued draw is never read)",
         edits=[(GAME, "this.tapRng(Math.floor(this.tapRand() * 2 ** 32))", "this.tapRng(Math.floor(Math.random() * 2 ** 32))")]),
    dict(id="visit-at-home", expect=["tap-appear"], kid_only=False, size="360x640@2", what="a visit starts at home too (the seed is read before the creature goes to a field)",
         edits=[(GAME, '&& !!c && !c.job && c.sleep === null && c.place !== "home";', "&& !!c && !c.job && c.sleep === null;")]),
    # --- taps and pays
    dict(id="taps-ignored", expect=["tap-pay"], kid_only=False, size="360x640@2", what="a touch never finds a tappable",
         edits=[(STAGE, "const onTap = onBall ? null : tappableUnder(e);", "const onTap = onBall ? null : (null as ReturnType<typeof tappableUnder>);")]),
    dict(id="tap-keeps-the-thing", expect=["tap-pay"], kid_only=False, size="360x640@2", what="a tap pays and leaves the tappable there (a second tap pays again)",
         edits=[(GAME, "this.tappables = this.tappables.filter((q) => q !== p); // (before it pays, so a second tap finds nothing)", "")]),
    dict(id="sparkle-pays-two-coins", expect=["tap-pay"], kid_only=False, size="360x640@2", what="a sparkle that pays coins pays 2",
         edits=[(RULES, '{ kind: "coins", amount: 1 }', '{ kind: "coins", amount: 2 }')]),
    dict(id="pickup-always-land", expect=["tap-pickup"], kid_only=False, size="360x640@2", what="every field's pickup is Land's acorn",
         edits=[(GAME, "payPickup(save, visit.place, now)", 'payPickup(save, "land", now)')]),
    dict(id="rustle-moment-pays-nothing", expect=["tap-rustle"], kid_only=False, size="360x640@2", what="a rustle's moment together pays no Bond XP",
         edits=[(RULES, "payBond(save, c, t.rustleXp, nowMs);", "payBond(save, c, 0, nowMs);")]),
    # --- the burst
    dict(id="burst-session-length", expect=["tap-burst"], kid_only=False, size="360x640@2", what="a bug's burst lasts a whole 75 second session",
         edits=[(GAME, "newBugCatch(Math.floor(Math.random() * 2 ** 32), stage, tapTuning.burstMs)", "newBugCatch(Math.floor(Math.random() * 2 ** 32), stage)")]),
    dict(id="burst-pays-no-xp", expect=["tap-burst"], kid_only=False, size="360x640@2", what="a burst pays no Bond XP for its catches",
         edits=[(TRAIN, "addBondXp(c, Math.min(run.catches, tapTuning.burstXpMax))", "addBondXp(c, 0)")]),
    dict(id="burst-paid-as-session", expect=["tap-burst"], kid_only=False, size="360x640@2", what="a burst is paid like a training session (Speed, Discipline, the day count)",
         edits=[(GAME, "(t.burst ? payBurst(save, save.creature, run, t.burst, now) : payTraining(save, save.creature, run, now))", "payTraining(save, save.creature, run, now)")]),
    dict(id="burst-opens-the-start-card", expect=["tap-burst"], kid_only=False, size="360x640@2", what="a tap on a bug opens the session's start card instead of playing at once",
         edits=[(GAME, 'phase: "playing", run: newBugCatch', 'phase: "ready", run: newBugCatch')]),
    dict(id="burst-card-too-wide", expect=["tap-fit"], kid_only=False, size="360x640@2", what="the burst's result line is one very long word",
         edits=[(TRAIN, 'if (r.catches === 0) return ["No bugs caught."];', 'if (r.catches === 0) return ["No_bugs_caught_" + "x".repeat(80)];')]),
    # --- the hit box, the hold and the lift
    dict(id="hit-pad-7", expect=["tap-hit"], kid_only=False, size="360x640@2", what="a touch counts 7 game pixels past the picture, not 8",
         edits=[(DATA, "pad: 8,", "pad: 7,")]),
    dict(id="hit-pad-9", expect=["tap-hit"], kid_only=False, size="360x640@2", what="a touch counts 9 game pixels past the picture",
         edits=[(DATA, "pad: 8,", "pad: 9,")]),
    dict(id="creature-before-tappable", expect=["tap-order"], kid_only=False, size="360x640@2", what="a touch where the creature's zone and a tappable's overlap goes to the creature",
         edits=[(STAGE, "const onTap = onBall ? null : tappableUnder(e);", "const onTap = onBall || isOnTarget(e) ? null : tappableUnder(e);")]),
    dict(id="hold-on-tappable-pets", expect=["tap-finger"], kid_only=False, size="360x640@2", what="a finger held on a tappable starts the petting timer like one held on the creature",
         edits=[(STAGE, "    if (onBall || onTap) {\n      hold.current = h;\n      return;\n    }", "    if (onBall) {\n      hold.current = h;\n      return;\n    }")]),
    dict(id="lift-elsewhere-pays", expect=["tap-finger"], kid_only=False, size="360x640@2", what="a finger that went down on a tappable and lifts elsewhere takes it",
         edits=[(STAGE, "if (mine && at && touches(mine, at.x, at.y)) takeTappable(mine.id);", "if (mine) takeTappable(mine.id);")]),
    # --- Kid Mode, the blocks, the leaves, the count
    dict(id="kid-mode-gets-tappables", expect=["tap-kid"], kid_only=True, size="360x640@2", what="Kid Mode is not stopped by the Adult Mode check",
         edits=[(GAME, "return isAdultMode(this.save) && this.save.phase === \"alive\" && !!c && !c.job && c.sleep === null && c.place !== \"home\";", "return this.save.phase === \"alive\" && !!c && !c.job && c.sleep === null && c.place !== \"home\";")]),
    dict(id="panel-does-not-hold", expect=["tap-gate"], kid_only=False, size="360x640@2", what="an open panel holds nothing: the clocks run on and the life is counted while it is open",
         edits=[(GAME, "if (!this.tapBlocked()) {\n      this.tapClock += dt;", "if (true) {\n      this.tapClock += dt;")]),
    dict(id="panel-does-not-hide", expect=["tap-gate"], kid_only=False, size="360x640@2", what="an open panel does not take the tappables off the picture",
         edits=[(GAME, "this.tapVisit !== null && this.tapEligible() && !this.tapBlocked() ?", "this.tapVisit !== null && this.tapEligible() ?")]),
    dict(id="move-keeps-the-visit", expect=["tap-leave"], kid_only=False, size="360x640@2", what="moving to another field does not end the visit (its things stay, no new draw)",
         edits=[(GAME, "c.bornAt === v.bornAt && c.place === v.place)) this.endVisit();", "c.bornAt === v.bornAt)) this.endVisit();")]),
    dict(id="end-visit-keeps-the-picture", expect=["tap-leave"], kid_only=False, size="360x640@2", what="ending a visit leaves the picture's list as it was until the next step",
         edits=[(GAME, "    this.tapVisit = null;\n    this.tappables = [];\n    this.syncTapView();\n    return had;", "    this.tapVisit = null;\n    this.tappables = [];\n    return had;")]),
    dict(id="no-gap-between-pictures", expect=["tap-four"], kid_only=False, size="360x640@2", what="a picture may touch another (a gap of 0 game pixels)",
         edits=[(DATA, "gap: 2,", "gap: 0,")]),
]

# Blind spots of the browser run (nothing reads them; the unit tests, the contact sheet or a person do): the order the pictures are drawn in against the creature (a thing is placed clear of
# the creature, so they never overlap); the hop, sparkles and heart of a reaction; the Bond level burst after a rustle; the one pixel bob.
# Not seen by the browser run (each argued; `--equivalents` applies them and exits 0 only when every check still passes; the unit tests catch both, `mutate-tap-unit.py`):
#  - nap-keeps-the-visit: a nap and the night's sleep both send the creature home (`actions.ts:142`, `care.ts:43`), so `place !== "home"` already ends the visit and the `sleep === null` term can only matter for a state the game never reaches; the unit tests set `sleep` directly (`eligible-asleep`).
#  - five-at-once: the draw of one visit makes at most three of them at once in the 200 s the check runs (the waits are 20 to 40 s and each lives 90 s), so the cap of 4 is not reached; the tuning literal and the Game test `shows at most four at once` pin it (`most-5`, `most-3`).
EQUIVALENT = [
    dict(id="nap-keeps-the-visit", expect=["tap-leave"], kid_only=False, size="360x640@2", what="a creature that goes to nap keeps its tappables",
         edits=[(GAME, '&& !!c && !c.job && c.sleep === null && c.place !== "home";', '&& !!c && !c.job && c.place !== "home";')]),
    dict(id="five-at-once", expect=["tap-four"], kid_only=False, size="360x640@2", what="up to five things at once",
         edits=[(DATA, "most: 4,", "most: 5,")]),
    # an `id` that is no longer in the list at the lift means the tappable was taken or faded while the finger was down: `find` returns undefined and the guard `mine &&` is what answers nothing; dropping `mine &&` would throw, so it is not mutated
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


# A FAIL line whose message is a crash or a wait that ran out, not a failed assertion (the checker turns any throw into a FAIL line): it does not count as the check catching the mutant.
CRASHY = re.compile(r"timed out after|Timeout \d+ms exceeded|TypeError|ReferenceError|Cannot read|is not a function|is not defined|Target (page|closed)|Execution context|no button", re.I)


def verdict(rc, text, expect):
    if rc == "timeout":
        return "ERROR", "checker timed out"
    if rc == 0:
        return "SURVIVED", "checker exit 0"
    fails = re.findall(r"^FAIL (\S+)", text, re.M)
    if rc == 1:
        named = "FAIL " + ",".join(sorted(set(fails)))
        hits = [ln for ln in text.splitlines() if ln.startswith("FAIL ") and ln.split()[1] in expect]
        if hits:
            real = [ln for ln in hits if not CRASHY.search(ln)]
            if real:
                return "CAUGHT", named + " | " + real[0][:170]
            return "CAUGHT-BY-ERROR", hits[0][:170]
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
        if not EQUIVALENT:
            raise Stop("--equivalents: the EQUIVALENT list is empty, so there is nothing to prove (a run of zero mutants would print RUN OK)")
        MUTANTS[:] = EQUIVALENT  # (the coverage check above ran on the real list)
    if args.only:
        wanted = [i for i in args.only.split(",") if i]
        known = {m["id"] for m in MUTANTS}
        unknown = [i for i in wanted if i not in known]
        if not wanted or unknown:
            raise Stop(f"--only names no mutant or an unknown one: {unknown or '(empty)'}")
        MUTANTS[:] = [m for m in MUTANTS if m["id"] in wanted]  # (the baseline still runs first; the summary counts only these)
    if not args.check_targets:
        gen = subprocess.run([os.path.join(HERE, "gen-saves.sh")], capture_output=True, text=True)
        if gen.returncode != 0:
            raise Stop("gen-saves.sh failed:\n" + gen.stdout[-800:] + gen.stderr[-800:])
    ensure_copy()
    same, diff_text = copy_matches_real()
    if not same:
        raise Stop("the copy differs from the repo before the run (delete $VERIFY_OUT/tap-ui-copy to start again):\n" + diff_text)
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
    print(f"SUMMARY caught={counts['CAUGHT']} other={counts['CAUGHT-BY-OTHER']} by-error={counts['CAUGHT-BY-ERROR']} "
          f"survived={counts['SURVIVED']} error={counts['ERROR']} of {len(results)}", flush=True)
    ok = (counts["SURVIVED"] if args.equivalents else counts["CAUGHT"]) == len(results) and final_ok
    print("RUN OK" if ok else "RUN NOT OK", flush=True)
    return 0 if ok else 1


def main():
    ap = argparse.ArgumentParser(description="Mutation runner for the Initiatives screen checks (A3.3).")
    ap.add_argument("--check-targets", action="store_true",
                    help="only verify that each old text occurs exactly once in the copy, and print the table")
    ap.add_argument("--only", help="run only these mutants (comma separated ids), after the same baseline")
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
