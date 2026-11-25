#!/usr/bin/env python3
# Mutation runner for the pure side of the wallpaper for each room (Broodkeep, Home slice H2c, docs/home-plan.md section 14): which wallpaper a room shows (data/home.ts wallOfRoom), which
# room a wall tile belongs to (wallRoomOf), what a saved `walls` may hold (coerceHome, ownedWalls, migrateSave), what the Shop's undo takes off (withoutWall), the look of each room
# (art/room.ts lookOf, plainLook) and Decorate mode's wall selection and setWall on the game (ui/game.ts). The drawing and the screen are the UI runner's (mutate-decorate-ui.py, the
# check decorate-walls).
#
# It works on a COPY of the repo (walls-unit-copy/), never on the real tree. Each mutant is one exact text replace whose `old` must occur exactly once in its file. Only the two
# test files run per mutant (tests/home-walls and game-decor): a mutant counts only when ITS named test fails, so the rest of the suite cannot change the verdict. A mutant is CAUGHT
# only when the test named in `expect` (a substring of its full name, in `expect_file`) fails.
#
#   python3 mutate-walls-unit.py --list   checks each `old` occurs once in the real files, prints the table, runs no tests
#   python3 mutate-walls-unit.py          makes a fresh copy, runs the baseline, then every mutant, then checks the copy
#   python3 mutate-walls-unit.py --only id1,id2   the same, for these mutants only
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
COPY = os.path.join(VERIFY_OUT, "walls-unit-copy")
ORIG = os.path.join(VERIFY_OUT, "walls-unit-orig")
OUT = os.path.join(VERIFY_OUT, "walls-unit-out")
T_WALLS = "tests/home-walls.test.ts"
T_GAME = "tests/game-decor.test.ts"
VITEST = ["npx", "vitest", "run", T_WALLS, T_GAME, "--cache=false", "--fsModuleCache=false", "--reporter=json"]
TEST_FILE = T_WALLS
TIMEOUT_S = 600

F_DATA = "src/data/home.ts"
F_STATE = "src/game/state.ts"
F_SHOP = "src/game/shop.ts"
F_GAME = "src/ui/game.ts"
F_ROOM = "src/art/room.ts"


def mut(id, file, old, new, expect, test=T_WALLS):
    return dict(id=id, file=file, old=old, new=new, expect=expect, expect_file=test)


# Test titles (substrings of the full test names)
OWN = "shows its own entry, and the wall of the whole home when it has none"
NULL_PLAIN = "an entry of null is the plain wall, even when the whole home has a wallpaper"
PROTO = "does not take a room from the prototype chain"
ROOM_COLS = "names the room of every column of the wall rows, a partition going to the room on its left"
ROOM_NULL = "is null below the wall, above the home, and beside it"
WO_SAME = "withoutWall gives the very same home when no room shows that wallpaper"
WO_TAKES = "withoutWall takes the rooms that show it off, keeps the others and the pieces, and drops `walls` when none are left"
OW_DROPS = "ownedWalls drops a wallpaper that is not owned, keeps the plain wall and the owned ones"
HOMEOF = "homeOf writes the walls it is given, as a copy, and none when there are none"
KEEPS_WELL = "keeps a well-formed `walls`: room keys, each a wallpaper id or null"
DROPS_BAD = "drops a bad `walls` alone, and keeps the pieces (edge 7)"
MIG_DROPS = "drops a wallpaper that is not owned, keeping the others and the pieces"
UNDO_TAKES = "a room that shows it goes back to following the whole home's wall"
UNDO_NOHOME = "leaves a save with no home without one"
LOOK = "is the whole home's wall for a room with no entry, the entry for one with, and plain for the plain look"
SEL = "selects a room's wall and lets go of it; the screens are woken only when the selection changes"
EXCL = "a piece and a wall are never selected together (edge 11)"
GIVES = "gives a room an owned wallpaper: saved as the player's change, with the starter pieces written whole, and the other rooms untouched"
REFUSES = "refuses what is not owned, what is not a wallpaper, and what the room already shows; nothing is saved"
FOLLOWS = "refuses the wallpaper a room already shows by following the whole home's wall; the plain wall is then a change"
MODE_OFF = "does nothing when Decorate mode is off"
KEEPS = "moving a piece keeps the walls, and a wall keeps the pieces (edge 8)"

# Not mutated (each argued from the code):
#  - `Array.isArray(value)` in coerceWalls: an array has no key that is a room id (its keys are indexes), so without the check the loop finds no room and the result is the same `undefined`.
#    (`typeof value !== "object"` is NOT equivalent: it also turns `undefined`, a home with no `walls` key, into no walls; without it `Object.entries(undefined)` throws.)
# id, file, old (exact, must occur once in the file), new, expect (substring of the test's full name), expect_file
MUTANTS = [
    # which wallpaper a room shows
    mut("wall-of-room-ignores-its-entry", F_DATA, "(home?.walls && Object.hasOwn(home.walls, room) ? (home.walls[room] ?? null) : whole)", "whole", OWN),
    mut("wall-of-room-null-follows-the-whole", F_DATA, "home?.walls && Object.hasOwn(home.walls, room) ?", "home?.walls && home.walls[room] ?", NULL_PLAIN),
    mut("wall-of-room-takes-the-prototype", F_DATA, "Object.hasOwn(home.walls, room)", "room in home.walls", PROTO),
    # which room a wall tile belongs to
    mut("room-of-partition-goes-right", F_DATA, "(ROOMS.filter((r) => r.to < col).pop() as RoomSpan).id", "(ROOMS.find((r) => r.from > col) as RoomSpan).id", ROOM_COLS),
    mut("room-of-wall-is-three-rows", F_DATA, "row >= WALL_ROWS ||", "row > WALL_ROWS ||", ROOM_NULL),
    mut("room-of-row-above-the-home", F_DATA, "if (row < 0 || row >= WALL_ROWS", "if (row >= WALL_ROWS", ROOM_NULL),
    mut("room-of-column-before-the-home", F_DATA, "|| col < 0 || col >= colsOf(rooms))", "|| col >= colsOf(rooms))", ROOM_NULL),
    mut("room-of-column-past-the-home", F_DATA, "|| col < 0 || col >= colsOf(rooms))", "|| col < 0)", ROOM_NULL),
    # what the Shop's undo takes off
    mut("without-wall-copies-always", F_DATA, "if (!home?.walls || !Object.values(home.walls).includes(id)) return home;", "if (!home?.walls) return home;", WO_SAME),
    mut("without-wall-takes-every-room", F_DATA, ".filter(([, v]) => v !== id)", ".filter(() => false)", WO_TAKES),
    mut("without-wall-keeps-the-room", F_DATA, ".filter(([, v]) => v !== id)", ".filter(() => true)", WO_TAKES),
    mut("without-wall-keeps-empty-walls", F_DATA, 'v !== id)) as NonNullable<HomeSave["walls"]>;\n  return Object.keys(walls).length > 0 ? { pieces: home.pieces, walls } : { pieces: home.pieces };', 'v !== id)) as NonNullable<HomeSave["walls"]>;\n  return { pieces: home.pieces, walls };', WO_TAKES),
    mut("without-wall-loses-the-pieces", F_DATA, 'v !== id)) as NonNullable<HomeSave["walls"]>;\n  return Object.keys(walls).length > 0 ? { pieces: home.pieces, walls }', 'v !== id)) as NonNullable<HomeSave["walls"]>;\n  return Object.keys(walls).length > 0 ? { pieces: {}, walls }', WO_TAKES),
    mut("without-wall-changes-its-input", F_DATA, 'const walls = Object.fromEntries(Object.entries(home.walls).filter(([, v]) => v !== id)) as NonNullable<HomeSave["walls"]>;', 'const walls = home.walls;\n  for (const key of Object.keys(walls)) if ((walls as Record<string, unknown>)[key] === id) delete (walls as Record<string, unknown>)[key];', WO_TAKES),
    # what a saved `walls` may hold
    mut("owned-walls-drops-the-plain-wall", F_DATA, "id === null || owned.includes(id)", "id !== null && owned.includes(id)", OW_DROPS),
    mut("owned-walls-keeps-the-unowned", F_DATA, "id === null || owned.includes(id)", "true", OW_DROPS),
    mut("owned-walls-keeps-empty-walls", F_DATA, 'owned.includes(id))) as NonNullable<HomeSave["walls"]>;\n  return Object.keys(walls).length > 0 ? { pieces: home.pieces, walls } : { pieces: home.pieces };', 'owned.includes(id))) as NonNullable<HomeSave["walls"]>;\n  return { pieces: home.pieces, walls };', OW_DROPS),
    mut("home-of-shares-the-walls", F_DATA, "walls: { ...walls } }", "walls }", HOMEOF),
    mut("home-of-writes-empty-walls", F_DATA, "...(walls && Object.keys(walls).length > 0 ?", "...(walls ?", HOMEOF),
    mut("coerce-home-drops-the-walls", F_DATA, "return walls ? { pieces, walls } : { pieces };", "return { pieces };", KEEPS_WELL),
    mut("coerce-walls-takes-any-id", F_DATA, "if (!room || !(id === null || isWallId(id))) return undefined;", "if (!room) return undefined;", DROPS_BAD),
    mut("coerce-walls-skips-a-bad-key", F_DATA, "if (!room || !(id === null || isWallId(id))) return undefined;\n    walls[room.id] = id;", "if (!room) continue;\n    if (!(id === null || isWallId(id))) return undefined;\n    walls[room.id] = id;", DROPS_BAD),
    mut("coerce-walls-null-throws", F_DATA, 'typeof value !== "object" || value === null || Array.isArray(value)) return undefined;\n  const walls: NonNullable', 'typeof value !== "object" || Array.isArray(value)) return undefined;\n  const walls: NonNullable', DROPS_BAD),
    mut("coerce-walls-no-walls-throws", F_DATA, 'typeof value !== "object" || value === null || Array.isArray(value)) return undefined;\n  const walls: NonNullable', 'value === null || Array.isArray(value)) return undefined;\n  const walls: NonNullable', "an old save with no walls reads as it was (edge 6)"),
    mut("coerce-walls-keeps-an-empty-object", F_DATA, "return Object.keys(walls).length > 0 ? walls : undefined;", "return walls;", DROPS_BAD),
    mut("migrate-keeps-the-unowned", F_STATE, "if (home) value.home = ownedWalls(home, value.owned);", "if (home) value.home = home;", MIG_DROPS),
    # the Shop's undo
    mut("undo-keeps-the-room-walls", F_SHOP, "let home = withoutWall(save.home, item.id);", "let home = save.home;", UNDO_TAKES),
    mut("undo-makes-a-home", F_SHOP, "if (home) save.home = home;", "save.home = home;", UNDO_NOHOME),
    # the look of each room
    mut("look-of-bedroom-ignores-its-entry", F_ROOM, 'bedroom: wallOfRoom(save.wall, save.home, "bedroom")', "bedroom: save.wall", LOOK),
    mut("look-of-living-ignores-its-entry", F_ROOM, 'living: wallOfRoom(save.wall, save.home, "living")', "living: save.wall", LOOK),
    mut("look-of-kitchen-ignores-its-entry", F_ROOM, 'kitchen: wallOfRoom(save.wall, save.home, "kitchen")', "kitchen: save.wall", LOOK),
    mut("plain-look-has-a-wallpaper", F_ROOM, "walls: { bedroom: null, living: null, kitchen: null, playroom: null }, bed: false", 'walls: { bedroom: null, living: "wall-dusk", kitchen: null, playroom: null }, bed: false', LOOK),
    # Decorate mode: selecting a wall
    mut("select-keeps-the-wall", F_GAME, "    this.decor.selected = kind;\n    this.decor.wall = null;\n", "    this.decor.selected = kind;\n", EXCL, T_WALLS),
    mut("select-nothing-with-a-wall-does-nothing", F_GAME, "(this.decor.selected === kind && this.decor.wall === null)", "this.decor.selected === kind", SEL),
    mut("select-wall-keeps-the-piece", F_GAME, "    this.decor.wall = room;\n    this.decor.selected = null;\n", "    this.decor.wall = room;\n", EXCL),
    mut("start-without-the-wall-field", F_GAME, "this.decor = { selected: null, wall: null };", "this.decor = { selected: null };", "selects nothing when Decorate mode is off, and ending the mode lets go of the wall (edge 12)"),
    mut("select-wall-with-the-mode-off", F_GAME, "if (!this.decor || !isBuilt(room, this.save.owned) || (this.decor.wall === room && this.decor.selected === null)) return;", "if (this.decor && isBuilt(room, this.save.owned) && this.decor.wall === room && this.decor.selected === null) return;", "selects nothing when Decorate mode is off, and ending the mode lets go of the wall (edge 12)"),
    mut("select-wall-wakes-for-the-same-wall", F_GAME, "if (!this.decor || !isBuilt(room, this.save.owned) || (this.decor.wall === room && this.decor.selected === null)) return;", "if (!this.decor) return;", SEL),
    # Decorate mode: giving a room a wallpaper
    mut("set-wall-with-the-mode-off", F_GAME, "if (!this.decor || !isBuilt(room, this.save.owned) || (id !== null && !(isWallId(id)", "if (!isBuilt(room, this.save.owned) || (id !== null && !(isWallId(id)", MODE_OFF),
    mut("set-wall-takes-the-unowned", F_GAME, "(id !== null && !(isWallId(id) && this.save.owned.includes(id)))", "(id !== null && !isWallId(id))", REFUSES),
    mut("set-wall-takes-what-is-no-wallpaper", F_GAME, "(id !== null && !(isWallId(id) && this.save.owned.includes(id)))", "(id !== null && !this.save.owned.includes(id))", REFUSES),
    mut("set-wall-writes-what-is-shown", F_GAME, "|| wallOfRoom(this.save.wall, this.save.home, room) === id) return false;", ") return false;", REFUSES),
    mut("set-wall-compares-only-its-own-entry", F_GAME, "wallOfRoom(this.save.wall, this.save.home, room) === id) return false;", "this.save.home?.walls?.[room] === id) return false;", FOLLOWS),
    mut("set-wall-forgets-the-other-rooms", F_GAME, "{ ...save.home?.walls, [room]: id }", "{ [room]: id }", KEEPS),
    mut("set-wall-forgets-the-pieces", F_GAME, "homeOf(layoutOfSave(save), { ...save.home?.walls, [room]: id })", "homeOf(layoutOfSave({ owned: save.owned }), { ...save.home?.walls, [room]: id })", KEEPS),
    mut("set-layout-forgets-the-walls", F_GAME, "save.home = homeOf(layout, save.home?.walls);", "save.home = homeOf(layout);", KEEPS),
    mut("set-wall-is-not-saved", F_GAME, "      save.home = homeOf(layoutOfSave(save), { ...save.home?.walls, [room]: id });\n", "      void homeOf(layoutOfSave(save), { ...save.home?.walls, [room]: id });\n", GIVES),
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
