#!/usr/bin/env python3
"""Mutation runner for the SCREEN side of the shop's foods, the dishes (Broodkeep, A2.2b).

Works only on a copy of the repo at $VERIFY_OUT/dishes-ui-copy (never the real repo).
Each mutant is one or more exact text replaces in the copy. The copy is rebuilt, served by
`vite preview` on port 4180 (the only port this runner uses; 4180-4189 are reserved for it), and
the browser checker dishes-browser.mjs runs with only the check ids that the mutant must break.

Usage:
  python3 mutate-dishes-ui.py    --check-targets   verify each `old` occurs exactly once in the copy; print the table
  python3 mutate-dishes-ui.py                      clean baseline, every mutant, final clean rebuild

Exit codes: 0 every mutant CAUGHT and the final checks pass; 1 some mutant not caught, or a final check
failed; 2 the run stopped (copy out of sync, clean build failed its own checks, build or serve broke).

Edge cases this runner handles (each is a path in the code, not only a happy path):
  - an `old` text that occurs 0 or 2+ times: that mutant is ERROR and is not applied
  - a build that breaks for one mutant: ERROR for that mutant, the file is restored
  - a checker that hangs: killed by process group after 4 minutes, ERROR
  - a served page that is not the build just made: the run refuses to count that mutant (ERROR)
  - a server already answering on the port before ours starts: the run stops (exit 2) instead of testing the wrong server
  - the clean-build baseline and every mutant run the checker at ONE size (360x640@2, every check id in both modes for the baseline), not all six: the
    all-sizes proof for the clean build is a separate full run of dishes-browser.mjs (run-dishes.sh)
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
COPY = os.path.join(VERIFY_OUT, "dishes-ui-copy")
CHECKER = os.path.join(HERE, "dishes-browser.mjs")
LOGS = os.path.join(VERIFY_OUT, "mutate-dishes-ui-logs")
PORT = 4180  # ports 4180-4189 are this runner's; it uses 4180 only
SIZE = "360x640@2"
BUILD_TIMEOUT = 600
BASELINE_TIMEOUT = 1500
MUTANT_TIMEOUT = 240

ALL_IDS = [
    "tray-row", "tray-none", "tray-one-dish", "dish-feed", "dish-full", "dish-stale", "shop-buy-shows", "shop-undo-hides", "shop-preview-food",
    "reload-keeps", "fit-tray", "shop-foods-states",
]

BAR = "src/ui/ActionBar.tsx"
SHOP = "src/ui/ShopPanel.tsx"
DISHES = "src/game/dishes.ts"
AVAIL = "src/game/availability.ts"
STATE = "src/game/state.ts"
CSS = "src/ui/app.css"

# edits: (file, old, new), applied in order. `old` must occur exactly once in that file of the copy.
# expect: check ids that must FAIL for the mutant to count as caught. kid_only: the checker runs --modes kid. size: the window the checker runs at
# for this mutant, when it is not the default (a defect that only a 320 window can show).
MUTANTS = [
    dict(id="empty-dish-row-with-nothing-owned", expect=["tray-none"], kid_only=False,
         what="the dish row is drawn even when there is no dish to show (an empty group and an extra gap)",
         edits=[(BAR, '{tray === "food" && dishes.length > 0 && (', '{tray === "food" && (')]),
    dict(id="dish-row-for-a-young", expect=["tray-none"], kid_only=False,
         what="a young creature is offered the dishes too",
         edits=[(DISHES, 'if (getForm(c.formId).stage !== "kid" || !fieldOfForm(c.formId)) return [];', "if (!fieldOfForm(c.formId)) return [];")]),
    dict(id="dish-tap-feeds-the-plain-food", expect=["dish-feed"], kid_only=False,
         what="a dish button feeds the plain food (no boost, no recipe)",
         edits=[(BAR, "onClick={() => onFood(meal.eats, id)}", "onClick={() => onFood(meal.eats)}")]),
    dict(id="adult-precheck-without-the-dish", expect=["dish-stale"], kid_only=False,
         what="the Adult Mode pre-check asks about the plain food only, so a stale dish tap gets no words",
         edits=[(BAR, "feedRefusal(live, id, dish, game.save.owned)", "feedRefusal(live, id)")]),
    dict(id="dish-row-missing-in-kid-mode", expect=["tray-row"], kid_only=True,
         what="Kid Mode never shows the dish row",
         edits=[(BAR, '{tray === "food" && dishes.length > 0 && (', '{tray === "food" && adult && dishes.length > 0 && (')]),
    dict(id="recipe-marked-x2", expect=["tray-row"], kid_only=False,
         what="a recipe button shows the booster's x2 mark and no second food",
         edits=[(BAR, "{second ? (", "{false ? (")]),
    dict(id="booster-mark-without-x", expect=["tray-row"], kid_only=False,
         what="a booster button shows 2 and not x2",
         edits=[(BAR, "×{servings}", "{servings}")]),
    dict(id="one-dish-fills-the-row", expect=["tray-one-dish"], kid_only=False,
         what="the dish row has no rule of its own, so a single dish is stretched over the whole row",
         edits=[(CSS, ".tray.dishes {\n  grid-auto-flow: row;\n  grid-template-columns: repeat(5, minmax(0, 1fr));\n}", ".tray.dishes {\n}")]),
    dict(id="dish-row-wider-than-window", expect=["fit-tray"], kid_only=False,
         what="the dish row's five columns are 90 px each (482 px with the gaps)",
         edits=[(CSS, ".tray.dishes {\n  grid-auto-flow: row;\n  grid-template-columns: repeat(5, minmax(0, 1fr));", ".tray.dishes {\n  grid-auto-flow: row;\n  grid-template-columns: repeat(5, 90px);")]),
    dict(id="food-buttons-36px-high", expect=["fit-tray"], kid_only=False,
         what="the food and dish buttons are at most 36 px high (min-height wins over max-height in CSS, so the minimum goes too)",
         edits=[(CSS, ".btn.food {\n  min-height: 64px;", ".btn.food {\n  min-height: 0;\n  max-height: 36px;")]),
    dict(id="x2-text-runs-out-of-its-mark", expect=["fit-tray"], kid_only=False,
         what="the x2 mark is 10 px wide and does not wrap, so its text runs out of it",
         edits=[(CSS, ".btn.food.dish {\n  position: relative;\n}", ".btn.food.dish {\n  position: relative;\n}\n\n.btn.food.dish .count {\n  width: 10px;\n  min-width: 0;\n  padding: 0;\n  white-space: nowrap;\n}")]),
    dict(id="owned-line-says-owned-only", expect=["shop-buy-shows"], kid_only=False,
         what="a food card says Owned and not where to find it",
         edits=[(SHOP, '{item.kind === "food" ? "Owned: find it under Feed" : "Owned"}', "Owned")]),
    dict(id="food-card-previews-the-mat", expect=["shop-preview-food"], kid_only=False,
         what="the preview of any item that is not the Comfy Bed shows the Feeding Mat (a food's picture is the kitchen, where the mat is; the bed is not in that picture, so a bed in a food's preview cannot be seen and is not a mutant)",
         edits=[(SHOP, 'return { ...look, bed: look.bed || id === "comfy-bed", mat: look.mat || id === "feeding-mat" };', 'return { ...look, bed: look.bed || id === "comfy-bed", mat: look.mat || id !== "comfy-bed" };')]),
    dict(id="tray-keeps-the-first-owned-list", expect=["shop-undo-hides"], kid_only=False,
         what="the dish row reads the owned list once, when the action bar is first drawn, and never again: an undo replaces the list with a new one, so the old list still shows the dish (a buy pushes into the same list, so a buy alone does not show the stale read, as the run of 2026-11-24 found)",
         edits=[(BAR, "// The places a creature can be taken:", "let staleOwned: readonly string[] | null = null;\n// The places a creature can be taken:"),
                (BAR, "const dishes = dishesOf(c, game.save.owned);", "staleOwned ??= game.save.owned;\n  const dishes = dishesOf(c, staleOwned);")]),
    dict(id="tray-stays-open-after-a-dish", expect=["dish-feed"], kid_only=False,
         what="the tray does not close after a meal",
         edits=[(BAR, "const onFood = (id: FoodId, dish?: DishId): void => {\n    setTray(null);", "const onFood = (id: FoodId, dish?: DishId): void => {")]),
    dict(id="adult-feed-button-never-refused", expect=["dish-full"], kid_only=False,
         what="the Adult Mode Feed button is never refused, so a full creature's tap opens the tray and says nothing",
         edits=[(BAR, "const why = game.whyNot(feedButtonRefusal, feedReason);", "const why = null as string | null;")]),
    dict(id="dish-skips-the-full-line", expect=["dish-full"], kid_only=True,
         what="a dish is eaten even when the creature is full (Kid Mode has no pre-check, so only the action refuses)",
         edits=[(AVAIL, 'if (c.stats.hunger >= tuning.fullAtHunger) return "full";', 'if (dish === undefined && c.stats.hunger >= tuning.fullAtHunger) return "full";')]),
    dict(id="booster-counts-one", expect=["dish-feed"], kid_only=False,
         what="a booster counts 1 serving, not a whole cell",
         edits=[(DISHES, "counts: [[eats, tuning.growth.servingsPerFoodCell]]", "counts: [[eats, 1]]")]),
    dict(id="recipe-eats-its-second-food", expect=["dish-feed"], kid_only=False,
         what="a recipe is a meal of its second food, so the button feeds a food the dish does not name",
         edits=[(DISHES, "  return {\n    eats,\n    counts: [", "  return {\n    eats: plan[dish.also],\n    counts: [")]),
    dict(id="food-card-hides-its-reason", expect=["shop-foods-states"], kid_only=False,
         what="a food card that is short says nothing about what is missing",
         edits=[(SHOP, '{refusal === "poor" && <p class="shop-reason">', '{refusal === "poor" && item.kind !== "food" && <p class="shop-reason">')]),
    dict(id="food-effect-line-does-not-wrap", expect=["shop-foods-states"], kid_only=False,
         what="a card's effect line never wraps, so the long food lines run out of their cards",
         edits=[(CSS, ".shop-effect {\n  font-size: 0.92rem;\n  line-height: 1.4;\n  color: var(--ink-soft);\n  text-wrap: balance;\n}", ".shop-effect {\n  font-size: 0.92rem;\n  line-height: 1.4;\n  color: var(--ink-soft);\n  text-wrap: balance;\n  white-space: nowrap;\n}")]),
    dict(id="dish-row-has-a-big-top-margin", expect=["fit-tray"], kid_only=False,
         what="the dish row sits 20 px lower than it should, so it adds more than the one button row to the open tray",
         edits=[(CSS, ".tray.dishes {\n  grid-auto-flow: row;\n  grid-template-columns: repeat(5, minmax(0, 1fr));\n}", ".tray.dishes {\n  grid-auto-flow: row;\n  grid-template-columns: repeat(5, minmax(0, 1fr));\n  margin-top: 20px;\n}")]),
    dict(id="dish-row-covers-the-care-row", expect=["fit-tray"], kid_only=False,
         what="a layer 300 px high is fixed over the bottom of the window while the dish row is open, so the care buttons cannot be reached (it appears only with the dish row, so the tray still opens)",
         edits=[(CSS, ".tray.dishes {\n  grid-auto-flow: row;\n  grid-template-columns: repeat(5, minmax(0, 1fr));\n}", ".tray.dishes {\n  grid-auto-flow: row;\n  grid-template-columns: repeat(5, minmax(0, 1fr));\n}\n\n.actions:has(.tray.dishes)::after {\n  content: \"\";\n  position: fixed;\n  left: 0;\n  right: 0;\n  bottom: 0;\n  height: 300px;\n  z-index: 50;\n}")]),
    dict(id="dish-check-removed-from-the-rules", expect=["dish-stale"], kid_only=False,
         what="the rules no longer check that a dish is offered, so a stale dish tap eats a meal",
         edits=[(AVAIL, '  if (dish !== undefined && !(dishesOf(c, owned).includes(dish) && dishMeal(c, dish)?.eats === food)) return "off-menu";\n', "")]),
    dict(id="dish-check-removed-in-kid-mode", expect=["dish-stale"], kid_only=True,
         what="the rules no longer check that a dish is offered, so in Kid Mode (where nothing else asks first) a stale dish tap eats a meal",
         edits=[(AVAIL, '  if (dish !== undefined && !(dishesOf(c, owned).includes(dish) && dishMeal(c, dish)?.eats === food)) return "off-menu";\n', "")]),
    dict(id="dish-row-3px-right-at-360", expect=["fit-tray"], kid_only=False,
         what="the dish row is drawn 3 px to the right of its box (a shift the food row's 320 baseline must not hide, at a width where the food row fits)",
         edits=[(CSS, ".tray.dishes {\n  grid-auto-flow: row;\n  grid-template-columns: repeat(5, minmax(0, 1fr));\n}", ".tray.dishes {\n  grid-auto-flow: row;\n  grid-template-columns: repeat(5, minmax(0, 1fr));\n  position: relative;\n  left: 3px;\n}")]),
    dict(id="dish-row-3px-left-at-320", expect=["fit-tray"], kid_only=False, size="320x568@1",
         what="the dish row is drawn 3 px to the left of its box, at 320 where the food row already runs 4 px past its own (the baseline must not hide this)",
         edits=[(CSS, ".tray.dishes {\n  grid-auto-flow: row;\n  grid-template-columns: repeat(5, minmax(0, 1fr));\n}", ".tray.dishes {\n  grid-auto-flow: row;\n  grid-template-columns: repeat(5, minmax(0, 1fr));\n  position: relative;\n  left: -3px;\n}")]),
    dict(id="dish-row-3px-right-at-320", expect=["fit-tray"], kid_only=False, size="320x568@1",
         what="the dish row is drawn 3 px to the right of its box at 320",
         edits=[(CSS, ".tray.dishes {\n  grid-auto-flow: row;\n  grid-template-columns: repeat(5, minmax(0, 1fr));\n}", ".tray.dishes {\n  grid-auto-flow: row;\n  grid-template-columns: repeat(5, minmax(0, 1fr));\n  position: relative;\n  left: 3px;\n}")]),
    dict(id="food-row-fits-no-more-at-320", expect=["fit-tray"], kid_only=False, size="320x568@1",
         what="the food row's buttons end 8 px past its box at 320 (the baseline literal is 4)",
         edits=[(CSS, ".tray {\n  grid-auto-flow: column;\n  grid-auto-columns: 1fr;\n}", ".tray {\n  grid-auto-flow: column;\n  grid-auto-columns: minmax(52.8px, 1fr);\n}")]),
    dict(id="dish-row-shows-four-dishes", expect=["fit-tray"], kid_only=False,
         what="the dish row stops at four buttons for a kid that owns all five",
         edits=[(BAR, "{dishes.map((id) => {\n            const meal = dishMeal(c, id)!;", "{dishes.slice(0, 4).map((id) => {\n            const meal = dishMeal(c, id)!;")]),
    dict(id="tray-has-no-column-gap", expect=["fit-tray"], kid_only=False,
         what="the trays have no column gap (the computed gap is not a length), so a check that divides the row by it would pass on NaN",
         edits=[(CSS, ".care,\n.tray {\n  display: grid;\n  gap: 8px;\n}", ".care {\n  display: grid;\n  gap: 8px;\n}\n\n.tray {\n  display: grid;\n}")]),
    dict(id="load-forgets-what-was-bought", expect=["reload-keeps"], kid_only=False,
         what="a loaded game owns nothing",
         edits=[(STATE, "value.owned = Array.isArray(value.owned) ? [...new Set(value.owned.filter(isItemId))] : [];", "value.owned = [];")]),
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
        gen = subprocess.run([os.path.join(HERE, "gen-saves-dishes.sh")], capture_output=True, text=True)
        if gen.returncode != 0:
            raise Stop("gen-saves-dishes.sh failed:\n" + gen.stdout[-800:] + gen.stderr[-800:])
    ensure_copy()
    same, diff_text = copy_matches_real()
    if not same:
        raise Stop("the copy differs from the repo before the run (delete $VERIFY_OUT/dishes-ui-copy to start again):\n" + diff_text)
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
    ok = counts["CAUGHT"] == len(results) and final_ok
    print("RUN OK" if ok else "RUN NOT OK", flush=True)
    return 0 if ok else 1


def main():
    ap = argparse.ArgumentParser(description="Mutation runner for the dish screen checks (A2.2b).")
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
