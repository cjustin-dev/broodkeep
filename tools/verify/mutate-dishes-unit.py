#!/usr/bin/env python3
# Mutation runner for the shop's foods, the dishes: what they are offered as, count, refuse, and what the Growth Forecast says (Broodkeep, adult A2.2b).
#
# It works on a COPY of the repo (unit-copy/), never on the real tree. Each mutant is one exact text replace whose `old` must occur
# exactly once in its file. The whole vitest suite runs per mutant (the same rule is exercised by other test files too). A mutant is
# CAUGHT only when the test named in `expect` fails.
#
#   python3 mutate-dishes-unit.py --list   checks each `old` occurs once in the real files, prints the table, runs no tests
#   python3 mutate-dishes-unit.py          makes a fresh copy, runs the baseline, then every mutant, then checks the copy
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
COPY = os.path.join(VERIFY_OUT, "dishes-unit-copy")
ORIG = os.path.join(VERIFY_OUT, "dishes-unit-orig")
OUT = os.path.join(VERIFY_OUT, "dishes-unit-out")
VITEST = ["npx", "vitest", "run", "--cache=false", "--fsModuleCache=false", "--reporter=json"]
TEST_FILE = "tests/dishes.test.ts"
TIMEOUT_S = 900

F_DISH = "src/game/dishes.ts"
F_GROW = "src/game/growth.ts"
F_ACT = "src/game/actions.ts"
F_FORE = "src/game/forecast.ts"
F_DATA = "src/data/shop.ts"
F_AVAIL = "src/game/availability.ts"
F_SHOP = "src/game/shop.ts"

# id, file, old (exact, must occur once in the file), new, expect (substring of the test's full name in tests/dishes.test.ts, or in `expect_file`)
OFFERED = "only a kid with a field is offered one: not a baby, a young, an adult, or the special"
NOT_ITEMS = "an id in owned that is not a dish (or not an item at all) is never offered"
BOOSTER = "counts exactly 2 servings (one whole cell) of the right food in every field, and nothing else"
RECIPE = "Stew counts 1 serving of the filling and 1 of the light food; Garden Mix the light and the sweet; in every field"
RECIPE_STATS = "its stats are the first food's"
CHOICE = "a plain meal counts 1 with every dish owned, and a day of plain meals leaves the same save with or without them"
NOT_OFFERED = "a dish that is not offered is 'unavailable' whatever else is true"
PLAIN_RULES = "an offered dish follows the plain meal's rules: asleep, full at 95 and eating at 94.99"
EDGE20 = "edge 20: feedRefusal with a dish and no owned list refuses it"
COUNTING = "a count under 1, or not a number, adds nothing; a kid counts it, a young does not"
LOCKED = "one more meal cannot lift meat to a cell, so it is Locked; with a Hearty Bowl it can, so it is not"
RIVALS = "the rivals' words follow: 2 meat servings are 'more than the time left allows'"
TIE_HALF = "a tie's second half follows too"
PER_MEAL = "servingsPerMeal: a booster owned makes its food worth a whole cell, nothing else does"
ONLY_SERVINGS = "a dish meal changes nothing but the servings"
NONE_OWNED = "none when nothing is owned, each dish alone"
UNDO_EVERY = "edges 5 and 6 for every item"
LOG = "the log names the dish, and a plain meal still names the food"
MIGRATE = "migrateSave keeps the five ids and drops one it does not know"
WORDS = "the cards and the tray buttons say what the meal does, in numbers"
PRICES = "has nine items at these prices and with these words"
MUTANTS = [
    dict(id="booster-counts-one", file=F_DISH, old="counts: [[eats, tuning.growth.servingsPerFoodCell]]", new="counts: [[eats, 1]]", expect=BOOSTER),
    dict(id="booster-wrong-kind", file=F_DISH, old="const eats = plan[dish.food];", new="const eats = plan[(dish.food + 1) % 3]!;", expect=BOOSTER),
    dict(id="feed-ignores-the-dish", file=F_ACT, old="(dish !== undefined && dishMeal(c, dish)?.counts) || [[foodId, 1]]", new="[[foodId, 1]]", expect=BOOSTER),
    dict(id="recipe-without-second-serving", file=F_DISH, old="[plan[dish.also], 1],", new="[eats, 0],", expect=RECIPE),
    dict(id="recipe-second-is-first", file=F_DISH, old="[plan[dish.also], 1],", new="[eats, 1],", expect=RECIPE),
    dict(id="recipe-eats-second-food", file=F_DISH, old="  return {\n    eats,\n    counts: [", new="  return {\n    eats: plan[dish.also],\n    counts: [", expect=RECIPE_STATS),
    dict(id="owned-check-removed", file=F_AVAIL, old="!(dishesOf(c, owned).includes(dish) && dishMeal(c, dish)?.eats === food)", new="!(dishMeal(c, dish)?.eats === food)", expect=NOT_OFFERED),
    dict(id="eats-check-removed", file=F_AVAIL, old="!(dishesOf(c, owned).includes(dish) && dishMeal(c, dish)?.eats === food)", new="!dishesOf(c, owned).includes(dish)", expect=NOT_OFFERED),
    dict(id="dish-check-after-sleep", file=F_AVAIL, old='  if (dish !== undefined && !(dishesOf(c, owned).includes(dish) && dishMeal(c, dish)?.eats === food)) return "off-menu";\n  if (c.sleep) return "asleep";\n',
         new='  if (c.sleep) return "asleep";\n  if (dish !== undefined && !(dishesOf(c, owned).includes(dish) && dishMeal(c, dish)?.eats === food)) return "off-menu";\n', expect=NOT_OFFERED),
    dict(id="dish-skips-the-full-line", file=F_AVAIL, old='if (c.stats.hunger >= tuning.fullAtHunger) return "full";', new='if (dish === undefined && c.stats.hunger >= tuning.fullAtHunger) return "full";', expect=PLAIN_RULES),
    dict(id="owned-default-owns-a-dish", file=F_AVAIL, old="owned: Owned = []", new='owned: Owned = ["hearty-bowl"]', expect=EDGE20),
    dict(id="dishes-for-a-young", file=F_DISH, old='if (getForm(c.formId).stage !== "kid" || !fieldOfForm(c.formId)) return [];', new="if (!fieldOfForm(c.formId)) return [];", expect=OFFERED),
    dict(id="dishes-for-the-special", file=F_DISH, old='if (getForm(c.formId).stage !== "kid" || !fieldOfForm(c.formId)) return [];', new='if (getForm(c.formId).stage !== "kid") return [];', expect=OFFERED),
    dict(id="dishes-keep-non-dishes", file=F_DISH, old="return dishIds.filter((id) => owned.includes(id));", new='return [...dishIds.filter((id) => owned.includes(id)), ...owned.filter((id) => id === "comfy-bed")] as DishId[];', expect=NOT_ITEMS),
    dict(id="dishes-ignore-what-is-owned", file=F_DISH, old="return dishIds.filter((id) => owned.includes(id));", new="return dishIds;", expect=NONE_OWNED),
    dict(id="plain-meal-boosted-automatically", file=F_ACT, old="|| [[foodId, 1]]", new='|| [[foodId, save.owned.includes("hearty-bowl") ? 2 : 1]]', expect=CHOICE),
    dict(id="count-serving-allows-zero", file=F_GROW, old='if (getForm(c.formId).stage !== "kid" || !(servings >= 1)) return;', new='if (getForm(c.formId).stage !== "kid") return;', expect=COUNTING),
    dict(id="count-serving-any-stage", file=F_GROW, old='if (getForm(c.formId).stage !== "kid" || !(servings >= 1)) return;', new="if (!(servings >= 1)) return;", expect=COUNTING),
    dict(id="dish-meal-pushes-candy", file=F_ACT, old="for (const [counted, servings] of counts) countServing(c, counted, servings);", new="for (const [counted, servings] of counts) countServing(c, counted, servings);\n  if (dish !== undefined) c.recentCandy.push(nowMs);", expect=ONLY_SERVINGS),
    dict(id="log-names-the-plain-food", file=F_ACT, old="`Ate ${dish !== undefined ? items[dish].name : food.name}`", new="`Ate ${food.name}`", expect=LOG),
    dict(id="locked-ignores-servings-per-meal", file=F_FORE, old="(c.counters.servings[food] ?? 0) + meals * servingsPerMeal(owned, field, food)", new="(c.counters.servings[food] ?? 0) + meals", expect=LOCKED),
    dict(id="rivals-enough-ignores-servings-per-meal", file=F_FORE, old="meals * servingsPerMeal(owned, field, r.input.food) : meals;", new="meals : meals;", expect=RIVALS),
    dict(id="tie-half-ignores-servings-per-meal", file=F_FORE, old="text += take.n <= room ?", new="text += take.n <= meals ?", expect=TIE_HALF),
    dict(id="per-meal-wrong-kind", file=F_DISH, old="return dish.food === kind && dish.also === undefined && owned.includes(id);", new="return dish.food !== kind && dish.also === undefined && owned.includes(id);", expect=PER_MEAL),
    dict(id="per-meal-ignores-what-is-owned", file=F_DISH, old="return dish.food === kind && dish.also === undefined && owned.includes(id);", new="return dish.food === kind && dish.also === undefined;", expect=PER_MEAL),
    dict(id="per-meal-counts-a-recipe", file=F_DISH, old="return dish.food === kind && dish.also === undefined && owned.includes(id);", new="return dish.food === kind && owned.includes(id);", expect=PER_MEAL),
    dict(id="is-item-id-rejects-foods", file=F_DATA, old='typeof id === "string" && Object.hasOwn(items, id);', new='typeof id === "string" && Object.hasOwn(items, id) && items[id as ItemId].kind !== "food";', expect=MIGRATE),
    dict(id="label-says-serving", file=F_DISH, old="counts ${n} servings", new="counts ${n} serving", expect=WORDS),
    dict(id="undo-refunds-no-fish", file=F_SHOP, old="if (paid) save.inventory[material] = (save.inventory[material] ?? 0) + paid;", new='if (paid && material !== "fish") save.inventory[material] = (save.inventory[material] ?? 0) + paid;', expect=UNDO_EVERY, expect_file="tests/shop.test.ts"),
    dict(id="stew-price-changed", file=F_DATA, old="price: { coins: 35, materials: { wood: 2, stone: 2 } },", new="price: { coins: 30, materials: { wood: 2, stone: 2 } },", expect=PRICES, expect_file="tests/shop.test.ts"),
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
