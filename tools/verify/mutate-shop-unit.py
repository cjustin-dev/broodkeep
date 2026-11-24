#!/usr/bin/env python3
# Mutation runner for the shop's rules and what its items do to the care rules (Broodkeep, adult A2.2a).
#
# It works on a COPY of the repo (unit-copy/), never on the real tree. Each mutant is one exact text replace whose `old` must occur
# exactly once in its file. The whole vitest suite runs per mutant (the same rule is exercised by other test files too). A mutant is
# CAUGHT only when the test named in `expect` fails.
#
#   python3 mutate-shop-unit.py --list   checks each `old` occurs once in the real files, prints the table, runs no tests
#   python3 mutate-shop-unit.py          makes a fresh copy, runs the baseline, then every mutant, then checks the copy
#
# Exit: 0 every mutant CAUGHT; 1 some mutant not CAUGHT (or an occurrence count is not 1); 2 baseline failed or the copy differs at the end.
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
COPY = os.path.join(VERIFY_OUT, "shop-unit-copy")
ORIG = os.path.join(VERIFY_OUT, "shop-unit-orig")
OUT = os.path.join(VERIFY_OUT, "shop-unit-out")
VITEST = ["npx", "vitest", "run", "--cache=false", "--fsModuleCache=false", "--reporter=json"]
TEST_FILE = "tests/shop.test.ts"
TIMEOUT_S = 900

F_SHOP = "src/game/shop.ts"
F_CARE = "src/game/care.ts"
F_GROW = "src/game/growth.ts"
F_STATE = "src/game/state.ts"
F_SYNC = "src/sync/sync.ts"
F_ACT = "src/game/actions.ts"
F_HUD = "src/game/hud.ts"
F_FORE = "src/game/forecast.ts"
F_PERK = "src/game/perks.ts"
F_DATA = "src/data/shop.ts"
F_TUNE = "src/data/tuning.ts"
F_AVAIL = "src/game/availability.ts"

# id, file, old (exact, must occur once in the file), new, expect (substring of the test's full name in tests/shop.test.ts)
EXACT = "exactly the price buys and leaves 0 of everything"
SHORT = "one coin short, or one short in any one material, is poor and changes nothing"
UNDO_EXACT = "inside the window it gives back exactly the price"
LATE = "one millisecond after 10 seconds is late, and so is a clock set back or a day ahead"
WALL_BACK = "undoing a wallpaper puts back the wall that was shown"
MIGRATE_DROP = "unknown ids, duplicates and junk are dropped"
BAD_UNDO = "a bad undo record is dropped"
SIM_BED = "slows happiness while it sleeps at home, through the simulation itself"
NOT_AWAKE = "changes nothing awake, and nothing else asleep"
HUD_SAYS = "the HUD says what the simulation does"
MAT_90 = "a meal that ends at exactly 90 counts with the mat"
MISSING_KEY = "a bag with a missing material key reads as 0"
MUTANTS = [
    dict(id="price-off-by-one", file=F_SHOP, old="coins: Math.max(0, price.coins - save.coins)", new="coins: Math.max(0, price.coins + 1 - save.coins)", expect=EXACT),
    dict(id="coin-check-removed", file=F_SHOP, old="coins: Math.max(0, price.coins - save.coins)", new="coins: 0", expect=SHORT),
    dict(id="material-check-removed", file=F_SHOP, old="if (short > 0) missing.materials[material] = short;", new="if (false) missing.materials[material] = short;", expect=SHORT),
    dict(id="one-material-not-taken", file=F_SHOP, old="if (need) save.inventory[material] = (save.inventory[material] ?? 0) - need;", new='if (need && material !== "fiber") save.inventory[material] = (save.inventory[material] ?? 0) - need;', expect=EXACT),
    dict(id="refund-without-materials", file=F_SHOP, old="if (paid) save.inventory[material] = (save.inventory[material] ?? 0) + paid;", new="if (false) save.inventory[material] = (save.inventory[material] ?? 0) + paid;", expect=UNDO_EXACT),
    dict(id="refund-without-coins", file=F_SHOP, old="save.coins += item.price.coins;", new="save.coins += 0;", expect=UNDO_EXACT),
    dict(id="window-excludes-10s", file=F_SHOP, old="return since >= 0 && since <= window ? window - since : null;", new="return since >= 0 && since < window ? window - since : null;", expect=UNDO_EXACT),
    dict(id="negative-time-allowed", file=F_SHOP, old="return since >= 0 && since <= window ? window - since : null;", new="return since <= window ? window - since : null;", expect=LATE),
    dict(id="window-too-long", file=F_SHOP, old="return since >= 0 && since <= window ? window - since : null;", new="return since >= 0 && since <= window + 1 ? window - since : null;", expect=LATE),
    dict(id="late-keeps-record", file=F_SHOP, old="    save.lastBuy = null;\n    return \"late\";", new="    return \"late\";", expect=LATE),
    dict(id="buy-without-catch-up", file=F_SHOP, old="export function buy(save: Save, id: string, nowMs: number): BuyResult {\n  simulateTo(save, nowMs);", new="export function buy(save: Save, id: string, nowMs: number): BuyResult {", expect="a job that ends before now has paid"),
    dict(id="undo-without-catch-up", file=F_SHOP, old="export function undoBuy(save: Save, nowMs: number): UndoResult {\n  simulateTo(save, nowMs);", new="export function undoBuy(save: Save, nowMs: number): UndoResult {", expect="the buy and the undo both catch the save up to now first"),
    dict(id="wall-not-restored", file=F_SHOP, old="if (save.wall === item.id) save.wall = last.wall;", new="if (save.wall === item.id) save.wall = null;", expect=WALL_BACK),
    dict(id="wall-always-restored", file=F_SHOP, old="if (save.wall === item.id) save.wall = last.wall;", new="save.wall = last.wall;", expect=WALL_BACK),
    dict(id="wallpaper-not-put-on-wall", file=F_SHOP, old='if (item.kind === "wallpaper") save.wall = item.id;', new='if (item.kind === "wallpaper") save.wall = save.wall;', expect=WALL_BACK),
    dict(id="last-buy-forgets-wall", file=F_SHOP, old="save.lastBuy = { item: item.id, at: nowMs, wall: wallBefore };", new="save.lastBuy = { item: item.id, at: nowMs, wall: null };", expect="two quick buys of one item charge once"),
    dict(id="owned-not-refused", file=F_SHOP, old='if (save.owned.includes(id)) return "owned";', new="", expect="an unknown id, and ids that exist on every object, are refused"),
    dict(id="own-keys-not-checked", file=F_DATA, old="Object.hasOwn(items, id)", new="id in items", expect="an unknown id, and ids that exist on every object, are refused"),
    dict(id="use-wall-takes-unowned", file=F_SHOP, old="if (id !== null && !(isWallId(id) && save.owned.includes(id))) return false;", new="if (id !== null && !isWallId(id)) return false;", expect="only an owned wallpaper or null can go on the wall"),
    dict(id="missing-key-in-check", file=F_SHOP, old="const short = need - (save.inventory[material] ?? 0);", new="const short = need - save.inventory[material]!;", expect=MISSING_KEY),
    dict(id="missing-key-in-refund", file=F_SHOP, old="save.inventory[material] = (save.inventory[material] ?? 0) + paid;", new="save.inventory[material] = save.inventory[material]! + paid;", expect=MISSING_KEY),
    dict(id="price-changed", file=F_DATA, old="price: { coins: 35, materials: { fiber: 3, wood: 2 } }", new="price: { coins: 36, materials: { fiber: 3, wood: 2 } }", expect="has nine items at these prices and with these words"),
    dict(id="migrate-keeps-unknown-ids", file=F_STATE, old="[...new Set(value.owned.filter(isItemId))]", new='[...new Set(value.owned.filter((id) => typeof id === "string"))]', expect=MIGRATE_DROP),
    dict(id="migrate-keeps-duplicates", file=F_STATE, old="[...new Set(value.owned.filter(isItemId))]", new="value.owned.filter(isItemId)", expect=MIGRATE_DROP),
    dict(id="migrate-wall-not-owned", file=F_STATE, old="value.wall = isWallId(value.wall) && value.owned.includes(value.wall) ? value.wall : null;", new="value.wall = isWallId(value.wall) ? value.wall : null;", expect=MIGRATE_DROP),
    dict(id="migrate-undo-unowned", file=F_STATE, old="isLastBuy(value.lastBuy) && value.owned.includes(value.lastBuy.item)\n", new="isLastBuy(value.lastBuy)\n", expect=BAD_UNDO),
    dict(id="migrate-nan-time", file=F_STATE, old="typeof v.at === \"number\" && Number.isFinite(v.at) &&", new='typeof v.at === "number" &&', expect=BAD_UNDO),
    dict(id="untouched-ignores-owned", file=F_SYNC, old="    save.owned.length === 0 &&\n", new="", expect="an egg save that owns something, or can still undo, is not untouched"),
    dict(id="untouched-ignores-undo", file=F_SYNC, old="    save.lastBuy === null &&\n", new="", expect="an egg save that owns something, or can still undo, is not untouched"),
    dict(id="bed-factor-one", file=F_TUNE, old="bedHappinessFactor: 0.5,", new="bedHappinessFactor: 1,", expect=SIM_BED),
    dict(id="step-care-drops-owned", file=F_CARE, old="decayStats(c, asleep, save.owned);", new="decayStats(c, asleep, []);", expect=SIM_BED),
    dict(id="decay-drops-owned", file=F_CARE, old="s[stat] = clamp(s[stat] + statChangePerMinute(c, stat, asleep, owned));", new="s[stat] = clamp(s[stat] + statChangePerMinute(c, stat, asleep));", expect=SIM_BED),
    dict(id="bed-applies-awake", file=F_CARE, old="(asleep && !c.job ? bedFactor(owned) : 1)", new="bedFactor(owned)", expect=NOT_AWAKE),
    dict(id="bed-slows-hunger-too", file=F_CARE, old="      return -rate.hunger * slow;", new="      return -rate.hunger * slow * (asleep && !c.job ? bedFactor(owned) : 1);", expect=NOT_AWAKE),
    dict(id="bed-works-while-away", file=F_CARE, old="(asleep && !c.job ? bedFactor(owned) : 1)", new="(asleep ? bedFactor(owned) : 1)", expect="gives nothing to a creature that sleeps through the night out working"),
    dict(id="hud-span-drops-owned", file=F_HUD, old="const change = statChangePerMinute(c, stat, asleep, owned);", new="const change = statChangePerMinute(c, stat, asleep);", expect=HUD_SAYS),
    dict(id="hud-card-drops-owned", file=F_HUD, old="const sleeping = statChangePerMinute(c, stat, true, owned);", new="const sleeping = statChangePerMinute(c, stat, true);", expect=HUD_SAYS),
    dict(id="mat-needs-no-rise", file=F_GROW, old="hungerBefore < tuning.fullAtHunger && c.stats.hunger > hungerBefore && c.stats.hunger + grace >= tuning.fullAtHunger", new="hungerBefore < tuning.fullAtHunger && c.stats.hunger + grace >= tuning.fullAtHunger", expect="a meal that did not raise hunger counts nothing"),
    dict(id="mat-grace-zero", file=F_PERK, old="? tuning.shop.matHungerGrace : 0", new="? 0 : 0", expect=MAT_90),
    dict(id="feed-drops-grace", file=F_ACT, old="countCareCells(c, hungerBefore, happinessBefore, hungerGrace(save.owned));", new="countCareCells(c, hungerBefore, happinessBefore);", expect=MAT_90),
    dict(id="grace-reaches-refusal", file=F_AVAIL, old='if (c.stats.hunger >= tuning.fullAtHunger) return "full";', new='if (c.stats.hunger >= tuning.fullAtHunger - tuning.shop.matHungerGrace) return "full";', expect="the mat does not move the refusal line"),
    dict(id="forecast-note-ignores-mat", file=F_FORE, old="to ${tuning.fullAtHunger - hungerGrace(owned)} or more", new="to ${tuning.fullAtHunger} or more", expect="the Growth Forecast says 90 with the mat and 95 without"),
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
    args = ap.parse_args()
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
