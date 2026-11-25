#!/usr/bin/env python3
# Mutation runner for the pure side of the hats (Broodkeep, adult track A2.4, docs/adult-a2-plan.md section 12): which row of a picture a hat sits on (art/hat.ts crownRow), how it is
# laid on the picture (withHat: the size, the clipping, the hold on the second drawing, nothing changed in place), the cache of hatted pictures (art/face.ts faceSprite), the four hats
# in the catalogue (data/shop.ts), wearing, buying and undoing one (game/shop.ts useHat, buy, undoBuy) and what a saved hat may be (game/state.ts). The drawing in the scene, the
# habitat and the shop preview, and the screen's buttons, are the UI runner's (mutate-shop-ui.py: the checks hat-wear, hat-preview, hat-places, hat-bed).
#
# It works on a COPY of the repo (hats-unit-copy/), never on the real tree. Each mutant is one exact text replace whose `old` must occur exactly once in its file. Only the three test
# files run per mutant (tests/hats, tests/shop and tests/requests): a mutant counts only when ITS named test fails, so the rest of the suite cannot change the verdict. A mutant is CAUGHT only when
# the test named in `expect` (a substring of its full name, in `expect_file`) fails.
#
#   python3 mutate-hats-unit.py --list   checks each `old` occurs once in the real files, prints the table, runs no tests
#   python3 mutate-hats-unit.py          makes a fresh copy, runs the baseline, then every mutant, then checks the copy
#   python3 mutate-hats-unit.py --only id1,id2   the same, for these mutants only
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
COPY = os.path.join(VERIFY_OUT, "hats-unit-copy")
ORIG = os.path.join(VERIFY_OUT, "hats-unit-orig")
OUT = os.path.join(VERIFY_OUT, "hats-unit-out")
T_HATS = "tests/hats.test.ts"
T_SHOP = "tests/shop.test.ts"
T_REQ = "tests/requests.test.ts"
VITEST = ["npx", "vitest", "run", T_HATS, T_SHOP, T_REQ, "--cache=false", "--fsModuleCache=false", "--reporter=json"]
TEST_FILE = T_HATS
TIMEOUT_S = 600

F_HAT = "src/art/hat.ts"
F_FACE = "src/art/face.ts"
F_DATA = "src/data/shop.ts"
F_SHOP = "src/game/shop.ts"
F_STATE = "src/game/state.ts"
F_SKY = "src/data/forms/sky.ts"
F_REQ = "src/game/requests.ts"


def mut(id, file, old, new, expect, test=T_HATS):
    return dict(id=id, file=file, old=old, new=new, expect=expect, expect_file=test)


# Test titles (substrings of the full test names)
SPIKE = "edge 1: a one-cell spike on top of a wide head is not the crown; the first wide row is"
EXACT = "edge 1: a row exactly round(0.4 x the widest) wide is the crown, one cell narrower is not"
FLOOR = "edge 1: with the widest row 5 wide the floor of 3 matters"
LANDS_BLIP = "where the hat lands (edge 8) blip open with hat-knit"
LANDS_MUDLOP = "where the hat lands (edge 8) mudlop droop with hat-knit"
LAYS = "lays the hat's last row on the crown row, centred on its span, and changes nothing else"
EMPTY = "edge 2: an empty picture comes back as the same object"
TOP0 = "edge 3: when the crown row is row 0 the hat starts at row 0 and nothing is written above it"
EDGES = "edge 4: a hat wider than the picture, and a head against the left or right edge, are cut off and never wrap"
NOCHANGE = "edge 5: the input is never changed"
EVERY = "keeps the size, changes only the hat's cells, shows the hat, and clashes with no form's letter"
ART = "each hat has a small 7 wide grid and a large 13 wide one, rectangular, in its own letters 1 to 5, and the right size follows the stage"
BLANKET = "a hat moves blanketBox for some lying pictures"
HOP = "between the two drawings it moves at most 2 rows and 2 columns"
CARDS = "edge 30: the cards' words"
PRICES = "edge 18: the hats are items 10 to 13, 12 coins and 2 of one material each, with no dish, and are not wallpaper"
ISHAT = "edge 27: isHatId is true for the four hats and nothing else"
USE_OK = "edge 11: an owned hat goes on (true); the one already on changes nothing (false); null takes it off (true); null with none on is false"
USE_BAD = "edge 11: a hat not owned, a wallpaper, a food, a prototype name, an empty string and a number change nothing"
BUY = "edge 12: buying a hat takes the price in one step and does not put it on"
UNDO = "edge 13: undoing a worn hat takes it off, with the exact refund; a hat that is not worn, or another worn hat, is left alone"
MIG_NONE = "edge 14: a save with no hat field reads as none; an owned hat is kept"
MIG_BAD = "edge 14: a hat that is not owned, a wallpaper, an unknown id, a prototype name, a number and an object all read as none"
FRESH = "edge 15: a fresh save wears none"
EVOLVE = "edge 28: evolving while wearing a hat keeps it, and the size follows the new form's stage"
THIRTEEN = "has thirteen items at these prices, in this order, with the care items' words"
SAVED_DOC = "edge 17: the hat, the purchase and the coins it cost are fields of the one saved document"
POOL_HATS = "with only the four hats left to own, a buy request names a hat the creature can pay for and a reward is a hat"
REWARD_HAT = "a hat paid as the item arrives owned and not worn"

# Not mutated (each argued from the code, and each applied by hand once with the three test files passing, 2026-11-25):
#  - removing `col >= 0` in withHat: a negative column writes a property on the `cells` array, which `join("")` ignores, so the row is the same (JavaScript arrays do not wrap).
#  - `if (widest === 0) return null;` in crownRow: with no filled cell `need` is 3 and no span qualifies, so `findIndex` gives -1 and the function returns null anyway.
#  - `isHatId` written with `in` or without the own-key check: it ends in `items[id].kind === "hat"`, and no member every object has (constructor, toString, ...) has a `kind`, so it
#    is false for them either way. (The own-key check of `isItemId` is the shop runner's, mutate-shop-unit.py.)
#  - `Math.ceil` for the `+ 0.5` of the left edge: the hat is an odd number of columns wide and the centre is a whole or a half, so `ceil(x)` and `floor(x + 0.5)` agree.
# id, file, old (exact, must occur once in the file), new, expect (substring of the test's full name), expect_file
MUTANTS = [
    # which row a hat sits on
    mut("crown-share-half", F_HAT, "const MIN_SHARE = 0.4;", "const MIN_SHARE = 0.5;", EXACT),
    mut("crown-share-third", F_HAT, "const MIN_SHARE = 0.4;", "const MIN_SHARE = 0.3;", EXACT),
    mut("crown-share-rounds-down", F_HAT, "Math.round(widest * MIN_SHARE)", "Math.floor(widest * MIN_SHARE)", EXACT),
    mut("crown-share-rounds-up", F_HAT, "Math.round(widest * MIN_SHARE)", "Math.ceil(widest * MIN_SHARE)", EXACT),
    mut("crown-floor-two", F_HAT, "const MIN_CELLS = 3;", "const MIN_CELLS = 2;", FLOOR),
    mut("crown-floor-four", F_HAT, "const MIN_CELLS = 3;", "const MIN_CELLS = 4;", FLOOR),
    mut("crown-is-the-last-wide-row", F_HAT, "const row = spans.findIndex((span) => span !== null && span.last - span.first + 1 >= need);", "const row = spans.map((span) => span !== null && span.last - span.first + 1 >= need).lastIndexOf(true);", SPIKE),
    mut("crown-centre-of-the-first-row", F_HAT, "const span = spans[row];\n  return span ?", "const span = spans[row] && spans.find((s) => s !== null);\n  return span ?", LANDS_BLIP),
    mut("crown-centre-rounds-down", F_HAT, "centre: (span.first + span.last) / 2 }", "centre: Math.floor((span.first + span.last) / 2) }", SPIKE),
    # how it is laid on the picture
    mut("hat-one-row-up", F_HAT, "const top = Math.max(0, crown.row + 1 - grid.length);", "const top = Math.max(0, crown.row - grid.length);", LAYS),
    mut("hat-one-row-down", F_HAT, "const top = Math.max(0, crown.row + 1 - grid.length);", "const top = Math.max(0, crown.row + 2 - grid.length);", LAYS),
    mut("hat-two-rows-up", F_HAT, "const top = Math.max(0, crown.row + 1 - grid.length);", "const top = Math.max(0, crown.row - 1 - grid.length);", BLANKET),
    mut("hat-not-moved-down-at-row-0", F_HAT, "const top = Math.max(0, crown.row + 1 - grid.length);", "const top = crown.row + 1 - grid.length;", TOP0),
    mut("hat-left-rounds-down", F_HAT, "Math.floor(crown.centre - grid[0]!.length / 2 + 0.5)", "Math.floor(crown.centre - grid[0]!.length / 2)", LANDS_MUDLOP),
    mut("hat-column-0-dropped", F_HAT, "col >= 0 && col < cells.length", "col > 0 && col < cells.length", EDGES),
    mut("hat-last-column-dropped", F_HAT, "col >= 0 && col < cells.length", "col >= 0 && col < cells.length - 1", EDGES),
    mut("hat-past-the-right-edge-kept", F_HAT, "col >= 0 && col < cells.length", "col >= 0", EDGES),
    mut("hat-changes-the-palette-in-place", F_HAT, "return { rows, palette: { ...sprite.palette, ...art.palette } };", "Object.assign(sprite.palette, art.palette);\n  return { rows, palette: sprite.palette };", NOCHANGE),
    mut("hat-changes-the-rows-in-place", F_HAT, '    return cells.join("");', '    return (sprite.rows[y] = cells.join(""));', NOCHANGE),
    mut("hat-empty-picture-copied", F_HAT, "if (!crown) return sprite;", "if (!crown) return { rows: [...sprite.rows], palette: { ...sprite.palette } };", EMPTY),
    mut("hat-sizes-swapped", F_HAT, 'hatSizeOf(stage) === "small" ? art.small : art.large', 'hatSizeOf(stage) === "small" ? art.large : art.small', ART),
    mut("kid-gets-the-large-hat", F_HAT, 'stage === "baby" || stage === "kid" ? "small" : "large"', 'stage === "baby" ? "small" : "large"', ART),
    mut("young-gets-the-small-hat", F_HAT, 'stage === "baby" || stage === "kid" ? "small" : "large"', 'stage !== "adult" ? "small" : "large"', ART),
    mut("hold-removed", F_HAT, "if (home) crown =", "if (false && home) crown =", HOP),
    mut("hold-of-three", F_HAT, "const MAX_HOP = 2;", "const MAX_HOP = 3;", HOP),
    mut("hold-rows-unclamped", F_HAT, "row: within(crown.row, home.row)", "row: crown.row", HOP),
    mut("hold-columns-unclamped", F_HAT, "centre: within(crown.centre, home.centre)", "centre: crown.centre", HOP),
    # the cache of hatted pictures
    mut("cache-key-without-the-hat", F_FACE, "const hatKey = `${key}:${hat}`;", "const hatKey = key;", NOCHANGE),
    mut("cache-key-shared-by-hats", F_FACE, "const hatKey = `${key}:${hat}`;", "const hatKey = `${key}:hat`;", EVERY),
    mut("hat-size-of-the-wrong-stage", F_FACE, "form.stage, second ?", '"adult", second ?', EVOLVE),
    mut("second-drawing-not-held", F_FACE, "second ? faceSprite(form, kind, 0) : undefined", "undefined", HOP),
    mut("a-form-uses-a-hat-letter", F_SKY, 'role: "quick",\n    palette: { I: "#2b2255", W:', 'role: "quick",\n    palette: { "2": "#ff0000", I: "#2b2255", W:', EVERY),
    # the catalogue
    mut("hat-price-changed", F_DATA, 'effect: "A brown acorn cap. For looks only.",\n    price: { coins: 12, materials: { wood: 2 } },', 'effect: "A brown acorn cap. For looks only.",\n    price: { coins: 13, materials: { wood: 2 } },', PRICES),
    mut("hat-has-a-dish", F_DATA, 'effect: "A red knit cap with a pom-pom. For looks only.",\n    price: { coins: 12, materials: { fiber: 2 } },', 'effect: "A red knit cap with a pom-pom. For looks only.",\n    price: { coins: 12, materials: { fiber: 2 } },\n    dish: { food: 0 },', PRICES),
    mut("hat-is-a-wallpaper", F_DATA, 'kind: "hat",\n    effect: "A yellow fisher\'s hat with a brim. For looks only.",', 'kind: "wallpaper",\n    effect: "A yellow fisher\'s hat with a brim. For looks only.",', PRICES),
    mut("hat-words-changed", F_DATA, 'effect: "A grey crown with three points. For looks only.",', 'effect: "A grey crown with three points.",', CARDS),
    mut("items-in-reverse", F_DATA, "export const itemIds = Object.keys(items) as ItemId[];", "export const itemIds = (Object.keys(items) as ItemId[]).reverse();", THIRTEEN, T_SHOP),
    mut("is-hat-id-takes-any-item", F_DATA, 'isItemId(id) && items[id].kind === "hat"', "isItemId(id)", ISHAT),
    mut("hat-of-is-always-none", F_HAT, "(isHatId(save.hat) ? save.hat : null)", "null", "edge 16: a retire and a new egg leave the hat"),
    # wearing, buying and undoing
    mut("use-hat-takes-the-unowned", F_SHOP, "if (id !== null && !(isHatId(id) && save.owned.includes(id))) return false;\n  if (save.hat", "if (id !== null && !isHatId(id)) return false;\n  if (save.hat", USE_BAD),
    mut("use-hat-takes-a-wallpaper", F_SHOP, "if (id !== null && !(isHatId(id) && save.owned.includes(id))) return false;\n  if (save.hat", "if (id !== null && !save.owned.includes(id)) return false;\n  if (save.hat", USE_BAD),
    mut("use-hat-same-hat-is-a-change", F_SHOP, "  if (save.hat === id) return false;\n  save.hat = id;", "  save.hat = id;", USE_OK),
    mut("use-hat-null-with-none-is-a-change", F_SHOP, "if (save.hat === id) return false;\n  save.hat = id;", "if (save.hat === id && id !== null) return false;\n  save.hat = id;", USE_OK),
    mut("buy-puts-the-hat-on", F_SHOP, 'if (item.kind === "wallpaper") save.wall = item.id;', 'if (item.kind === "wallpaper") save.wall = item.id;\n  if (item.kind === "hat") save.hat = item.id;', BUY),
    mut("undo-leaves-the-hat-on", F_SHOP, "if (save.hat === item.id) save.hat = null;", "", UNDO),
    mut("undo-takes-any-hat-off", F_SHOP, "if (save.hat === item.id) save.hat = null;", 'if (items[item.id].kind === "hat") save.hat = null;', UNDO),
    # what a save may hold
    mut("migrate-keeps-the-unowned-hat", F_STATE, "isHatId(value.hat) && value.owned.includes(value.hat) ? value.hat : null", "isHatId(value.hat) ? value.hat : null", MIG_BAD),
    mut("migrate-keeps-any-owned-id", F_STATE, "isHatId(value.hat) && value.owned.includes(value.hat) ? value.hat : null", "value.owned.includes(value.hat) ? value.hat : null", MIG_BAD),
    mut("migrate-no-default", F_STATE, "isHatId(value.hat) && value.owned.includes(value.hat) ? value.hat : null", "isHatId(value.hat) && value.owned.includes(value.hat) ? value.hat : value.hat", MIG_NONE),
    mut("new-save-wears-a-hat", F_STATE, "    hat: null,", '    hat: "hat-knit",', FRESH),
    mut("migrate-forgets-the-hat", F_STATE, "isHatId(value.hat) && value.owned.includes(value.hat) ? value.hat : null", "null", SAVED_DOC),
    # the request board (a hat can be asked for and paid as a reward; a reward is owned and not worn)
    mut("buy-request-pool-without-hats", F_REQ, "pool = itemIds.filter((id) => !save.owned.includes(id) && !carried.has(id) && payable(save, c, id));", 'pool = itemIds.filter((id) => !save.owned.includes(id) && !carried.has(id) && payable(save, c, id) && !id.startsWith("hat-"));', POOL_HATS, T_REQ),
    mut("reward-pool-without-hats", F_REQ, "const pool = itemIds.filter((id) => !save.owned.includes(id) && !named.has(id));", 'const pool = itemIds.filter((id) => !save.owned.includes(id) && !named.has(id) && !id.startsWith("hat-"));', POOL_HATS, T_REQ),
    mut("reward-wears-the-hat", F_REQ, "save.owned.push(r.item);", 'save.owned.push(r.item);\n    if (r.item.startsWith("hat-")) save.hat = r.item;', REWARD_HAT, T_REQ),
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
