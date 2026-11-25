#!/usr/bin/env python3
# Mutation runner for the pure side of the house that grows (Broodkeep, home slice H3, docs/home-plan.md section 16): how many rooms a save has built (data/home.ts roomsBuilt, colsOf,
# isBuilt, wallRoomOf, withoutRoom), the floor, width and walking of the home in force (art/home.ts), the six rules and the mended layout with four rooms (art/homeLayout.ts, art/homeEdit.ts),
# what the Shop's undo of the Playroom does (game/shop.ts), what a request or reward may name (game/requests.ts), what Decorate mode may select (ui/game.ts) and the look of a save (art/room.ts).
# The drawing (carpet, window, partition), the Stage's comparison of the rooms and the Shop's card and picture are the UI runners': mutate-decorate-ui.py (the grow-* mutants, check decorate-grow) and
# mutate-shop-ui.py (the room-*, stage-* and kid-home-* mutants, checks room-buy, room-undo, room-kid).
#
# It works on a COPY of the repo (grow-unit-copy/), never on the real tree. Each mutant is one exact text replace whose `old` must occur exactly once in its file. Only the test files below run
# per mutant: a mutant counts only when ITS named test fails, so the rest of the suite cannot change the verdict. A mutant is CAUGHT only when the test named in `expect` (a substring of its full
# name, in `expect_file`) fails.
#
#   python3 mutate-grow-unit.py --list   checks each `old` occurs once in the real files, prints the table, runs no tests
#   python3 mutate-grow-unit.py          makes a fresh copy, runs the baseline, then every mutant, then checks the copy
#   python3 mutate-grow-unit.py --only id1,id2   the same, for these mutants only
#   python3 mutate-grow-unit.py --equivalents    runs the EQUIVALENT list (the mutants argued to change nothing) instead: exit 0 only when every one of them leaves every test passing
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
COPY = os.path.join(VERIFY_OUT, "grow-unit-copy")
ORIG = os.path.join(VERIFY_OUT, "grow-unit-orig")
OUT = os.path.join(VERIFY_OUT, "grow-unit-out")
T_GROW = "tests/home-grow.test.ts"
T_HOME = "tests/home.test.ts"
T_WALLS = "tests/home-walls.test.ts"
T_EDIT = "tests/home-edit.test.ts"
T_LAYOUT = "tests/home-layout.test.ts"
T_DECOR = "tests/game-decor.test.ts"
T_SHOP = "tests/shop.test.ts"
T_REQ = "tests/requests.test.ts"
VITEST = ["npx", "vitest", "run", T_GROW, T_HOME, T_WALLS, T_EDIT, T_LAYOUT, T_DECOR, T_SHOP, T_REQ, "--cache=false", "--fsModuleCache=false", "--reporter=json"]
TEST_FILE = T_GROW
TIMEOUT_S = 600
EQUIV_MODE = False

F_DATA_HOME = "src/data/home.ts"
F_DATA_SHOP = "src/data/shop.ts"
F_HOME = "src/art/home.ts"
F_LAYOUT = "src/art/homeLayout.ts"
F_EDIT = "src/art/homeEdit.ts"
F_ROOM = "src/art/room.ts"
F_SHOP = "src/game/shop.ts"
F_REQ = "src/game/requests.ts"
F_GAME = "src/ui/game.ts"


def mut(id, file, old, new, expect, test=T_GROW):
    return dict(id=id, file=file, old=old, new=new, expect=expect, expect_file=test)


# Test titles (substrings of the full test names)
BUILT = "is the three base rooms, and the Playroom once its item is owned"
COLS = "gives the columns of a home with that many rooms: 32 with three, 43 with four"
ISBUILT = "says which rooms are built for what a save owns"
FLOOR3 = "with three rooms the home is 768 wide and nothing past column 31 is floor"
FLOOR4 = "with four rooms the home is 1032 wide"
SAME_STARTER = "the same starter layout at three and then four rooms changes the floor and the width"
WITH_LAYOUT = "`withLayout` runs on the rooms it is given and puts the layout and the rooms back"
RULE1 = "rule 1: a piece may stand in the Playroom only when it is built"
RULE5 = "rule 5: a solid piece that closes the new doorway is refused with four rooms"
STARTER_PASSES = "the starter layout passes with three rooms and with four"
MEND = "with three rooms the table at (30, 4) is where it was put; with four, it is put away and every other piece stays"
KEEPS = "keeps the player's other moves"
NEAREST = "puts away the piece nearest the doorway first and stops as soon as the rules pass"
NOBED = "never puts the bed away: a bed that closes the doorway cannot be mended"
NOBED_NEAREST = "never puts the bed away even when it is the nearest piece to the doorway"
TIES = "breaks a tie between two pieces the same distance from the doorway by the pieces' own order"
ROOM_OF = "`roomOf` names the Playroom's columns once it is built"
ROOM_LIST = "lists the rooms and partitions as the plan says, and the Playroom is built by the Shop's one room item"
PUT_AWAY_WITH_ROOM = "a piece is put away, and nudged, while another stands in the Playroom"
SAME_OBJECT = "is the same layout object each time for the same home and rooms, and a different one for different rooms"
UNBUILT_PIECE = "a piece in the Playroom while it is not built is a layout that breaks a rule with three rooms"
OUTSIDE = "a piece far outside the home is the starter layout at any number of rooms"
LANDS = "a piece out of the tray lands in the Playroom when the view is there, and in the kitchen when the room is not built"
GREEN = "a piece dragged into the Playroom is green there with four rooms and red with three, and is dropped there only with four"
HALF = "a piece dropped half in the kitchen and half in the Playroom, or on the partition, goes back"
WALL_ROOM = "the Playroom's wall is columns 33 to 42 of rows 0 and 1 once it is built"
VOID = "a tap in the void past a three-room home selects no wall"
WITHOUT = "`withoutRoom` puts away every piece the save has inside the room (null, never a deleted key) and drops the room's wallpaper, and leaves the rest"
WITHOUT_SAME = "gives the very same home when nothing is in the room, and no `walls` key when the Playroom's was the only wallpaper"
UNDO_ROOM = "the Shop's undo of the Playroom gives back its price and puts away what stood in it"
BED_UNDO = "the bed cannot be put away: a bed saved inside the room goes back to its starter place"
NOT_A_ROOM = "undoing something that is not a room leaves the home as it is"
LOOK = "a look has the rooms built and the Playroom's wall"
SELECT_UNBUILT = "a room that is not built cannot be selected or given a wallpaper, and nothing is saved for it"
SELECT_BUILT = "a built room can: its wall is selected and a wallpaper is saved for it alone"
LET_GO = "a selected wall whose room is given back is let go"
TRAY_LANDS = "a piece brought out of the tray lands in the Playroom when the view is there, and the arrow keys do not take it across the partition or off the end"
TRAY_KITCHEN = "with the room not built the same tray piece lands in the kitchen or earlier, never past column 31"
FOURTEEN = "has fourteen items at these prices, in this order, with the care items' words"
REQUEST = "with only the Playroom left to own, a buy request may name it and no reward is ever drawn"

# Not mutated (each argued from the code; `--equivalents` applies each one and exits 0 only when every test still passes, which is the proof that the argument holds):
#  - withoutRoom with the bed let into `inside` (the filter's `kind !== "bed"` removed): the bed is nulled there, and the very next line deletes its key (`if (bedInside) delete pieces.bed;`), so
#    the result is the same; the mutant that leaves the bed put away is "room-undo-puts-the-bed-away", and the one that keeps it where it was is "room-undo-keeps-the-bed".
#  - dropping `n < ROOMS.length &&` in roomsBuilt: `owned.includes(ROOMS[4]?.item as string)` is `includes(undefined)`, which is false for a list of strings, so the loop stops at 4 either way.
#  - `col + cols <= colsOf(rooms)` written as `<= COLS` in nearestSpot: a spot past the rooms built is refused by `moved(..., rooms)` (rule 1), so `find` returns the same first allowed spot.
#  - `col < colsOf(rooms)` written as `col < COLS` in the rule 5 loop of problemWith: `fits` is false on every tile past the rooms built, so the loop reads nothing more.
#  - the clamp of nearestFree to `colsOf(ROOMS_BUILT) - 1` written as `COLS - 1`: the search walks the void until it reaches the same last column of the rooms built.
# id, file, old (exact, must occur once in the file), new, expect (substring of the test's full name), expect_file
EQUIVALENT = [
    mut("built-needs-no-bound", F_DATA_HOME, "while (n < ROOMS.length && owned.includes(ROOMS[n]?.item as string)) n++;", "while (owned.includes(ROOMS[n]?.item as string)) n++;", "(none)"),
    mut("nearest-spot-ends-at-the-widest-home", F_EDIT, "col + cols <= colsOf(rooms)", "col + cols <= COLS", "(none)"),
    mut("rule5-walks-the-widest-home", F_LAYOUT, "for (let col = 0; col < colsOf(rooms); col++) {", "for (let col = 0; col < COLS; col++) {", "(none)"),
    mut("nearest-free-clamps-to-the-widest-home", F_HOME, "Math.min(colsOf(ROOMS_BUILT) - 1, col)", "Math.min(COLS - 1, col)", "(none)"),
    mut("room-undo-nulls-then-deletes-the-bed", F_DATA_HOME, 'const inside = KINDS.filter((kind) => kind !== "bed" && inRoom(kind));', "const inside = KINDS.filter((kind) => inRoom(kind));", "(none)"),
]

MUTANTS = [
    # how many rooms, how wide
    mut("built-needs-no-item", F_DATA_HOME, "while (n < ROOMS.length && owned.includes(ROOMS[n]?.item as string)) n++;", "while (n < ROOMS.length) n++;", BUILT),
    mut("built-starts-at-four", F_DATA_HOME, "let n = BASE_ROOMS;", "let n = BASE_ROOMS + 1;", BUILT),
    mut("cols-not-clamped-low", F_DATA_HOME, "Math.min(ROOMS.length, Math.max(BASE_ROOMS, rooms))", "Math.min(ROOMS.length, rooms)", COLS),
    mut("cols-not-clamped-high", F_DATA_HOME, "Math.min(ROOMS.length, Math.max(BASE_ROOMS, rooms))", "Math.max(BASE_ROOMS, rooms)", COLS),
    mut("is-built-one-too-many", F_DATA_HOME, "ROOMS.findIndex((r) => r.id === room) < roomsBuilt(owned)", "ROOMS.findIndex((r) => r.id === room) <= roomsBuilt(owned)", ISBUILT),
    mut("wall-room-past-the-rooms", F_DATA_HOME, "col >= colsOf(rooms)) return null;", "col >= COLS) return null;", VOID),
    mut("wall-room-default-all", F_DATA_HOME, "export function wallRoomOf(col: number, row: number, rooms: number = BASE_ROOMS)", "export function wallRoomOf(col: number, row: number, rooms: number = ROOMS.length)", VOID),
    # what is saved about a room
    mut("room-undo-deletes-keys", F_DATA_HOME, "const pieces = { ...home.pieces, ...Object.fromEntries(inside.map((kind) => [kind, null])) };", "const pieces = { ...home.pieces };\n  for (const kind of inside) delete pieces[kind];", WITHOUT),
    mut("room-undo-puts-the-bed-away", F_DATA_HOME, "if (bedInside) delete pieces.bed;", "if (bedInside) pieces.bed = null;", BED_UNDO),
    mut("room-undo-keeps-the-bed", F_DATA_HOME, "if (bedInside) delete pieces.bed;", "", BED_UNDO),
    mut("room-undo-keeps-the-wall", F_DATA_HOME, "Object.entries(home.walls ?? {}).filter(([key]) => key !== id)", "Object.entries(home.walls ?? {})", WITHOUT),
    mut("room-undo-first-column-left", F_DATA_HOME, "return at !== undefined && at !== null && at.col >= room.from;", "return at !== undefined && at !== null && at.col > room.from;", WITHOUT),
    mut("room-undo-always-copies", F_DATA_HOME, "if (inside.length === 0 && !bedInside && !hasWall) return home;", "if (false) return home;", WITHOUT_SAME),
    mut("room-undo-keeps-empty-walls", F_DATA_HOME, "return Object.keys(walls).length > 0 ? { pieces, walls } : { pieces };", "return { pieces, walls };", WITHOUT_SAME),
    # the floor, the width and the walking of the home in force
    mut("floor-ignores-the-rooms", F_HOME, "if (col >= cols || row < WALL_ROWS) return false;", "if (row < WALL_ROWS) return false;", FLOOR3),
    mut("use-layout-looks-at-the-layout-only", F_HOME, "if (layout === LAYOUT && rooms === ROOMS_BUILT) return;", "if (layout === LAYOUT) return;", SAME_STARTER),
    mut("use-layout-keeps-the-width", F_HOME, "HOME.w = colsOf(rooms) * TILE;", "", SAME_STARTER),
    mut("with-layout-forgets-the-rooms", F_HOME, "useLayout(before, roomsBefore);", "useLayout(before);", WITH_LAYOUT),
    mut("room-of-past-the-end", F_HOME, "Math.min(colsOf(ROOMS_BUILT) - 1, Math.floor(x / TILE))", "Math.min(COLS - 1, Math.floor(x / TILE))", ROOM_OF),
    # the six rules with four rooms, and the mended layout
    mut("rule1-every-room", F_LAYOUT, "ROOMS.slice(0, rooms).some(", "ROOMS.some(", RULE1),
    mut("rule5-walks-three-rooms", F_LAYOUT, "for (let col = 0; col < colsOf(rooms); col++) {", "for (let col = 0; col < colsOf(BASE_ROOMS); col++) {", RULE5),
    mut("rules-tried-on-the-rooms-in-force", F_LAYOUT, "  }, rooms);\n}", "  });\n}", RULE5),
    mut("mend-puts-away-everything", F_LAYOUT, "if (problemWith(next, rooms) === null) return next;", "if (p === candidates[candidates.length - 1]) return problemWith(next, rooms) === null ? next : null;", KEEPS),
    mut("mend-farthest-first", F_LAYOUT, ".sort((a, b) => nearness(a) - nearness(b) ||", ".sort((a, b) => nearness(b) - nearness(a) ||", NEAREST),
    mut("mend-ties-by-the-last-kind", F_LAYOUT, "|| KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind));", "|| KINDS.indexOf(b.kind) - KINDS.indexOf(a.kind));", TIES),
    mut("mend-puts-the-bed-away", F_LAYOUT, '.filter((p) => p.solid && p.kind !== "bed")', ".filter((p) => p.solid)", NOBED_NEAREST),
    mut("mend-a-broken-layout", F_LAYOUT, "if (rooms <= BASE_ROOMS || problemWith(layout, BASE_ROOMS) !== null) return null;", "if (rooms <= BASE_ROOMS) return null;", OUTSIDE),
    mut("layout-of-keyed-without-rooms", F_LAYOUT, "const key = `${rooms}:${JSON.stringify(home.pieces)}`;", "const key = JSON.stringify(home.pieces);", SAME_OBJECT),
    mut("layout-of-never-mends", F_LAYOUT, "(mended(layout, rooms) ?? STARTER)", "STARTER", MEND),
    mut("layout-of-save-ignores-the-rooms", F_LAYOUT, "layoutOf(save.home, roomsBuilt(save.owned));", "layoutOf(save.home);", TRAY_LANDS),
    # editing with four rooms
    mut("moved-ignores-the-rooms", F_EDIT, "return problemWith(next, rooms) === null ? next : null;", "return problemWith(next) === null ? next : null;", GREEN),
    mut("nearest-spot-ends-at-three-rooms", F_EDIT, "col + cols <= colsOf(rooms)", "col + cols <= colsOf(BASE_ROOMS)", LANDS),
    mut("nearest-spot-asks-three-rooms", F_EDIT, "const found = spots.find((s) => moved(layout, kind, s, rooms) !== null);", "const found = spots.find((s) => moved(layout, kind, s) !== null);", LANDS),
    mut("follow-asks-three-rooms", F_EDIT, "valid: moved(layout, held.kind, at, rooms) !== null", "valid: moved(layout, held.kind, at) !== null", GREEN),
    mut("drop-asks-three-rooms", F_EDIT, "return moved(layout, held.kind, held.at, rooms);", "return moved(layout, held.kind, held.at);", GREEN),
    # the Shop, the requests and the look
    mut("room-price-changed", F_DATA_SHOP, "price: { coins: 36, materials: { wood: 4, stone: 4 } },", "price: { coins: 35, materials: { wood: 4, stone: 4 } },", FOURTEEN, T_SHOP),
    mut("room-words-changed", F_DATA_SHOP, 'effect: "A fourth room, to the right of the kitchen. It starts empty.",', 'effect: "A fourth room.",', ROOM_LIST),
    mut("room-undo-leaves-what-stood-in-it", F_SHOP, "if (room) home = withoutRoom(home, room.id);", "", UNDO_ROOM),
    mut("reward-may-be-a-room", F_REQ, 'items[id].kind !== "room" && ', "", REQUEST, T_REQ),
    mut("look-has-three-rooms", F_ROOM, "rooms: roomsBuilt(save.owned),", "rooms: BASE_ROOMS,", LOOK),
    mut("look-has-no-playroom-wall", F_ROOM, 'playroom: wallOfRoom(save.wall, save.home, "playroom"),', "playroom: null,", LOOK),
    mut("look-layout-ignores-the-rooms", F_ROOM, "layout: layoutOf(save.home, roomsBuilt(save.owned)),", "layout: layoutOf(save.home),", LOOK),
    # what Decorate mode may select and where it puts things
    mut("wall-selected-when-given-back", F_GAME, "return room !== null && isBuilt(room, this.save.owned) ? room : null;", "return room;", LET_GO),
    mut("wall-selects-an-unbuilt-room", F_GAME, "if (!this.decor || !isBuilt(room, this.save.owned) || (this.decor.wall === room && this.decor.selected === null)) return;", "if (!this.decor || (this.decor.wall === room && this.decor.selected === null)) return;", SELECT_UNBUILT),
    mut("wallpaper-for-an-unbuilt-room", F_GAME, "if (!this.decor || !isBuilt(room, this.save.owned) || (id !== null &&", "if (!this.decor || (id !== null &&", SELECT_UNBUILT),
    mut("tray-piece-asks-three-rooms", F_GAME, "nearestSpot(layout, kind, near, roomsBuilt(this.save.owned))", "nearestSpot(layout, kind, near)", TRAY_LANDS),
    mut("put-away-asks-three-rooms", F_GAME, "moved(layoutOfSave(this.save), kind, null, roomsBuilt(this.save.owned))", "moved(layoutOfSave(this.save), kind, null)", PUT_AWAY_WITH_ROOM),
    mut("nudge-asks-three-rooms", F_GAME, "moved(layout, kind, { col: from.col + dcol, row: from.row + drow }, roomsBuilt(this.save.owned))", "moved(layout, kind, { col: from.col + dcol, row: from.row + drow })", TRAY_LANDS),
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
    if EQUIV_MODE:
        return 0 if counts["SURVIVED"] == len(MUTANTS) else 1
    return 0 if counts["CAUGHT"] == len(MUTANTS) else 1


def main():
    global EQUIV_MODE
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--list", action="store_true", help="check the occurrences and print the mutants; run no tests")
    ap.add_argument("--equivalents", action="store_true", help="run the EQUIVALENT mutants instead: each must leave every test passing (SURVIVED), else the argument for leaving it out is wrong")
    ap.add_argument("--only", help="run only these mutants (comma separated ids), after the same baseline; the summary counts only them (an unknown or empty id stops the run, exit 2)")
    args = ap.parse_args()
    if args.equivalents:
        EQUIV_MODE = True
        MUTANTS[:] = EQUIVALENT
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
