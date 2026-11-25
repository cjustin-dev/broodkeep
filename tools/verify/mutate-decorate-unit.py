#!/usr/bin/env python3
# Mutation runner for the pure side of Decorate mode (Broodkeep, Home slice H2b, docs/home-plan.md section 12): the edit rules (src/art/homeEdit.ts: which layouts a move may make, the
# tray, which piece a finger takes, where a piece from the tray lands, carrying and dropping), the saved form of a layout (src/data/home.ts homeOf), Decorate mode on the game
# (src/ui/game.ts) and the creature standing still (src/art/idle.ts).
#
# It works on a COPY of the repo (decorate-unit-copy/), never on the real tree. Each mutant is one exact text replace whose `old` must occur exactly once in its
# file. Only the Decorate test files run per mutant (tests/home-edit, game-decor and idle-home: a mutant counts only when ITS named test fails, so the rest of the suite cannot
# change the verdict). A mutant is CAUGHT only when the test named in `expect` (a substring of its full name, in `expect_file`) fails.
#
#   python3 mutate-decorate-unit.py --list   checks each `old` occurs once in the real files, prints the table, runs no tests
#   python3 mutate-decorate-unit.py          makes a fresh copy, runs the baseline, then every mutant, then checks the copy
#   python3 mutate-decorate-unit.py --only id1,id2   the same, for these mutants only
#
# Exit: 0 every mutant CAUGHT; 1 some mutant not CAUGHT (or an occurrence count is not 1); 2 baseline failed, the copy differs at the end, or an unknown or empty --only id.
import argparse
import json
import os
import shutil
import signal
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REAL = os.path.abspath(os.path.join(HERE, "..", ".."))  # the repo this file is in
# Everything this runner makes (the copy, the logs) goes to VERIFY_OUT, never into the repo.
VERIFY_OUT = os.environ.get("VERIFY_OUT") or os.path.join(tempfile.gettempdir(), "broodkeep-verify")
COPY = os.path.join(VERIFY_OUT, "decorate-unit-copy")
ORIG = os.path.join(VERIFY_OUT, "decorate-unit-orig")
OUT = os.path.join(VERIFY_OUT, "decorate-unit-out")
T_EDIT = "tests/home-edit.test.ts"
T_GAME = "tests/game-decor.test.ts"
T_IDLE = "tests/idle-home.test.ts"
VITEST = ["npx", "vitest", "run", T_EDIT, T_GAME, T_IDLE, "--cache=false", "--fsModuleCache=false", "--reporter=json"]
TEST_FILE = T_EDIT
TIMEOUT_S = 600

F_EDIT = "src/art/homeEdit.ts"
F_DATA = "src/data/home.ts"
F_GAME = "src/ui/game.ts"
F_IDLE = "src/art/idle.ts"


def mut(id, file, old, new, expect, test):
    return dict(id=id, file=file, old=old, new=new, expect=expect, expect_file=test)


# Test titles (substrings of the full test names)
M_FREE = "puts a piece on a free spot"
M_OVERLAP = "refuses two solid pieces on the same tiles"
M_AWAY = "puts a piece away, except the bed"
TRAY_EMPTY = "is empty when everything is out, and holds a piece put away"
TRAY_MAT = "holds the Feeding Mat only once it is owned"
TILE = "names the tile: 24 pixels each, and the one below zero is -1"
EDGES = "finds a piece on each of its tiles and nothing just outside"
SOLID_OVER = "takes a solid piece over a flat one"
MAT_UNOWNED = "does not find the Feeding Mat while it is not owned"
LATER = "takes the piece drawn later where two overlap"
SPOT_OLD = "puts it on its own old place when that is the middle of the view"
SPOT_UPPER = "goes to the nearest allowed spot when the middle is taken, the upper one of two as near"
SPOT_RULES = "never picks a spot the rules refuse"
LIFT = "lifts the piece under the finger and remembers where on it the finger is"
FOLLOW = "follows the finger by tiles, keeping the grip"
FOLLOW_BAD = "marks a spot the rules refuse"
FOLLOW_SAME = "gives back the same lift when the finger stays on the same tile"
DROP = "puts the piece down where it is held when that is allowed, and sends it back when it is not or when it never left"
HOME_WRITES = "writes every piece, a put-away one as null, and reads back as the very layout"
HOME_COPY = "does not share a placement with the layout it came from"

G_START = "starts on the home's picture: nothing selected, the creature told to stand still, the screens woken"
G_NOSAVE = "is not saved: no write to the device, and nothing counted as the player's change"
G_REFUSE = "does not start in the one-line room (a field), on another screen, in a scene, or twice"
G_END = "ends: the creature may move again and the screens are woken, once; ending when off wakes nothing"
G_LEAVE = "ends when the player leaves the room screen, and when a game from the account replaces this one"
G_SELECT = "selects a piece and lets go of it; the screens are woken only when the selection changes"
G_GONE = "does not count a selected piece that is not out in the home any more"
G_OUT = "lands on the nearest allowed spot to the middle of the view, is selected, and is saved as the player's change"
G_OUT_RULES = "brings out nothing that is already out, nothing when Decorate mode is off, and the Feeding Mat only once it is owned"
G_AWAY = "puts the selected piece away and lets go of it; the layout is saved"
G_BED = "does nothing with nothing selected, and never puts the bed away"
G_NUDGE = "moves the selected piece one tile: the sofa down from (13,1) to (13,2), and keeps it selected"
G_NUDGE_BAD = "does not move it where the rules refuse"

I_CALLOFF = "calls off a walk it was on: it stands where it is, with its path gone"
I_NONE = "starts no walk by itself in ten seconds, where a free creature does (the control)"
I_BED = "does not walk to bed when it falls asleep, and goes when it may move again"
I_BEDWALK = "calls off the walk to bed it was on"

# Not mutated (each argued from the code):
#  - the `d` tie-break by column in nearestSpot: after the distance and the row, two spots of one row and one distance are 2 x the offset apart, so the column order decides only between
#    mirror images; the test for the upper-of-two covers the row, and a spot reached by column order alone cannot be told from its mirror image by any layout of the nine pieces.
#  - `view.pose !== "sleep"` in the `stay` of updateView: a lying creature skips sleepHome either way (sleepHome returns at once for it).
#  - `world === "home"` in the same `stay`: view.still is only set while the world is the home (the Stage ends Decorate mode on a change of world).
#  - reseat() in startDecor: the creature is on a tile at the start in every save the checks use, and reseat itself is tested in idle-home.test.ts.
# id, file, old (exact, must occur once in the file), new, expect (substring of the test's full name), expect_file
MUTANTS = [
    # which layouts a move may make
    mut("moved-skips-the-rules", F_EDIT, "return problemWith(next) === null ? next : null;", "return next;", M_OVERLAP, T_EDIT),
    mut("moved-changes-its-input", F_EDIT, "const next: Layout = { ...layout, [kind]: at === null ? null : { col: at.col, row: at.row } };", "const next: Layout = Object.assign(layout, { [kind]: at === null ? null : { col: at.col, row: at.row } });", M_FREE, T_EDIT),
    mut("moved-lets-the-bed-go", F_EDIT, "return problemWith(next) === null ? next : null;", "return at === null && kind === \"bed\" ? next : problemWith(next) === null ? next : null;", M_AWAY, T_EDIT),
    # the tray
    mut("tray-reversed", F_EDIT, "KINDS.filter((kind) => layout[kind] === null", "[...KINDS].reverse().filter((kind) => layout[kind] === null", TRAY_EMPTY, T_EDIT),
    mut("tray-offers-the-mat-always", F_EDIT, '(kind !== "mat" || matOwned));', "true);", TRAY_MAT, T_EDIT),
    mut("tray-lists-placed-pieces", F_EDIT, 'layout[kind] === null && (kind !== "mat" || matOwned));', '(kind !== "mat" || matOwned));', TRAY_EMPTY, T_EDIT),
    # which tile a point is on
    mut("tile-rounds", F_EDIT, "col: Math.floor(point.x / TILE)", "col: Math.round(point.x / TILE)", TILE, T_EDIT),
    mut("tile-truncates-below-zero", F_EDIT, "row: Math.floor(point.y / TILE)", "row: Math.trunc(point.y / TILE)", TILE, T_EDIT),
    # which piece a finger takes
    mut("piece-at-mat-always", F_EDIT, '&& (p.kind !== "mat" || matOwned));', "&& true);", MAT_UNOWNED, T_EDIT),
    mut("piece-at-flat-over-solid", F_EDIT, "[...over.filter((p) => p.solid).reverse(), ...over.filter((p) => !p.solid).reverse()][0]", "[...over.filter((p) => !p.solid).reverse(), ...over.filter((p) => p.solid).reverse()][0]", SOLID_OVER, T_EDIT),
    mut("piece-at-first-drawn-wins", F_EDIT, "[...over.filter((p) => p.solid).reverse(), ...over.filter((p) => !p.solid).reverse()][0]", "[...over.filter((p) => p.solid), ...over.filter((p) => !p.solid)][0]", LATER, T_EDIT),
    mut("piece-at-right-edge-in", F_EDIT, "col < p.col + p.cols &&", "col <= p.col + p.cols &&", EDGES, T_EDIT),
    mut("piece-at-bottom-edge-in", F_EDIT, "row < p.row + p.rows &&", "row <= p.row + p.rows &&", EDGES, T_EDIT),
    mut("piece-at-left-edge-out", F_EDIT, "col >= p.col &&", "col > p.col &&", EDGES, T_EDIT),
    mut("piece-at-top-edge-out", F_EDIT, "row >= p.row &&", "row > p.row &&", EDGES, T_EDIT),
    # where a piece from the tray lands
    mut("spot-farthest-first", F_EDIT, "spots.sort((a, b) => a.d - b.d ||", "spots.sort((a, b) => b.d - a.d ||", SPOT_OLD, T_EDIT),
    mut("spot-lower-of-two-first", F_EDIT, "a.d - b.d || a.row - b.row ||", "a.d - b.d || b.row - a.row ||", SPOT_UPPER, T_EDIT),
    mut("spot-ignores-the-rules", F_EDIT, "spots.find((s) => moved(layout, kind, s) !== null)", "spots.find(() => true)", SPOT_RULES, T_EDIT),
    mut("spot-measured-from-the-corner", F_EDIT, "d: Math.hypot(col + cols / 2 - near.col, row + rows / 2 - near.row)", "d: Math.hypot(col - near.col, row - near.row)", SPOT_OLD, T_EDIT),
    # carrying and dropping
    mut("lift-forgets-the-grip", F_EDIT, "grip: { col: col - from.col, row: row - from.row }", "grip: { col: 0, row: 0 }", LIFT, T_EDIT),
    mut("lift-starts-refused", F_EDIT, "at: { ...from }, grip: { col: col - from.col, row: row - from.row }, valid: true }", "at: { ...from }, grip: { col: col - from.col, row: row - from.row }, valid: false }", LIFT, T_EDIT),
    mut("follow-jumps-to-the-finger", F_EDIT, "const at = { col: col - held.grip.col, row: row - held.grip.row };", "const at = { col, row };", FOLLOW, T_EDIT),
    mut("follow-always-valid", F_EDIT, "valid: moved(layout, held.kind, at) !== null };", "valid: true };", FOLLOW_BAD, T_EDIT),
    mut("follow-makes-a-new-lift-every-time", F_EDIT, "if (at.col === held.at.col && at.row === held.at.row) return held;\n", "", FOLLOW_SAME, T_EDIT),
    mut("drop-on-its-own-tile-writes", F_EDIT, "if (held.at.col === held.from.col && held.at.row === held.from.row) return null;\n  ", "", DROP, T_EDIT),
    mut("drop-skips-the-rules", F_EDIT, "return moved(layout, held.kind, held.at);\n}", "return { ...layout, [held.kind]: held.at };\n}", DROP, T_EDIT),
    # what is saved
    mut("home-of-shares-the-placement", F_DATA, "layout[kind] ? { col: layout[kind].col, row: layout[kind].row } : null", "layout[kind]", HOME_COPY, T_EDIT),
    mut("home-of-leaves-out-put-away", F_DATA, "layout[kind] ? { col: layout[kind].col, row: layout[kind].row } : null", "layout[kind] ? { col: layout[kind].col, row: layout[kind].row } : undefined", HOME_WRITES, T_EDIT),
    mut("home-of-writes-backwards", F_DATA, "KINDS.map((kind) => [kind, layout[kind] ?", "[...KINDS].reverse().map((kind) => [kind, layout[kind] ?", HOME_WRITES, T_EDIT),
    # Decorate mode on the game
    mut("start-leaves-the-creature-free", F_GAME, "    this.view.still = true;\n", "", G_START, T_GAME),
    mut("start-wakes-nobody", F_GAME, "reseat(this.view); // (it stands on a tile, and a walk or a meal is called off)\n    this.listeners.forEach((listener) => listener());\n", "reseat(this.view); // (it stands on a tile, and a walk or a meal is called off)\n", G_START, T_GAME),
    mut("start-is-saved", F_GAME, "this.decor = { selected: null };\n", "this.decor = { selected: null };\n    this.changed();\n", G_NOSAVE, T_GAME),
    mut("start-in-a-field", F_GAME, 'this.screen !== "room" || this.view.world !== "home" ||', 'this.screen !== "room" ||', G_REFUSE, T_GAME),
    mut("start-on-another-screen", F_GAME, 'this.screen !== "room" || this.view.world !== "home" ||', 'this.view.world !== "home" ||', G_REFUSE, T_GAME),
    mut("start-in-a-scene", F_GAME, 'this.view.world !== "home" || this.view.moment !== null) return false;', 'this.view.world !== "home") return false;', G_REFUSE, T_GAME),
    mut("start-twice", F_GAME, 'if (this.decor || this.screen !== "room"', 'if (this.screen !== "room"', G_REFUSE, T_GAME),
    mut("end-leaves-the-creature-still", F_GAME, "    this.decor = null;\n    this.view.still = false;\n", "    this.decor = null;\n", G_END, T_GAME),
    mut("leaving-the-room-keeps-the-mode", F_GAME, "    this.screen = screen;\n    this.dropDecor();\n", "    this.screen = screen;\n", G_LEAVE, T_GAME),
    mut("a-new-game-keeps-the-mode", F_GAME, "    this.save = save;\n    this.dropDecor();\n", "    this.save = save;\n", G_LEAVE, T_GAME),
    mut("select-wakes-for-the-same-piece", F_GAME, "if (!this.decor || this.decor.selected === kind) return;", "if (!this.decor) return;", G_SELECT, T_GAME),
    mut("selected-piece-put-away-elsewhere-still-counts", F_GAME, "return kind !== null && layoutOf(this.save.home)[kind] !== null ? kind : null;", "return kind;", G_GONE, T_GAME),
    mut("set-layout-writes-nothing", F_GAME, "save.home = homeOf(layout);", "void homeOf(layout);", G_OUT, T_GAME),
    mut("bring-out-does-not-select", F_GAME, "this.setLayout({ ...layout, [kind]: at });\n    this.select(kind);\n", "this.setLayout({ ...layout, [kind]: at });\n", G_OUT, T_GAME),
    mut("bring-out-what-is-out", F_GAME, "const at = this.decor && layout[kind] === null && (kind", "const at = this.decor && (kind", G_OUT_RULES, T_GAME),
    mut("bring-out-the-unowned-mat", F_GAME, '(kind !== "mat" || this.save.owned.includes("feeding-mat"))', "true", G_OUT_RULES, T_GAME),
    mut("bring-out-with-the-mode-off", F_GAME, "const at = this.decor && layout[kind] === null", "const at = layout[kind] === null", G_OUT_RULES, T_GAME),
    mut("put-away-the-bed", F_GAME, "const next = kind ? moved(layoutOf(this.save.home), kind, null) : null;", "const next = kind ? { ...layoutOf(this.save.home), [kind]: null } : null;", G_BED, T_GAME),
    mut("put-away-keeps-the-selection", F_GAME, "    this.setLayout(next);\n    this.select(null);\n", "    this.setLayout(next);\n", G_AWAY, T_GAME),
    mut("nudge-ignores-the-rules", F_GAME, "const next = kind && from ? moved(layout, kind, { col: from.col + dcol, row: from.row + drow }) : null;", "const next = kind && from ? { ...layout, [kind]: { col: from.col + dcol, row: from.row + drow } } : null;", G_NUDGE_BAD, T_GAME),
    mut("nudge-swaps-the-axes", F_GAME, "{ col: from.col + dcol, row: from.row + drow }) : null;", "{ col: from.col + drow, row: from.row + dcol }) : null;", G_NUDGE, T_GAME),
    # the creature stands still
    mut("still-lets-a-walk-go-on", F_IDLE, 'if (stay && view.pose === "walk") {', 'if (false && stay && view.pose === "walk") {', I_CALLOFF, T_IDLE),
    mut("still-keeps-the-path", F_IDLE, "    view.path = [];\n    view.toBed = false;\n    setPose(view, \"idle\", 1);\n  }\n\n  if (mood.asleep) {", "    view.toBed = false;\n    setPose(view, \"idle\", 1);\n  }\n\n  if (mood.asleep) {", I_CALLOFF, T_IDLE),
    mut("still-keeps-the-bed-walk", F_IDLE, "    view.path = [];\n    view.toBed = false;\n    setPose(view, \"idle\", 1);\n  }\n\n  if (mood.asleep) {", "    view.path = [];\n    setPose(view, \"idle\", 1);\n  }\n\n  if (mood.asleep) {", I_BEDWALK, T_IDLE),
    mut("still-chooses-its-next-step", F_IDLE, "view.poseTime >= view.poseLength && !stay) chooseNext", "view.poseTime >= view.poseLength) chooseNext", I_NONE, T_IDLE),
    mut("still-walks-to-bed", F_IDLE, "      if (!stay) sleepHome(view, dt);", "      sleepHome(view, dt);", I_BED, T_IDLE),
]


def read(path):
    with open(path, encoding="utf-8", newline="") as f:
        return f.read()


def write(path, text):
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(text)


def short(text, width):
    text = " ".join(str(text).split())
    return text if len(text) <= width else text[: width - 3] + "..."


def short_file(name):
    for marker in ("/tests/", "/src/"):
        if marker in name:
            return name[name.index(marker) + 1 :]
    return name


def top_ignore(directory, names):
    if os.path.abspath(directory) == REAL:
        return {n for n in names if n in ("node_modules", "dist", ".git")}
    return set()


def fresh_copy():
    if os.path.lexists(COPY):
        shutil.rmtree(COPY)  # a symlink is removed, not followed
    shutil.copytree(REAL, COPY, ignore=top_ignore, symlinks=True)
    os.symlink(os.path.join(REAL, "node_modules"), os.path.join(COPY, "node_modules"))


def run_vitest(name):
    jpath = os.path.join(OUT, name + ".json")
    if os.path.exists(jpath):
        os.remove(jpath)
    with open(os.path.join(OUT, name + ".log"), "w", encoding="utf-8") as log:
        # its own process group, so a timeout or Ctrl-C kills vitest's node children too, not only the npx parent
        proc = subprocess.Popen(VITEST + ["--outputFile=" + jpath], cwd=COPY, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        try:
            rc = proc.wait(timeout=TIMEOUT_S)
        except BaseException:
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            proc.wait()
            raise
    data = None
    if os.path.exists(jpath):
        with open(jpath, encoding="utf-8") as f:
            data = json.load(f)
    return rc, data


def failures(data):
    out = []
    for tr in data.get("testResults", []):
        got = False
        for a in tr.get("assertionResults", []):
            if a.get("status") == "failed":
                out.append((short_file(tr["name"]), a["fullName"]))
                got = True
        if tr.get("status") == "failed" and not got:
            out.append((short_file(tr["name"]), "<suite failed to load>"))
    return out


def verdict(m, rc, data):
    if data is None:
        return "ERROR", "no JSON report (exit %s)" % rc, []
    fails = failures(data)
    if rc not in (0, 1):
        return "ERROR", "vitest exit %s" % rc, fails
    if (rc == 1) != bool(fails):
        return "ERROR", "exit %s does not match %d failed tests" % (rc, len(fails)), fails
    want_file = m.get("expect_file", TEST_FILE)  # a mutant in a helper shared with startNewEgg is guarded by that test, in another file
    matched = [f for f in fails if f[0].endswith(want_file) and m["expect"] in f[1]]
    if matched:
        return "CAUGHT", "", fails
    if fails:
        return "CAUGHT-BY-OTHER", "named test did not fail", fails
    return "SURVIVED", "", fails


def occurrences(m):
    return read(os.path.join(REAL, m["file"])).count(m["old"])


def do_list():
    bad = 0
    print("%-32s %5s  %-22s %-22s %s" % ("id", "count", "file", "expect_file", "expect (title substring)"))
    for m in MUTANTS:
        n = occurrences(m)
        if n != 1:
            bad += 1
        print("%-32s %5d  %-22s %-22s %s" % (m["id"], n, m["file"], m.get("expect_file", TEST_FILE).split("/")[-1], m["expect"]))
    print("LIST total=%d bad=%d" % (len(MUTANTS), bad))
    return 0 if bad == 0 else 1


def do_run():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(ORIG, exist_ok=True)
    if not os.path.isdir(os.path.join(REAL, "node_modules")):
        print("node_modules missing in the real repo; cannot run vitest")
        return 2
    fresh_copy()
    print("copy made: %s (node_modules symlinked to the real repo)" % COPY)

    # Baseline: no mutation, must pass.
    try:
        rc, data = run_vitest("baseline")
    except Exception as e:  # a hung or missing vitest is a stop (exit 2), not a traceback
        print("BASELINE FAILED to run: %r" % (e,))
        return 2
    if rc != 0 or data is None or data.get("numFailedTests") != 0 or data.get("numPassedTests", 0) == 0:
        print("BASELINE FAILED: exit %s, failed %s, passed %s (see %s)" % (rc, data and data.get("numFailedTests"), data and data.get("numPassedTests"), os.path.join(OUT, "baseline.log")))
        return 2
    print("BASELINE ok: exit 0, %d tests passed" % data["numPassedTests"])

    results = []
    fatal = None
    for m in MUTANTS:
        path = os.path.join(COPY, m["file"])
        orig = read(path)
        n = orig.count(m["old"])
        if n != 1:
            results.append((m, "ERROR", "old occurs %d times in the copy" % n, []))
            continue
        write(os.path.join(ORIG, m["file"].replace("/", "__")), orig)
        try:
            write(path, orig.replace(m["old"], m["new"], 1))
            rc, data = run_vitest(m["id"])
            v, note, fails = verdict(m, rc, data)
        except Exception as e:  # a runner problem is an ERROR, the loop goes on
            v, note, fails = "ERROR", "runner exception: %r" % (e,), []
        finally:
            write(path, orig)
            if read(path) != orig:
                fatal = "restore failed for " + m["file"]
        results.append((m, v, note, fails))
        print("%-32s %s" % (m["id"], v), flush=True)
        if fatal:
            break
    if fatal:
        print("FATAL:", fatal)
        return 2

    # The copy must match the real tree again.
    same = True
    for sub in ("src", "tests"):
        d = subprocess.run(["diff", "-r", os.path.join(REAL, sub), os.path.join(COPY, sub)], capture_output=True, text=True)
        if d.returncode != 0:
            same = False
            print("DIFF in %s (rc %d):\n%s" % (sub, d.returncode, d.stdout[:2000] + d.stderr[:500]))
    print("COPY CHECK: src and tests %s the real repo" % ("identical to" if same else "DIFFER from"))

    print()
    print("%-32s %-17s %-55s %s" % ("id", "verdict", "expect (title substring)", "failed titles (shortened)"))
    counts = {"CAUGHT": 0, "CAUGHT-BY-OTHER": 0, "SURVIVED": 0, "ERROR": 0}
    for m, v, note, fails in results:
        counts[v] += 1
        shown = [short(t, 70) for _, t in fails[:2]]
        if len(fails) > 2:
            shown.append("(+%d more)" % (len(fails) - 2))
        extra = (" [" + note + "]") if note else ""
        print("%-32s %-17s %-55s %s%s" % (m["id"], v, short(m["expect"], 55), " | ".join(shown), extra))
    print()
    print("SUMMARY caught=%d other=%d survived=%d error=%d of %d" % (counts["CAUGHT"], counts["CAUGHT-BY-OTHER"], counts["SURVIVED"], counts["ERROR"], len(MUTANTS)))
    if not same:
        return 2
    return 0 if counts["CAUGHT"] == len(MUTANTS) else 1


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--list", action="store_true", help="check the occurrences and print the mutants; run no tests")
    ap.add_argument("--only", help="run only these mutants (comma separated ids), after the same baseline; the summary counts only them (an unknown or empty id stops the run, exit 2)")
    args = ap.parse_args()
    if args.only is not None:
        ids = [i.strip() for i in args.only.split(",")]
        known = {m["id"] for m in MUTANTS}
        bad = [i for i in ids if i not in known]  # (an empty id is never known)
        if bad:
            print("unknown or empty mutant id: %s" % bad)
            return 2
        MUTANTS[:] = [m for m in MUTANTS if m["id"] in ids]
    if args.list:
        return do_list()
    return do_run()


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, lambda signum, frame: sys.exit(143))  # SystemExit runs the restore in each `finally`
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("interrupted: the copy's current file was restored in its finally")
        sys.exit(130)
