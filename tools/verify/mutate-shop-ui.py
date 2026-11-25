#!/usr/bin/env python3
"""Mutation runner for the SCREEN side of the shop (Broodkeep, A2.2a).

Works only on a copy of the repo at $VERIFY_OUT/shop-ui-copy (never the real repo).
Each mutant is one or more exact text replaces in the copy. The copy is rebuilt, served by
`vite preview` on port 4180 (the only port this runner uses; 4180-4189 are reserved for it), and
the browser checker shop-browser.mjs runs with only the check ids that the mutant must break.

Usage:
  python3 mutate-shop-ui.py    --check-targets   verify each `old` occurs exactly once in the copy; print the table
  python3 mutate-shop-ui.py                      clean baseline, every mutant, final clean rebuild

Exit codes: 0 every mutant CAUGHT and the final checks pass; 1 some mutant not caught, or a final check
failed; 2 the run stopped (copy out of sync, clean build failed its own checks, build or serve broke).

Edge cases this runner handles (each is a path in the code, not only a happy path):
  - an `old` text that occurs 0 or 2+ times: that mutant is ERROR and is not applied
  - a build that breaks for one mutant: ERROR for that mutant, the file is restored
  - a checker that hangs: killed by process group after 4 minutes, ERROR
  - a served page that is not the build just made: the run refuses to count that mutant (ERROR)
  - a server already answering on the port before ours starts: the run stops (exit 2) instead of testing the wrong server
  - the clean-build baseline and every mutant run the checker at ONE size (360x640@2, every check id in both modes for the baseline), not all six: the
    all-sizes proof for the clean build is a separate full run of shop-browser.mjs (run-shop.sh)
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
COPY = os.path.join(VERIFY_OUT, "shop-ui-copy")
CHECKER = os.path.join(HERE, "shop-browser.mjs")
LOGS = os.path.join(VERIFY_OUT, "mutate-shop-ui-logs")
PORT = 4180  # ports 4180-4189 are this runner's; it uses 4180 only
SIZE = "360x640@2"
BUILD_TIMEOUT = 600
BASELINE_TIMEOUT = 1500
MUTANT_TIMEOUT = 240

ALL_IDS = [
    "nav-shop", "open-close", "buy-exact", "buy-poor", "double-tap", "undo-live", "preview-room", "room-looks", "hud-bed", "reload-keeps",
    "fit-scroll", "fit-clip", "fit-tap", "btn-look", "hat-wear", "hat-preview", "hat-places", "hat-reload", "hat-bed", "hat-kid",
]

NAV = "src/ui/Nav.tsx"
SHOP = "src/ui/ShopPanel.tsx"
RULES = "src/game/shop.ts"
ROOM = "src/art/room.ts"
SCENE = "src/art/scene.ts"
HUD = "src/ui/AdultHud.tsx"
CARE = "src/game/care.ts"
STATE = "src/game/state.ts"
CSS = "src/ui/app.css"
HABITAT = "src/art/habitat.ts"
ARENA = "src/art/arena.ts"

# edits: (file, old, new), applied in order. `old` must occur exactly once in that file of the copy.
# expect: check ids that must FAIL for the mutant to count as caught. kid_only: the checker runs --modes kid.
MUTANTS = [
    dict(id="nav-shop-in-kid", expect=["nav-shop"], kid_only=True,
         what="Kid Mode gets the Shop button too",
         edits=[(NAV, '{adult && (\n        <button class="btn nav-btn labelled" aria-label="Shop"', '{(\n        <button class="btn nav-btn labelled" aria-label="Shop"')]),
    dict(id="nav-shop-word-missing", expect=["nav-shop"], kid_only=False,
         what="the Shop button has an icon and no word under it",
         edits=[(NAV, '<Icon name="shop" px={32} />\n          <Word text="Shop" />', '<Icon name="shop" px={32} />')]),
    dict(id="nav-shop-button-dead", expect=["open-close"], kid_only=False,
         what="the Shop button opens nothing",
         edits=[(NAV, "onClick={onShop}", "onClick={() => undefined}")]),
    dict(id="nav-buttons-38px-high", expect=["nav-shop"], kid_only=False,
         what="the nav buttons are 38 px high (min-height wins over max-height in CSS, so the minimum goes too)",
         edits=[(CSS, ".nav-btn {\n  min-height: 52px;", ".nav-btn {\n  min-height: 0;\n  max-height: 38px;")]),
    dict(id="nav-wider-than-window", expect=["nav-shop"], kid_only=False,
         what="the four nav buttons are 90 px wide each (384 px with the gaps)",
         edits=[(CSS, '.nav[data-adult="true"] {\n  grid-template-columns: repeat(4, minmax(0, 1fr));', '.nav[data-adult="true"] {\n  grid-template-columns: repeat(4, 90px);')]),
    dict(id="close-does-nothing", expect=["open-close"], kid_only=False,
         what="the Close button does not close the shop",
         edits=[(SHOP, '<button class="btn small" ref={closeRef} onClick={onClose}>', '<button class="btn small" ref={closeRef} onClick={() => undefined}>')]),
    dict(id="cards-in-reverse-order", expect=["open-close"], kid_only=False,
         what="the item cards are listed last to first",
         edits=[(SHOP, "{itemIds.map((id) => (", "{[...itemIds].reverse().map((id) => (")]),
    dict(id="buy-buys-the-wrong-item", expect=["buy-exact"], kid_only=False,
         what="every Buy button buys the Dusk wallpaper",
         edits=[(SHOP, "game.act((s, now) => buy(s, id, now))", 'game.act((s, now) => buy(s, "wall-dusk", now))')]),
    dict(id="poor-buy-not-marked-disabled", expect=["buy-poor"], kid_only=False,
         what="a Buy button that cannot be afforded is not aria-disabled",
         edits=[(SHOP, "aria-disabled={refusal !== null ? true : undefined}", "aria-disabled={undefined}")]),
    dict(id="poor-reason-not-shown", expect=["buy-poor"], kid_only=False,
         what="a card that cannot be afforded does not say what is missing",
         edits=[(SHOP, '{refusal === "poor" && <p class="shop-reason">', '{false && <p class="shop-reason">')]),
    dict(id="buy-does-not-check-again", expect=["double-tap"], kid_only=False,
         what="buy() trusts the screen: a second tap on the same Buy button charges again",
         edits=[(RULES, "  const refusal = buyRefusal(save, id);\n  if (refusal) return refusal;\n  const item = items[id as ItemId];\n  save.coins -=",
                 "  const refusal = buyRefusal(save, id);\n  const item = items[id as ItemId];\n  save.coins -=")]),
    dict(id="undo-seconds-static", expect=["undo-live"], kid_only=False,
         what="the Undo button always says 10 seconds",
         edits=[(SHOP, "Undo ({seconds}s)", "Undo (10s)")]),
    dict(id="undo-bar-not-redrawn", expect=["undo-live"], kid_only=False,
         what="the shop is not redrawn each second (the countdown and the end of the window never show)",
         edits=[(SHOP, "  useSecond();\n  const closeRef", "  const closeRef")]),
    dict(id="undo-button-does-nothing", expect=["undo-live"], kid_only=False,
         what="the Undo button gives nothing back",
         edits=[(SHOP, "onClick={() => game.act((s, at) => undoBuy(s, at))}", "onClick={() => game.act(() => undefined)}")]),
    dict(id="undo-window-never-ends", expect=["undo-live"], kid_only=False,
         what="the undo window is 100 times longer than 10 seconds on the screen",
         edits=[(RULES, "since <= window ? window - since : null", "since <= window * 100 ? window - since : null")]),
    dict(id="preview-ignores-the-card", expect=["preview-room"], kid_only=False,
         what="the preview always shows the room as the player has it",
         edits=[(SHOP, "look={lookWith(save, picked)}", "look={lookOf(save)}")]),
    dict(id="preview-always-has-the-mat", expect=["preview-room"], kid_only=False,
         what="the preview of any furniture shows the Feeding Mat",
         edits=[(SHOP, 'mat: look.mat || id === "feeding-mat"', "mat: true")]),
    dict(id="preview-wallpaper-not-applied", expect=["preview-room"], kid_only=False,
         what="the preview of a wallpaper keeps the current wall",
         edits=[(SHOP, 'if (item.kind === "wallpaper") return { ...look, walls: { ...look.walls, living: id } };', 'if (item.kind === "wallpaper") return { ...look };')]),
    dict(id="preview-not-redrawn", expect=["preview-room"], kid_only=False,
         what="the preview canvas is redrawn only when the hour changes",
         edits=[(SHOP, "}, [look.walls[room], look.bed, look.mat, hour, room, wearing?.formId, wearing?.hat]);", "}, [hour]);")]),
    dict(id="picked-card-not-pressed", expect=["preview-room"], kid_only=False,
         what="the card being previewed is not marked pressed",
         edits=[(SHOP, "aria-pressed={selected}", "aria-pressed={false}")]),
    dict(id="room-ignores-wallpaper", expect=["room-looks"], kid_only=False,
         what="the home is always drawn with the plain wall (drawHomeBack; the old one-line room's drawRoom, shown only while the creature is away, is not what these checks read)",
         edits=[(ROOM, "const wall = wallColours(look.walls[span.id]);", "const wall = wallColours(null);"),
                (ROOM, "const wall = wallColours(look.walls[wallRoomOf(col, 0) as RoomId]);", "const wall = wallColours(null);")]),
    dict(id="room-ignores-bed", expect=["room-looks"], kid_only=False,
         what="the home never draws the Comfy Bed (drawBed)",
         edits=[(ROOM, '// pillow\n  if (look.bed) {\n    rect(ctx, "#ffe9f0", bed + 13, y + 7, 8, 5);', '// pillow\n  if (false) {\n    rect(ctx, "#ffe9f0", bed + 13, y + 7, 8, 5);')]),
    dict(id="room-ignores-mat", expect=["room-looks"], kid_only=False,
         what="the home never draws the Feeding Mat (drawHomeBack's mat piece)",
         edits=[(ROOM, '} else if (p.kind === "mat" && look.mat) {', '} else if (p.kind === "mat" && false) {')]),
    dict(id="room-always-has-mat", expect=["room-looks"], kid_only=False,
         what="the home always draws the Feeding Mat",
         edits=[(ROOM, '} else if (p.kind === "mat" && look.mat) {', '} else if (p.kind === "mat") {')]),
    dict(id="scene-draws-the-plain-room", expect=["room-looks"], kid_only=False,
         what="the live home is drawn without the save's look",
         edits=[(SCENE, "const look = layout ? { ...lookOf(save), layout } : lookOf(save);", "const look = layout ? { ...lookOf({ ...save, wall: null, owned: [], home: save.home && { pieces: save.home.pieces } }), layout } : lookOf({ ...save, wall: null, owned: [], home: save.home && { pieces: save.home.pieces } });")]),
    dict(id="hud-ignores-owned", expect=["hud-bed"], kid_only=False,
         what="the Mood card is worked out as if nothing were owned",
         edits=[(HUD, "detailLines(c, opened, asleep, save.owned)", "detailLines(c, opened, asleep)")]),
    dict(id="bed-factor-ignored", expect=["hud-bed"], kid_only=False,
         what="the Comfy Bed does not slow the fall of happiness",
         edits=[(CARE, "-rate.happiness * slow * (asleep && !c.job ? bedFactor(owned) : 1)", "-rate.happiness * slow * 1")]),
    dict(id="load-forgets-the-wall", expect=["reload-keeps"], kid_only=False,
         what="a loaded game always has the plain wall",
         edits=[(STATE, "value.wall = isWallId(value.wall) && value.owned.includes(value.wall) ? value.wall : null;", "value.wall = null;")]),
    dict(id="load-forgets-the-undo", expect=["reload-keeps"], kid_only=False,
         what="a loaded game has no purchase to undo",
         edits=[(STATE, "    isLastBuy(value.lastBuy) && value.owned.includes(value.lastBuy.item)\n", "    false && isLastBuy(value.lastBuy) && value.owned.includes(value.lastBuy.item)\n")]),
    dict(id="load-forgets-what-was-bought", expect=["reload-keeps"], kid_only=False,
         what="a loaded game owns nothing",
         edits=[(STATE, "value.owned = Array.isArray(value.owned) ? [...new Set(value.owned.filter(isItemId))] : [];", "value.owned = [];")]),
    dict(id="card-wider-than-window", expect=["fit-scroll"], kid_only=False,
         what="every shop card is 420 px wide at least",
         edits=[(CSS, ".shop-card {\n  --card-edge: #8d7bc6;\n  display: flex;", ".shop-card {\n  --card-edge: #8d7bc6;\n  min-width: 420px;\n  display: flex;")]),
    dict(id="effect-text-runs-out-of-its-box", expect=["fit-clip"], kid_only=False,
         what="an item's effect line does not wrap and is bigger (text-wrap, not white-space: a later text-wrap: balance resets the wrap mode)",
         edits=[(CSS, ".shop-effect {\n  font-size: 0.92rem;\n  line-height: 1.4;\n  color: var(--ink-soft);\n  text-wrap: balance;",
                 ".shop-effect {\n  font-size: 1.2rem;\n  line-height: 1.4;\n  color: var(--ink-soft);\n  text-wrap: nowrap;")]),
    dict(id="card-button-too-short", expect=["fit-tap"], kid_only=False,
         what="the card's buttons are at most 32 px high",
         edits=[(CSS, ".btn.card-btn {\n  min-height: 48px;", ".btn.card-btn {\n  min-height: 30px;\n  max-height: 32px;")]),
    dict(id="button-without-edge", expect=["btn-look"], kid_only=False,
         what="the card buttons have no edge (a Use or Undo button has the surface's own fill)",
         edits=[(CSS, "box-shadow: var(--lift), inset 0 0 0 2px var(--card-edge), inset 0 1px 0 rgba(255, 255, 255, 0.16);", "box-shadow: none;")]),
    # A2.4, the hats
    dict(id="hat-wear-does-nothing", expect=["hat-wear"], kid_only=False,
         what="the Wear button puts nothing on (Take off still works)",
         edits=[(SHOP, "useHat(s, worn ? null : id)", "useHat(s, worn ? null : null)")]),
    dict(id="hat-take-off-does-nothing", expect=["hat-wear"], kid_only=False,
         what="the Take off button takes nothing off",
         edits=[(SHOP, "useHat(s, worn ? null : id)", "useHat(s, id)")]),
    dict(id="hat-button-label-stuck", expect=["hat-wear"], kid_only=False,
         what="the hat card's button always says Wear",
         edits=[(SHOP, '{worn ? "Take off" : "Wear"}', '{"Wear"}')]),
    dict(id="hat-button-not-pressed", expect=["hat-wear"], kid_only=False,
         what="the hat card's button is never aria-pressed",
         edits=[(SHOP, "aria-pressed={worn} onClick={() => game.act((s) => useHat", "aria-pressed={false} onClick={() => game.act((s) => useHat")]),
    dict(id="hat-scene-key-without-the-hat", expect=["hat-wear"], kid_only=False,
         what="the room keeps one canvas for a creature's picture, hat or not (a hat put on later does not show)",
         edits=[(SCENE, "`form:${form.id}:${kind}:${frame}${hat ? `:${hat}` : \"\"}`, tint);", "`form:${form.id}:${kind}:${frame}`, tint);")]),
    dict(id="hat-habitat-key-without-the-hat", expect=["hat-wear"], kid_only=False,
         what="the habitat keeps one canvas for a creature's picture, hat or not",
         edits=[(HABITAT, "`form:${form.id}:${kind}:${frame}${hat ? `:${hat}` : \"\"}`, tint);", "`form:${form.id}:${kind}:${frame}`, tint);")]),
    dict(id="hat-on-the-dead", expect=["hat-places"], kid_only=False,
         what="a dead creature's picture wears the hat",
         edits=[(SCENE, "const hat = dead ? null : hatOf(save);", "const hat = hatOf(save);")]),
    dict(id="hat-habitat-at-home-bare", expect=["hat-places"], kid_only=False,
         what="the habitat draws the creature at home with no hat",
         edits=[(HABITAT, "drawCreature(ctx, c, view, HOME.centerX, HOME.feetY, false, hatOf(save));", "drawCreature(ctx, c, view, HOME.centerX, HOME.feetY, false, null);")]),
    dict(id="hat-habitat-at-work-bare", expect=["hat-places"], kid_only=False,
         what="the habitat draws the creature at work with no hat",
         edits=[(HABITAT, "drawCreature(ctx, c, view, place.centerX, place.feetY, true, hatOf(save));", "drawCreature(ctx, c, view, place.centerX, place.feetY, true, null);")]),
    dict(id="hat-preview-bare", expect=["hat-preview"], kid_only=False,
         what="a hat's preview shows no creature",
         edits=[(SHOP, "pickedHat && c ? { formId: c.formId, hat: picked as HatId } : null;", "null;")]),
    dict(id="hat-preview-not-redrawn", expect=["hat-preview"], kid_only=False,
         what="the preview is not redrawn when another hat is picked",
         edits=[(SHOP, "hour, room, wearing?.formId, wearing?.hat]);", "hour, room]);")]),
    dict(id="hat-preview-in-the-kitchen", expect=["hat-preview"], kid_only=False,
         what="a hat's preview is of the kitchen",
         edits=[(SHOP, 'items[id].kind === "wallpaper" || items[id].kind === "hat" ? "living" : "kitchen"', 'items[id].kind === "wallpaper" ? "living" : "kitchen"')]),
    dict(id="hat-forgotten-on-load", expect=["hat-reload"], kid_only=False,
         what="a saved game loads without its hat",
         edits=[(STATE, "value.hat = isHatId(value.hat) && value.owned.includes(value.hat) ? value.hat : null;", "value.hat = null;")]),
    dict(id="hat-blanket-from-the-hatted-picture", expect=["hat-bed"], kid_only=False,
         what="the sleeper's blanket is fitted to its picture with the hat on",
         edits=[(SCENE, "drawBlanket(ctx, faceSprite(form, kind, frame), drawX, y, flip);", "drawBlanket(ctx, picture, drawX, y, flip);")]),
    dict(id="hat-sick-tint-removed", expect=["hat-places"], kid_only=False,
         what="a sick creature is not tinted (so its cap keeps its plain colour)",
         edits=[(SCENE, ': c.sick\n          ? { color: "#7bdc6a", amount: 0.4 }\n          : undefined;', ": undefined;")]),
    dict(id="hat-in-the-arena", expect=["hat-places"], kid_only=False,
         what="the arena draws a Knit Cap on its fighters",
         edits=[(ARENA, "spriteCanvas(faceSprite(form, kind, frame), `form:${form.id}:${kind}:${frame}`, tint);", "spriteCanvas(faceSprite(form, kind, frame, \"hat-knit\"), `form:${form.id}:${kind}:${frame}`, tint);")]),
    dict(id="hat-buy-puts-it-on", expect=["hat-wear"], kid_only=False,
         what="buying a hat puts it on",
         edits=[(RULES, 'if (item.kind === "wallpaper") save.wall = item.id;', 'if (item.kind === "wallpaper") save.wall = item.id;\n  if (item.kind === "hat") save.hat = item.id;')]),
    dict(id="hat-hidden-in-kid-mode", expect=["hat-kid"], kid_only=True,
         what="Kid Mode draws no hat",
         edits=[(SCENE, "const hat = dead ? null : hatOf(save);", "const hat = dead || !save.settings.adultMode ? null : hatOf(save);")]),
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


def run_checker(base, ids, modes, timeout, log_path):
    cmd = ["node", CHECKER, "--base", base, "--only", ",".join(ids), "--sizes", SIZE]
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
        rc, text = run_checker(server.base, m["expect"], modes, MUTANT_TIMEOUT, log_path)
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
        gen = subprocess.run([os.path.join(HERE, "gen-saves-shop.sh")], capture_output=True, text=True)
        if gen.returncode != 0:
            raise Stop("gen-saves-shop.sh failed:\n" + gen.stdout[-800:] + gen.stderr[-800:])
    ensure_copy()
    same, diff_text = copy_matches_real()
    if not same:
        raise Stop("the copy differs from the repo before the run (delete $VERIFY_OUT/shop-ui-copy to start again):\n" + diff_text)
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
    ap = argparse.ArgumentParser(description="Mutation runner for the shop screen checks (A2.2a).")
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
