#!/usr/bin/env python3
"""Mutation runner for the SCREEN side of Bug Catch (Broodkeep, A3.2): the overlay, the touch handling, the pause, the Arena row in both modes and the layout.

Works only on a copy of the repo at $VERIFY_OUT/train-ui-copy (never the real repo).
Each mutant is one or more exact text replaces in the copy. The copy is rebuilt, served by
`vite preview` on port 4180 (the only port this runner uses; 4180-4189 are reserved for it), and
the browser checker train-browser.mjs runs with only the check ids that the mutant must break, at the window size the mutant names.

Usage:
  python3 mutate-train-ui.py    --check-targets   verify each `old` occurs exactly once in the copy; print the table
  python3 mutate-train-ui.py                      clean baseline, every mutant, final clean rebuild
  python3 mutate-train-ui.py    --equivalents     clean baseline, then the EQUIVALENT mutants: every check must still pass (SURVIVED) for the run to be OK

Exit codes: 0 every mutant CAUGHT (with --equivalents: every one SURVIVED) and the final checks pass; 1 some mutant not as expected, or a final check
failed; 2 the run stopped (copy out of sync, clean build failed its own checks, build or serve broke).

Edge cases this runner handles (each is a path in the code, not only a happy path):
  - an `old` text that occurs 0 or 2+ times: that mutant is ERROR and is not applied
  - a build that breaks for one mutant: ERROR for that mutant, the file is restored
  - a checker that hangs: killed by process group after 4 minutes, ERROR
  - a served page that is not the build just made: the run refuses to count that mutant (ERROR)
  - a server already answering on the port before ours starts: the run stops (exit 2) instead of testing the wrong server
  - the clean-build baseline runs every check id at ONE size (360x640@2, both modes); a mutant runs only the ids it must break, at its own size: the
    all-sizes proof for the clean build is a separate full run of train-browser.mjs (run-train.sh)
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
COPY = os.path.join(VERIFY_OUT, "train-ui-copy")
CHECKER = os.path.join(HERE, "train-browser.mjs")
LOGS = os.path.join(VERIFY_OUT, "mutate-train-ui-logs")
PORT = 4180  # ports 4180-4189 are this runner's; it uses 4180 only
SIZE = "360x640@2"
BUILD_TIMEOUT = 600
BASELINE_TIMEOUT = 1500
MUTANT_TIMEOUT = 240

ALL_IDS = ["train-kid", "train-clock", "train-hidden", "train-touch", "train-run", "train-reload", "train-still", "train-a11y", "train-fit"]

TRAIN = "src/ui/TrainGame.tsx"
ARENA = "src/ui/ArenaBar.tsx"
CSS = "src/ui/app.css"

# edits: (file, old, new), applied in order. `old` must occur exactly once in that file of the copy.
# expect: check ids that must FAIL for the mutant to count as caught. kid_only: the checker runs --modes kid. size: the window the checker runs at.
MUTANTS = [
    dict(id="catch-on-release", expect=["train-touch"], kid_only=False, size="360x640@2", what="a bug is caught when the finger lifts, not when it presses",
         edits=[(TRAIN, "            onPointerDown={(e) => {\n              e.stopPropagation(); // a catch is not also a miss on the field behind it", "            onPointerUp={(e) => {\n              e.stopPropagation(); // a catch is not also a miss on the field behind it")]),
    dict(id="catch-on-click", expect=["train-touch"], kid_only=False, size="360x640@2", what="a bug is caught by a click (after the finger lifts), not by the press",
         edits=[(TRAIN, "            onPointerDown={(e) => {\n              e.stopPropagation(); // a catch is not also a miss on the field behind it", "            onClickCapture={(e) => {\n              e.stopPropagation(); // a catch is not also a miss on the field behind it")]),
    dict(id="catch-is-also-a-miss", expect=["train-touch", "train-run"], kid_only=False, size="360x640@2", what="a tap on a bug also reaches the field's miss handler (both of its defences removed)",
         edits=[(TRAIN, "              e.stopPropagation(); // a catch is not also a miss on the field behind it\n", ""),
                (TRAIN, '    if ((e.target as Element).closest("[data-bug]")) return;\n', "")]),
    dict(id="empty-tap-is-no-miss", expect=["train-touch"], kid_only=False, size="360x640@2", what="a tap on empty field does nothing",
         edits=[(TRAIN, '<div class="train-field" ref={fieldRef} onPointerDown={onField}>', '<div class="train-field" ref={fieldRef}>')]),
    dict(id="enter-does-not-catch", expect=["train-a11y"], kid_only=False, size="360x640@2", what="Enter on a focused bug does nothing",
         edits=[(TRAIN, "if (e.detail === 0) caught(b.id);", "if (false) caught(b.id);")]),
    dict(id="hidden-page-keeps-running", expect=["train-hidden"], kid_only=False, size="360x640@2", what="a hidden page does not pause the run",
         edits=[(TRAIN, '  // A page that is hidden stops the run; a tap on the Paused card goes on.\n  useEffect(() => {\n    const onVisibility = (): void => {\n      if (document.visibilityState === "hidden" && !run.over) {', '  // A page that is hidden stops the run; a tap on the Paused card goes on.\n  useEffect(() => {\n    const onVisibility = (): void => {\n      if (false && !run.over) {')]),
    dict(id="pause-button-does-not-pause", expect=["train-clock"], kid_only=False, size="360x640@2", what="the Pause button redraws and does not pause",
         edits=[(TRAIN, "            onClick={() => {\n              pause(run);\n              bump();\n            }}\n          >\n            Pause\n          </button>\n          <button class=\"btn small\" onClick={() => game.closeTraining()}>\n            Quit\n          </button>\n        </div>\n      </div>\n      <div class=\"train-field\" ref={fieldRef}", "            onClick={() => {\n              bump();\n            }}\n          >\n            Pause\n          </button>\n          <button class=\"btn small\" onClick={() => game.closeTraining()}>\n            Quit\n          </button>\n        </div>\n      </div>\n      <div class=\"train-field\" ref={fieldRef}")]),
    dict(id="paused-card-does-not-resume", expect=["train-clock", "train-hidden"], kid_only=False, size="360x640@2", what="a tap on the Paused card does not go on",
         edits=[(TRAIN, "        ))}\n        {run.paused && (\n          <button\n            class=\"train-paused\"\n            onClick={() => {\n              resume(run);\n              bump();", "        ))}\n        {run.paused && (\n          <button\n            class=\"train-paused\"\n            onClick={() => {\n              bump();")]),
    dict(id="finish-never-called", expect=["train-run"], kid_only=False, size="360x640@2", what="the end of the run never reaches the game (no result, no pay)",
         edits=[(TRAIN, "      if (step(run, dt)) bump();\n      place();\n      if (run.over) {\n        game.finishTraining();\n        return;", "      if (step(run, dt)) bump();\n      place();\n      if (run.over) {\n        return;")]),
    dict(id="streak-not-shown", expect=["train-touch", "train-run"], kid_only=False, size="360x640@2", what="the streak number is never written",
         edits=[(TRAIN, "    if (streakEl.current) streakEl.current.textContent = String(run.streak);\n  };", "  };")]),
    dict(id="time-not-shown", expect=["train-clock"], kid_only=False, size="360x640@2", what="the seconds left are never written",
         edits=[(TRAIN, "translate(-50%, -50%)`;\n    }\n    if (timeEl.current) timeEl.current.textContent = String(secondsLeft(run));\n", "translate(-50%, -50%)`;\n    }\n")]),
    dict(id="go-not-focused", expect=["train-a11y", "train-run"], kid_only=False, size="360x640@2", what="the start card's Go button is not focused",
         edits=[(TRAIN, "  useEffect(() => goRef.current?.focus(), []);", "  useEffect(() => {}, []);")]),
    dict(id="done-not-focused", expect=["train-run"], kid_only=False, size="360x640@2", what="the result card's Done button is not focused",
         edits=[(TRAIN, "  useEffect(() => doneRef.current?.focus(), []);", "  useEffect(() => {}, []);")]),
    dict(id="golden-bug-has-the-plain-name", expect=["train-a11y"], kid_only=False, size="360x640@2", what="a golden bug is named 'Bug'",
         edits=[(TRAIN, 'aria-label={b.golden ? "Golden bug" : "Bug"}', 'aria-label="Bug"')]),
    dict(id="dialog-is-not-modal", expect=["train-a11y"], kid_only=False, size="360x640@2", what="the overlay says it is not modal",
         edits=[(TRAIN, 'aria-modal="true"', 'aria-modal="false"')]),
    dict(id="a-catch-saves-the-day-count", expect=["train-reload", "train-still"], kid_only=False, size="360x640@2", what="a catch writes the day count into the save at once (a reload would keep it)",
         edits=[(TRAIN, "    if (catchBug(run, id) !== null) {\n      bump();\n      place();", "    if (catchBug(run, id) !== null) {\n      (game as unknown as { act: (f: (s: any, n: number) => void) => void }).act((s) => {\n        if (s.creature) s.creature.training = { day: 20779, sessions: { spd: 1 } };\n      });\n      bump();\n      place();")]),
    dict(id="kid-mode-gets-the-train-button", expect=["train-kid"], kid_only=True, size="360x640@2", what="Kid Mode shows Adult Mode's Fight and Train row",
         edits=[(ARENA, '  if (adult) {\n    return (\n      <div class="actions">\n        {noteRow}\n        <div class="trainbtns"', '  if (true) {\n    return (\n      <div class="actions">\n        {noteRow}\n        <div class="trainbtns"')]),
    dict(id="page-behind-scrolls", expect=["train-touch"], kid_only=False, size="360x640@2", what="the page behind an open panel is not locked",
         edits=[(CSS, "body:has(.panel) {\n  overflow: hidden;\n}", "body:has(.panel) {\n  overflow: visible;\n}")]),
    dict(id="landscape-rule-off", expect=["train-fit"], kid_only=False, size="740x360@2", what="the landscape layout of the session never applies",
         edits=[(CSS, "@media (orientation: landscape) and (max-height: 520px) {\n  .train {", "@media (orientation: landscape) and (max-height: 1px) {\n  .train {")]),
    dict(id="bug-is-44-px-always", expect=["train-fit"], kid_only=False, size="360x640@2", what="a bug's button is 44 px whatever the field",
         edits=[(CSS, "width: max(44px, 15.3%);", "width: 44px;")]),
    dict(id="bug-is-smaller", expect=["train-fit"], kid_only=False, size="360x640@2", what="a bug's button is 12 percent of the field and may be under 44 px",
         edits=[(CSS, "width: max(44px, 15.3%);", "width: max(30px, 12%);")]),
    dict(id="field-wider-than-the-panel", expect=["train-fit"], kid_only=False, size="320x568@1", what="the field is wider than the window at 320",
         edits=[(CSS, "width: min(100%, 448px);\n  aspect-ratio: 1;\n  margin: 0 auto;", "width: min(120%, 448px);\n  aspect-ratio: 1;\n  margin: 0 auto;")]),
    dict(id="pause-and-quit-are-small", expect=["train-fit"], kid_only=False, size="360x640@2", what="Pause and Quit are 24 px tall",
         edits=[(CSS, ".train-buttons {\n  display: flex;\n  gap: 8px;\n}", ".train-buttons {\n  display: flex;\n  gap: 8px;\n}\n\n.train-buttons .btn {\n  height: 24px;\n  min-height: 0;\n}")]),
    dict(id="arena-row-is-wider-than-the-window", expect=["train-fit"], kid_only=False, size="320x568@1", what="Fight and Train are 200 px wide each",
         edits=[(CSS, ".trainbtns {\n  display: grid;\n  grid-template-columns: 1fr 1fr;", ".trainbtns {\n  display: grid;\n  grid-template-columns: 200px 200px;")]),
]

# Not mutated (each argued from the code; `--equivalents` applies each one and exits 0 only when every check still passes, which is the proof that the argument holds):
#  - removing `e.stopPropagation()` alone: the field's handler then sees the bug's press, and its own `closest("[data-bug]")` guard returns before it counts a miss.
#  - removing that `closest("[data-bug]")` guard alone: the bug's handler stops the press, so the field's handler never sees it.
#  (each defence is enough alone, so `catch-is-also-a-miss` removes both.)
EQUIVALENT = [
    # the score only changes in a catch, and the catch handler draws the component again, which writes `{run.score}` into the same element: the per-frame write is a second way to the same text
    dict(id="score-not-shown", expect=["train-touch", "train-run"], kid_only=False, size="360x640@2", what="the score number is never written by the per-frame write",
         edits=[(TRAIN, "    if (scoreEl.current) scoreEl.current.textContent = String(run.score);\n    if (streakEl.current) streakEl.current.textContent = String(run.streak);\n  };", "    if (streakEl.current) streakEl.current.textContent = String(run.streak);\n  };")]),
    dict(id="stop-propagation-alone", expect=["train-touch"], kid_only=False, size="360x640@2", what="a bug's press is not stopped, the field's guard still holds",
         edits=[(TRAIN, "              e.stopPropagation(); // a catch is not also a miss on the field behind it\n", "")]),
    dict(id="bug-target-guard-alone", expect=["train-touch"], kid_only=False, size="360x640@2", what="the field does not look at what it was pressed on, the bug's stop still holds",
         edits=[(TRAIN, '    if ((e.target as Element).closest("[data-bug]")) return;\n', "")]),
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
        raise Stop("the copy differs from the repo before the run (delete $VERIFY_OUT/train-ui-copy to start again):\n" + diff_text)
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
