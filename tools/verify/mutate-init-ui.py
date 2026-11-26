#!/usr/bin/env python3
"""Mutation runner for the SCREEN side of Initiatives (Broodkeep, A3.3): the bubble's draw and hit test, the tap and hold handling, the open-panel gate, the canvas attributes, the accessible
name, the feed tray and a craving, Kid Mode and the layout of the note and the Bond card. (The rules and the Game wiring are mutated by mutate-init-unit.py.)

Works only on a copy of the repo at $VERIFY_OUT/init-ui-copy (never the real repo).
Each mutant is one or more exact text replaces in the copy. The copy is rebuilt, served by
`vite preview` on port 4180 (the only port this runner uses; 4180-4189 are reserved for it), and
the browser checker init-browser.mjs runs with only the check ids that the mutant must break, at the window size the mutant names.

Usage:
  python3 mutate-init-ui.py    --check-targets   verify each `old` occurs exactly once in the copy; print the table
  python3 mutate-init-ui.py                      clean baseline, every mutant, final clean rebuild
  python3 mutate-init-ui.py    --equivalents     clean baseline, then the EQUIVALENT mutants: every check must still pass (SURVIVED) for the run to be OK

Exit codes: 0 every mutant CAUGHT (with --equivalents: every one SURVIVED) and the final checks pass; 1 some mutant not as expected, or a final check
failed; 2 the run stopped (copy out of sync, clean build failed its own checks, build or serve broke).

Edge cases this runner handles (each is a path in the code, not only a happy path):
  - an `old` text that occurs 0 or 2+ times: that mutant is ERROR and is not applied
  - a build that breaks for one mutant: ERROR for that mutant, the file is restored
  - a checker that hangs: killed by process group after 7 minutes, ERROR
  - a served page that is not the build just made: the run refuses to count that mutant (ERROR)
  - a server already answering on the port before ours starts: the run stops (exit 2) instead of testing the wrong server
  - the clean-build baseline runs every check id at ONE size (360x640@2, both modes); a mutant runs only the ids it must break, at its own size: the
    all-sizes proof for the clean build is a separate full run of init-browser.mjs (run-init.sh)
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
COPY = os.path.join(VERIFY_OUT, "init-ui-copy")
CHECKER = os.path.join(HERE, "init-browser.mjs")
LOGS = os.path.join(VERIFY_OUT, "mutate-init-ui-logs")
PORT = 4180  # ports 4180-4189 are this runner's; it uses 4180 only
SIZE = "360x640@2"
BUILD_TIMEOUT = 600
BASELINE_TIMEOUT = 2400
MUTANT_TIMEOUT = 420

ALL_IDS = ["init-appear", "init-ignore", "init-play", "init-gift", "init-craving", "init-gate", "init-kid", "init-hit", "init-reload", "init-a11y", "init-fit", "init-view", "init-field"]

STAGE = "src/ui/Stage.tsx"
APP = "src/ui/App.tsx"
ACTION = "src/ui/ActionBar.tsx"
SCENE = "src/art/scene.ts"
GAME = "src/ui/game.ts"
HUD = "src/game/hud.ts"
CSS = "src/ui/app.css"

# edits: (file, old, new), applied in order. `old` must occur exactly once in that file of the copy.
# expect: check ids that must FAIL for the mutant to count as caught (the first real run confirms each one). kid_only: the checker runs --modes kid. size: the window the checker runs at.
MUTANTS = [
    # --- the gate: what stops an offer
    dict(id="menu-open-never-written", expect=["init-gate"], kid_only=False, size="360x640@2", what="an open panel does not tell the game (menuOpen stays false)",
         edits=[(APP, "game.menuOpen = panel !== null;", "game.menuOpen = false;")]),
    dict(id="open-tray-blocks", expect=["init-craving"], kid_only=False, size="360x640@2", what="an open feed tray stops the offers (the craving is gone while a player picks a food)",
         edits=[(ACTION, '  const [tray, setTray] = useState<"food" | "places" | null>(null); // which little list is open above the buttons',
                 '  const [tray, setTray] = useState<"food" | "places" | null>(null); // which little list is open above the buttons\n  game.menuOpen = tray !== null;')]),
    dict(id="kid-mode-gets-offers", expect=["init-kid"], kid_only=True, size="360x640@2", what="Kid Mode is not stopped by the Adult Mode check",
         edits=[(GAME, 'if (!isAdultMode(this.save) || this.save.phase !== "alive" || !c) return true;', 'if (this.save.phase !== "alive" || !c) return true;')]),
    dict(id="out-of-view-still-offers", expect=["init-view"], kid_only=False, size="360x640@2", what="the Stage tells the game the creature is always in the camera's view",
         edits=[(STAGE, "game.view.inView = visible;", "game.view.inView = true;")]),
    # --- the touch handling
    dict(id="bubble-hold-pets", expect=["init-craving"], kid_only=False, size="360x640@2", what="a finger held on a bubble starts the petting timer like one held on the creature",
         edits=[(STAGE, "        hold.current = { id: e.pointerId, petted: false, bubble: true }; // (no petting timer: a tap answers it)\n        return;",
                 "        const hb: Hold = { id: e.pointerId, petted: false, bubble: true };\n        hb.timer = window.setTimeout(() => pet(hb), 450);\n        hold.current = hb;\n        return;")]),
    dict(id="creature-before-bubble-home", expect=["init-craving", "init-hit"], kid_only=False, size="360x640@2", what="in the home a touch where the creature's zone and the bubble overlap goes to the creature",
         edits=[(STAGE, "      if (isOnBubble(e)) {\n        endHold();\n        hold.current = { id: e.pointerId, petted: false, bubble: true };", "      if (isOnBubble(e) && !isOnTarget(e)) {\n        endHold();\n        hold.current = { id: e.pointerId, petted: false, bubble: true };")]),
    dict(id="creature-before-bubble-field", expect=["init-field"], kid_only=False, size="360x640@2", what="in the one-line picture a touch where the creature's zone and the bubble overlap goes to the creature",
         edits=[(STAGE, "    const onBall = isOnBubble(e);\n    if (!onBall && !isOnTarget(e)) return;", "    const onBall = isOnBubble(e) && !isOnTarget(e);\n    if (!onBall && !isOnTarget(e)) return;")]),
    dict(id="craving-tap-falls-through", expect=["init-craving"], kid_only=False, size="360x640@2", what="a craving has no bubble for the touch (the creature under its lower edge is petted)",
         edits=[(STAGE, "  if (!i || !c || c.call || c.sleep || c.job) return null;\n  return bubbleBox(", '  if (!i || i.kind === "craving" || !c || c.call || c.sleep || c.job) return null;\n  return bubbleBox(')]),
    dict(id="bubble-tap-also-pokes", expect=["init-play"], kid_only=False, size="360x640@2", what="a tap on the ball also reaches the creature's poke and tickle count",
         edits=[(STAGE, "        return; // ...and a bubble tap never pokes or counts toward a tickle\n", "")]),
    dict(id="home-drag-answers", expect=["init-hit"], kid_only=False, size="360x640@2", what="in the home a drag that began on the ball answers it when the finger lifts",
         edits=[(STAGE, "        if (result.tap) answer(); // (a drag that began on the bubble answers nothing)", "        answer();")]),
    dict(id="field-release-elsewhere-answers", expect=["init-field"], kid_only=False, size="360x640@2", what="in the one-line picture a finger that left the ball answers it when it lifts",
         edits=[(STAGE, "      if (isOnBubble(e)) answer(); // (the one-line picture has no pan: a finger that has left the bubble answers nothing)", "      answer();")]),
    # --- what the canvas says (for the checks, and for a screen reader)
    dict(id="kind-attribute-left-empty", expect=["init-appear"], kid_only=False, size="360x640@2", what="data-initiative is set to an empty text instead of being removed",
         edits=[(STAGE, 'kind === null ? cv.removeAttribute("data-initiative") : cv.setAttribute("data-initiative", kind);', 'cv.setAttribute("data-initiative", kind ?? "");')]),
    dict(id="bubble-attribute-kept", expect=["init-appear"], kid_only=False, size="360x640@2", what="data-bubble is never removed after the offer is gone",
         edits=[(STAGE, 'box === null ? cv.removeAttribute("data-bubble") : cv.setAttribute("data-bubble", box);', 'box === null ? undefined : cv.setAttribute("data-bubble", box);')]),
    dict(id="bubble-attribute-ignores-the-camera", expect=["init-appear", "init-play"], kid_only=False, size="360x640@2", what="data-bubble leaves the home camera's shift out (it points at the wrong place)",
         edits=[(STAGE, "box = [(b.x * zoom + tx) * css,", "box = [(b.x * zoom) * css,")]),
    dict(id="bubble-drawn-4-px-right", expect=["init-appear"], kid_only=False, size="360x640@2", what="the picture draws the bubble 4 game pixels right of the box the hit test and the attribute use",
         edits=[(SCENE, "drawBubble(ctx, view.invite, at.x, at.y + (Math.floor(view.clock * 2) % 2));", "drawBubble(ctx, view.invite, at.x + 4, at.y + (Math.floor(view.clock * 2) % 2));")]),
    dict(id="play-says-toy", expect=["init-a11y", "init-appear"], kid_only=False, size="360x640@2", what="the accessible name of a play does not say a ball",
         edits=[(STAGE, "is holding out a ball. Tap it to play.", "is holding out a toy.")]),
    dict(id="gift-says-it", expect=["init-a11y", "init-gift"], kid_only=False, size="360x640@2", what="the accessible name of a gift does not say to tap it",
         edits=[(STAGE, "found something. Tap it to take it.", "found it.")]),
    dict(id="craving-says-food", expect=["init-a11y", "init-craving"], kid_only=False, size="360x640@2", what="the accessible name of a craving does not say which food",
         edits=[(STAGE, " ${name} wants ${foods[i.food as FoodId].name.toLowerCase()}.", " ${name} wants food.")]),
    # --- the craving's feed
    dict(id="any-food-answers-a-craving", expect=["init-craving"], kid_only=False, size="360x640@2", what="a meal of any food answers a craving",
         edits=[(GAME, 'const answers = i !== null && i.kind === "craving" && i.food === food && !this.initiativeBlocked();', 'const answers = i !== null && i.kind === "craving" && !this.initiativeBlocked();')]),
    dict(id="craving-feed-pays-nothing", expect=["init-craving"], kid_only=False, size="360x640@2", what="the meal a craving asked for ends it but pays no Bond XP",
         edits=[(GAME, '      if (r === "ate" && answers) levelUp = payBond(save, save.creature!, initiativeTuning.cravingXp, now);', '      if (r === "ate" && answers) levelUp = null;')]),
    dict(id="answered-craving-stays", expect=["init-craving"], kid_only=False, size="360x640@2", what="the craving stays on the screen after the meal it asked for",
         edits=[(GAME, '    if (result === "ate" && answers) this.dropInitiative();', "")]),
    # --- ignoring, and a reload (these two edit the Game, which the page is built from)
    dict(id="fading-gift-is-paid", expect=["init-ignore"], kid_only=False, size="360x640@2", what="a gift nobody took is paid to the player when it fades (the check ignores everything: its offers are all gifts)",
         edits=[(GAME, "    if (i && (i.bornAt !== c.bornAt || isOver(i, this.initiativeClock) || isMoot(i, c))) this.dropInitiative();",
                 "    if (i && i.kind === \"gift\" && isOver(i, this.initiativeClock)) this.act((save, now) => payGift(save, i.gift!, now));\n    if (i && (i.bornAt !== c.bornAt || isOver(i, this.initiativeClock) || isMoot(i, c))) this.dropInitiative();")]),
    dict(id="first-wait-is-zero", expect=["init-reload", "init-appear"], kid_only=False, size="360x640@2", what="a game that has just loaded makes its first offer at once",
         edits=[(GAME, "    if (this.initiativeWait === null) this.initiativeWait = nextDelay(this.rand);\n    if (!this.view.inView) return;", "    if (this.initiativeWait === null) this.initiativeWait = 0;\n    if (!this.view.inView) return;")]),
    # --- the layout
    dict(id="note-pushed-off-the-picture", expect=["init-fit"], kid_only=False, size="320x568@1", what="the note over the picture starts 260 px in",
         edits=[(CSS, ".reason {\n  margin: 0;\n  max-width: 100%;", ".reason {\n  margin: 0 0 0 260px;\n  max-width: 100%;")]),
    dict(id="bond-card-pushed-off", expect=["init-fit"], kid_only=False, size="320x568@1", what="the lines of the Bond card start 300 px in",
         edits=[(CSS, ".astat-card p {\n  margin: 0;\n  font-size: 0.85rem;", ".astat-card p {\n  margin: 0 0 0 300px;\n  font-size: 0.85rem;")]),
    dict(id="bond-card-no-preference", expect=["init-fit"], kid_only=False, size="360x640@2", what="the Bond card does not say what the creature prefers",
         edits=[(HUD, '"Poke: gets attention.", preferenceLine(c));', '"Poke: gets attention.");')]),
]

# Not mutated, because no check reads it (these are blind spots of the browser run, listed in docs/known-issues.md; the contact sheet shows them): the hop and sparkles after an answer, the
# level-up burst after a craving's meal, the header cards over a bubble (the Bond card does not block an offer: the sheet's bond-card pictures), the meal on the plate stopping the offers (the
# unit tests of the Game own it), the draw order of an initiative against a call (the Game never has both).
# Not mutated (each argued from the code; `--equivalents` applies each one and exits 0 only when every check still passes, which is the proof that the argument holds):
EQUIVALENT = [
    # the slack is 14 CSS pixels in the home and 6 game pixels in a field; a startle lifts the bubble 8 game pixels at the most, so a test at the box's own place still takes every touch inside the
    # lifted box except a 2 pixel sliver at its top, and the checks tap its middle
    dict(id="hit-test-without-the-pose", expect=["init-hit"], kid_only=False, size="360x640@2", what="the hit test places the bubble as if the creature were standing still",
         edits=[(STAGE, "  return bubbleBox(game.view, sizeOf(game.save), spotsOf(game.view.world).w);\n}", '  return bubbleBox({ ...game.view, pose: "idle", poseTime: 0 }, sizeOf(game.save), spotsOf(game.view.world).w);\n}')]),
    # every check taps inside the box, most of them in its middle
    dict(id="hit-test-without-slack", expect=["init-hit", "init-play"], kid_only=False, size="360x640@2", what="a touch counts on the bubble only inside its box",
         edits=[(STAGE, "return !!at && !!box && at.x >= box.x - at.pad && at.x <= box.x + box.w + at.pad && at.y >= box.y - at.pad && at.y <= box.y + box.h + at.pad;", "return !!at && !!box && at.x >= box.x && at.x <= box.x + box.w && at.y >= box.y && at.y <= box.y + box.h;")]),
    # a call stops an offer in the Game at its next tick, so the two are on the screen together for under a second; no check has a call
    dict(id="label-says-offer-during-a-call", expect=["init-a11y"], kid_only=False, size="360x640@2", what="the accessible name says the offer even while a call is on",
         edits=[(STAGE, '  if (!i || !c || c.call) return "";\n  if (i.kind === "play")', '  if (!i || !c) return "";\n  if (i.kind === "play")')]),
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
        raise Stop("the copy differs from the repo before the run (delete $VERIFY_OUT/init-ui-copy to start again):\n" + diff_text)
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
    ap = argparse.ArgumentParser(description="Mutation runner for the Initiatives screen checks (A3.3).")
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
