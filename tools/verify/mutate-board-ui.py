#!/usr/bin/env python3
"""Mutation runner for the SCREEN side of the request board (Broodkeep, A2.3, docs/adult-a2-plan.md section 11, "Mutation targets").

Works only on a copy of the repo at $VERIFY_OUT/board-ui-copy (never the real repo).
Each mutant is one or more exact text replaces in the copy. The copy is rebuilt, served by
`vite preview` on port 4181 (the only port this runner uses; 4180-4189 are reserved for the mutation runners), and
the browser checker board-browser.mjs runs with only the check ids that the mutant must break.

Usage:
  python3 mutate-board-ui.py    --check-targets   verify each `old` occurs exactly once in the copy; print the table
  python3 mutate-board-ui.py                      clean baseline, every mutant, final clean rebuild

Exit codes: 0 every mutant CAUGHT and the final checks pass; 1 some mutant not caught, or a final check
failed; 2 the run stopped (copy out of sync, clean build failed its own checks, build or serve broke).

The edge cases it handles are the shop runner's (mutate-shop-ui.py): an `old` that occurs 0 or 2+ times is ERROR and not applied; a build that
breaks, a checker that hangs (killed by process group), a served page that is not the build just made, a server already answering on the port, a
checker exit 1 whose FAIL lines name only other ids (CAUGHT-BY-OTHER), exit 1 with no FAIL line (ERROR), exit 0 (SURVIVED); every mutant runs the
checker at ONE size (360x640@2, or the mutant's own `size`), and the clean baseline runs at 360x640@2 and at each size a mutant names; the all-sizes proof of the clean build is run-board.sh; Ctrl-C or SIGTERM restores the file under
edit and stops the servers; the final clean rebuild must equal the first one and the copy's src/ must equal the real src/.
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
COPY = os.path.join(VERIFY_OUT, "board-ui-copy")
CHECKER = os.path.join(HERE, "board-browser.mjs")
LOGS = os.path.join(VERIFY_OUT, "mutate-board-ui-logs")
PORT = 4181  # ports 4180-4189 are the mutation runners'; this one uses 4181 only
SIZE = "360x640@2"
BUILD_TIMEOUT = 600
BASELINE_TIMEOUT = 1500
MUTANT_TIMEOUT = 240

ALL_IDS = ["board-tab", "board-cards", "board-fit", "board-tap", "board-live", "board-note", "board-kid"]

SHOP = "src/ui/ShopPanel.tsx"
TAB = "src/ui/RequestsTab.tsx"
NAV = "src/ui/Nav.tsx"
GAME = "src/ui/game.ts"
REQ = "src/game/requests.ts"
ACT = "src/game/actions.ts"
CSS = "src/ui/app.css"

# edits: (file, old, new), applied in order. `old` must occur exactly once in that file of the copy.
# expect: check ids that must FAIL for the mutant to count as caught. kid_only: the checker runs --modes kid. size: the one window the checker runs
# at for this mutant (default SIZE, 360x640@2): a mutant that only breaks the layout at 320 wide names 320x568@2.
MUTANTS = [
    dict(id="tab-opens-on-requests", expect=["board-tab"], kid_only=False,
         what="the shop opens on the Requests tab",
         edits=[(SHOP, 'useState<"items" | "requests">("items")', 'useState<"items" | "requests">("requests")')]),
    dict(id="tab-not-marked-pressed", expect=["board-tab"], kid_only=False,
         what="the Requests button never says it is pressed",
         edits=[(SHOP, 'aria-pressed={tab === "requests"}', "aria-pressed={false}")]),
    dict(id="tab-button-dead", expect=["board-tab"], kid_only=False,
         what="the Requests button shows nothing",
         edits=[(SHOP, 'onClick={() => setTab("requests")}', "onClick={() => undefined}")]),
    dict(id="undo-missing-on-requests", expect=["board-tab"], kid_only=False,
         what="the Undo bar is only on the Items tab",
         edits=[(SHOP, "            {undoBar}\n            <RequestsTab game={game} />", "            <RequestsTab game={game} />")]),
    dict(id="card-missing", expect=["board-cards"], kid_only=False,
         what="the first open request has no card",
         edits=[(TAB, "{board.open.map((r) => (", "{board.open.slice(1).map((r) => (")]),
    dict(id="item-line-removed", expect=["board-cards"], kid_only=False,
         what="a request's item reward is not shown",
         edits=[(TAB, "{item !== null && (", "{false && (")]),
    dict(id="done-slot-text-removed", expect=["board-cards"], kid_only=False,
         what="a done slot does not say when the next request comes",
         edits=[(TAB, '<span class="req-progress">Next request in {minutesToNext(w.doneAt, now)} min</span>', '<span class="req-progress"></span>')]),
    dict(id="bonus-mark-missing", expect=["board-cards"], kid_only=False,
         what="the oldest request shows no 25% mark",
         edits=[(TAB, '{bonus && <span class="req-bonus">', '{false && <span class="req-bonus">')]),
    dict(id="undo-note-missing", expect=["board-cards"], kid_only=False,
         what="a purchase request does not say it counts when the undo is over",
         edits=[(TAB, '{waitingForUndo && <span class="req-note">', '{false && <span class="req-note">')]),
    dict(id="bar-never-filled", expect=["board-cards"], kid_only=False,
         what="the progress bar is always empty",
         edits=[(TAB, "translateX(${(Math.min(1, r.have / need) - 1) * 100}%)", "translateX(-100%)")]),
    dict(id="coins-shown-wrong", expect=["board-cards"], kid_only=False,
         what="every card shows one coin too many",
         edits=[(TAB, '<Icon name="coin" px={20} />+{coins}', '<Icon name="coin" px={20} />+{coins + 1}')]),
    dict(id="empty-slots-not-shown", expect=["board-cards"], kid_only=False,
         what="a slot waiting for its next request shows no card",
         edits=[(TAB, "{Array.from({ length: empty }, (_, i) => (", "{Array.from({ length: 0 }, (_, i) => (")]),
    dict(id="title-runs-out-of-its-card", expect=["board-fit"], kid_only=False,
         what="a request's title is big and does not wrap",
         edits=[(CSS, ".req-title {\n  font-size: 1.05rem;", ".req-title {\n  white-space: nowrap;\n  font-size: 1.8rem;")]),
    dict(id="card-wider-than-window", expect=["board-fit"], kid_only=False,
         what="every request card is 420 px wide at least",
         edits=[(CSS, ".req-card {\n  --card-edge: #8d7bc6;\n  display: grid;", ".req-card {\n  --card-edge: #8d7bc6;\n  min-width: 420px;\n  display: grid;")]),
    dict(id="card-wider-than-a-320-window", expect=["board-fit"], kid_only=False, size="320x568@2",
         what="every request card is 310 px wide at least: by arithmetic (not run) it fits a 360 wide window (328 px of room, the card ends at x=326) and it crosses the edge of a 320 wide one (288 px of room, ends at x=326 of 320), so only the 320 run can see it; the clean build is run at 320x568@2 first",
         edits=[(CSS, ".req-card {\n  --card-edge: #8d7bc6;\n  display: grid;", ".req-card {\n  --card-edge: #8d7bc6;\n  min-width: 310px;\n  display: grid;")]),
    dict(id="tab-buttons-short", expect=["board-tap"], kid_only=False,
         what="the two tab buttons are at most 32 px high",
         edits=[(CSS, ".shop-tabs {\n  display: grid;", ".shop-tabs .btn {\n  min-height: 0;\n  max-height: 32px;\n}\n\n.shop-tabs {\n  display: grid;")]),
    dict(id="card-has-a-button", expect=["board-tap"], kid_only=False,
         what="a request card has a button in it",
         edits=[(TAB, "<Reward coins={coinsFor(save.board, r, now)} item={r.item} bonus={bonus} />", '<Reward coins={coinsFor(save.board, r, now)} item={r.item} bonus={bonus} /><button class="btn small">Collect</button>')]),
    dict(id="request-pays-no-coins", expect=["board-live"], kid_only=False,
         what="a finished request pays no coins",
         edits=[(REQ, "  save.coins += coins;\n", "")]),
    dict(id="refill-ten-minutes-late", expect=["board-live"], kid_only=False,
         what="a finished slot waits 25 minutes, not 15",
         edits=[(REQ, "t < w.doneAt + requestTuning.refillMinutes * MINUTE", "t < w.doneAt + (requestTuning.refillMinutes + 10) * MINUTE")]),
    dict(id="meal-not-counted", expect=["board-live", "board-note"], kid_only=False,
         what="a meal in the room counts toward no request",
         edits=[(ACT, '  noteRequest(save, { kind: "feed", food: foodId }, nowMs); // a dish meal is a meal of its food\n', "")]),
    dict(id="note-never-said", expect=["board-note"], kid_only=False,
         what="the note over the room is never said",
         edits=[(GAME, "if (done > this.seenDone) this.say(", "if (done > this.seenDone && false) this.say(")]),
    dict(id="announce-not-called", expect=["board-note"], kid_only=False,
         what="the game never looks at what was paid",
         edits=[(GAME, "    this.announceRequests();\n    const c = this.save.creature;", "    const c = this.save.creature;")]),
    dict(id="kid-gets-the-shop", expect=["board-kid"], kid_only=True,
         what="Kid Mode gets the Shop button, and with it the tab",
         edits=[(NAV, '{adult && (\n        <button class="btn nav-btn labelled" aria-label="Shop"', '{(\n        <button class="btn nav-btn labelled" aria-label="Shop"')]),
    dict(id="kid-meals-count", expect=["board-kid"], kid_only=True,
         what="a Kid Mode meal counts toward a saved request and pays it",
         edits=[(REQ, "  if (!adultOn(save)) return;\n  const target = event.kind", "  const target = event.kind")]),
    dict(id="kid-note-shown", expect=["board-kid"], kid_only=True,
         what="Kid Mode counts a meal toward a saved request and says so over the room (the note's Adult Mode guard and the counting's are both gone)",
         edits=[(GAME, 'if (!isAdultMode(this.save) || text === "") return;', 'if (text === "") return;'),
                (REQ, "  if (!adultOn(save)) return;\n  const target = event.kind", "  const target = event.kind")]),
    dict(id="kid-board-runs", expect=["board-kid"], kid_only=True,
         what="the board runs in Kid Mode: the slots refill and draw",
         edits=[(REQ, 'if (!adultOn(save) || save.phase !== "alive" || !c) return;', 'if (save.phase !== "alive" || !c) return;')]),
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
        gen = subprocess.run([os.path.join(HERE, "gen-saves-board.sh")], capture_output=True, text=True)
        if gen.returncode != 0:
            raise Stop("gen-saves-board.sh failed:\n" + gen.stdout[-800:] + gen.stderr[-800:])
    ensure_copy()
    same, diff_text = copy_matches_real()
    if not same:
        raise Stop("the copy differs from the repo before the run (delete $VERIFY_OUT/board-ui-copy to start again):\n" + diff_text)
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
        rc, text = run_checker(base.base, ALL_IDS, None, BASELINE_TIMEOUT, base_log)
        # A mutant that names its own window (size) is only caught by its edit if the clean build passes in that window too.
        extra_rcs = []
        for other in sorted({m["size"] for m in MUTANTS if m.get("size", SIZE) != SIZE}) if rc == 0 else []:  # (a failed first baseline stops the run below)
            log = os.path.join(LOGS, "baseline-" + other.replace("@", "-") + ".log")
            extra_rcs.append((other, log, run_checker(base.base, ALL_IDS, None, BASELINE_TIMEOUT, log, other)[0]))
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
    ap = argparse.ArgumentParser(description="Mutation runner for the request board screen checks (A2.3).")
    ap.add_argument("--check-targets", action="store_true",
                    help="only verify that each old text occurs exactly once in the copy, and print the table")
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
