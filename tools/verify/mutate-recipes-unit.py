#!/usr/bin/env python3
# Mutation runner for the RULES of the Book recipes and the Perfect star (Broodkeep, adult slice A4.4, docs/adult-a4-plan.md section 14): the lifetime mistake count and who earns the star
# (game/perfect.ts, game/sim.ts), the star's words, what the loader and the dev panel do to it (game/state.ts, game/dev.ts), what retiring keeps (game/actions.ts), the Forecast's line
# (game/forecast.ts), and every word and rule of a recipe, the Next line and the cell's name (game/recipes.ts). The screen side (the Book's cells and cards, the Forecast's layout, the
# star awarded in the running game) is the UI runner's: mutate-recipes-ui.py.
#
# It works on a COPY of the repo (recipes-unit-copy/), never on the real tree. Each mutant is one exact text replace whose `old` must occur exactly once in its file. Only the test file named in
# `expect_file` runs per mutant: a mutant counts only when ITS named test fails, so the rest of the suite cannot change the verdict. The baseline runs the files below and the older tests of the
# files these mutants touch (special, forecast, retire, dev, save), which must pass unchanged. `--equivalents` runs all of them for each EQUIVALENT mutant.
#
#   python3 mutate-recipes-unit.py --list   checks each `old` occurs once in the real files (the EQUIVALENT ones too), prints the table, runs no tests
#   python3 mutate-recipes-unit.py          makes a fresh copy, runs the baseline, then every mutant, then checks the copy
#   python3 mutate-recipes-unit.py --only id1,id2   the same, for these mutants only
#   python3 mutate-recipes-unit.py --equivalents    runs the EQUIVALENT list (the mutants argued to change nothing) instead: exit 0 only when every one of them leaves every test passing
#
# Exit: 0 every mutant CAUGHT; 1 some mutant not CAUGHT (or an occurrence count is not 1); 2 baseline failed, the copy differs at the end, or an unknown or empty --only id.
# With --equivalents the codes are reversed for the mutants: 0 when every one of them SURVIVED (changed nothing), 1 when one is caught or fails any test; 2 as above.
import argparse
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REAL = os.path.abspath(os.path.join(HERE, "..", ".."))  # the repo this file is in
# Everything this runner makes (the copy, the logs) goes to VERIFY_OUT, never into the repo.
VERIFY_OUT = os.environ.get("VERIFY_OUT") or os.path.join(tempfile.gettempdir(), "broodkeep-verify")
COPY = os.path.join(VERIFY_OUT, "recipes-unit-copy")
ORIG = os.path.join(VERIFY_OUT, "recipes-unit-orig")
OUT = os.path.join(VERIFY_OUT, "recipes-unit-out")
T_PERFECT = "tests/perfect.test.ts"
T_RECIPES = "tests/recipes.test.ts"
TESTS = [T_PERFECT, T_RECIPES]
BASELINE = [T_PERFECT, T_RECIPES, "tests/special.test.ts", "tests/forecast.test.ts", "tests/retire.test.ts", "tests/dev.test.ts", "tests/save.test.ts"]
VITEST_ARGS = ["--cache=false", "--fsModuleCache=false", "--reporter=json"]
TEST_FILE = T_PERFECT
TIMEOUT_S = 600
EQUIV_MODE = False

F_PERFECT = "src/game/perfect.ts"
F_RECIPES = "src/game/recipes.ts"
F_SIM = "src/game/sim.ts"
F_STATE = "src/game/state.ts"
F_DEV = "src/game/dev.ts"
F_ACT = "src/game/actions.ts"
F_FORECAST = "src/game/forecast.ts"


def mut(id, file, old, new, expect, test=T_PERFECT, also=()):
    # `also`: more (old, new) replaces in the same file, applied after the first; each `old` must occur exactly once too (for a mutant that needs two edits at once)
    return dict(id=id, file=file, old=old, new=new, expect=expect, expect_file=test, also=tuple(also))


# Test titles (substrings of the full test names), tests/perfect.test.ts
P_BABY = "is the stage's own count for a baby, whatever is stored"
P_ADDS = "adds the earlier stages to this one for a kid, a young and an adult"
P_UNKNOWN = "is unknown (null) when the earlier stages left no whole number"
P_OWN = "is unknown when the stage's own count is not a whole number"
P_FORM = "is unknown, and does not throw, for a form the game does not know"
P_RECORD = "records the finished stage: the sum when known, nothing when not"
P_EARNS = "a tier 1 adult that made no mistake in any stage does: the flag, the Book's list, a line in the log"
P_EARLIER = "an earlier mistake, in the baby or kid stage, keeps it from the star but not from tier 1"
P_ADDUP = "mistakes of the baby and the kid add up through the real stage changes"
P_NORECORD = "a creature from a save with no record of its earlier stages never earns it"
P_TWICE = "the same form raised perfect twice has one entry in the list"
P_ASKS = "isPerfectGrowUp asks for a tier 1 form and a known life with no mistake, and nothing else"
P_RETIRE = "goes onto the completed life when it retires"
P_PLAIN = "a creature that was not perfect retires with no flag at all"
P_FORCED = "a forced evolve into a tier 1 adult awards nothing and leaves no record"
P_FLAG = "a forced evolve takes the star flag off the creature"
P_HATCHED = "a hatched baby is known, and a hatched young is not"
P_OLDLIST = "a save made before the star has an empty list"
P_KEEPS = "keeps real forms once each in the order saved"
P_LIFESTAR = "keeps a completed life's star only when it is exactly true"
P_CRSTAR = "keeps the creature's star only when it is exactly true"
P_FRESH = "a fresh save has the list, is a save, and survives a round trip"
P_ON = "says the run is still possible for a baby, a kid and a young"
P_AFTER = "says nothing once a mistake has been made"
P_SPECIAL = "says nothing for the special, whatever it has made"
P_KEPT = "an adult with the star reads the kept line, an adult without it reads nothing"
P_WORDS = "the strings are these words (the star's wording is pinned)"
P_FORECAST = "the Forecast carries the line"
P_NOTLIST = "replaces a list that is not a list"
# tests/recipes.test.ts
R_STEPS = "is one step for each form of its family line, in order"
R_NOTE = "carries the care note on every kid, young and adult, and on neither the baby nor the special"
R_WORDS = "are these, for a sample"
R_FIRST = "is the first kid in Book order once the baby is raised"
R_NULL = "is null only when every creature is raised"
R_DESCRIBE = "describeForm says where a creature sits, with no name"
R_LABEL = "a raised cell starts with the name and says if it has the star"
R_TUNING = "follow the tuning: the tier lines move with the mistake limits"
R_STAGES = "gives the stage of each step, the first always the baby"

LABEL_OLD = "return found ? `${name}, raised${perfect ? `, ${perfectText.star}` : \"\"}` : `${cardText.hidden}, not raised yet`;"

MUTANTS = [
    # the lifetime count
    mut("baby-count-adds-the-stored", F_PERFECT, 'if (form.stage === "baby") return now;', 'if (form.stage === "baby") return isCount(c.pastMistakes) ? c.pastMistakes + now : now;', P_BABY),
    mut("life-forgets-this-stage", F_PERFECT, "return isCount(c.pastMistakes) ? c.pastMistakes + now : null;", "return isCount(c.pastMistakes) ? c.pastMistakes : null;", P_ADDS),
    mut("unknown-life-is-this-stage-only", F_PERFECT, "return isCount(c.pastMistakes) ? c.pastMistakes + now : null;", "return isCount(c.pastMistakes) ? c.pastMistakes + now : now;", P_UNKNOWN),
    mut("own-count-not-checked", F_PERFECT, "if (!form || !isCount(now)) return null;", "if (!form) return null;", P_OWN),
    mut("unknown-form-throws", F_PERFECT, "if (!form || !isCount(now)) return null;", "if (!isCount(now)) return null;", P_FORM),
    mut("count-accepts-negative", F_PERFECT, "Number.isInteger(n) && n >= 0;", "Number.isInteger(n) && n >= -5;", P_UNKNOWN),
    mut("count-accepts-fractions", F_PERFECT, "typeof n === \"number\" && Number.isInteger(n) && n >= 0;", "typeof n === \"number\" && n >= 0;", P_UNKNOWN),
    mut("record-keeps-an-unknown-life-as-clean", F_PERFECT, "if (total === null) delete c.pastMistakes;", "if (total === null) c.pastMistakes = 0;", P_RECORD),
    mut("record-forgets-the-stage", F_PERFECT, "else c.pastMistakes = total;", "else c.pastMistakes = c.pastMistakes ?? 0;", P_RECORD),
    # who earns the star
    mut("star-for-any-form", F_PERFECT, "return adultTier(nextFormId) === 1 && lifeMistakes(c) === 0;", "return lifeMistakes(c) === 0;", P_ASKS),
    mut("star-for-every-tier", F_PERFECT, "return adultTier(nextFormId) === 1 && lifeMistakes(c) === 0;", "return adultTier(nextFormId) !== null && lifeMistakes(c) === 0;", P_ASKS),
    mut("star-with-one-mistake", F_PERFECT, "return adultTier(nextFormId) === 1 && lifeMistakes(c) === 0;", "return adultTier(nextFormId) === 1 && (lifeMistakes(c) ?? 9) <= 1;", P_EARLIER),
    mut("star-with-an-unknown-life", F_PERFECT, "return adultTier(nextFormId) === 1 && lifeMistakes(c) === 0;", "return adultTier(nextFormId) === 1 && !lifeMistakes(c);", P_NORECORD),
    mut("award-twice-in-the-list", F_PERFECT, "  if (!save.perfect.includes(c.formId)) save.perfect.push(c.formId);", "  save.perfect.push(c.formId);", P_TWICE),
    mut("award-no-flag", F_PERFECT, "  c.perfect = true;\n", "", P_EARNS),
    mut("award-no-list-entry", F_PERFECT, "  if (!save.perfect.includes(c.formId)) save.perfect.push(c.formId);\n", "", P_EARNS),
    mut("award-no-log-line", F_PERFECT, "  logEvent(save, t, `${formOf(c.formId)?.name ?? \"A creature\"} grew up as a perfect run`);\n", "", P_EARNS),
    mut("evolve-gives-the-star-to-every-change", F_SIM, "  if (perfect) awardPerfect(save, c, t);", "  awardPerfect(save, c, t);", P_EARLIER),
    mut("evolve-does-not-record-the-stage", F_SIM, "  recordFinishedStage(c); // the stage's mistakes join the earlier ones before the counters are replaced (game/perfect.ts)\n", "", P_ADDUP),
    mut("baby-has-no-record", F_SIM, '    ...(formOf(formId)?.stage === "baby" ? { pastMistakes: 0 } : {}),\n', "", P_HATCHED),
    mut("every-hatch-has-a-record", F_SIM, '...(formOf(formId)?.stage === "baby" ? { pastMistakes: 0 } : {}),', "pastMistakes: 0,", P_HATCHED),
    # the line the Forecast says
    mut("line-for-the-special", F_PERFECT, "if (!form || c.formId === specialId) return null;", "if (!form) return null;", P_SPECIAL),
    mut("line-for-an-adult-without-the-star", F_PERFECT, 'return c.perfect === true ? { kind: "kept", text: perfectText.kept } : null;', 'return { kind: "kept", text: perfectText.kept };', P_KEPT),
    mut("line-after-a-mistake", F_PERFECT, 'return lifeMistakes(c) === 0 ? { kind: "on", text: perfectText.on } : null;', 'return lifeMistakes(c) !== null ? { kind: "on", text: perfectText.on } : null;', P_AFTER),
    mut("line-for-an-unknown-life", F_PERFECT, 'return lifeMistakes(c) === 0 ? { kind: "on", text: perfectText.on } : null;', 'return (lifeMistakes(c) ?? 0) === 0 ? { kind: "on", text: perfectText.on } : null;', P_AFTER),
    mut("forecast-says-no-line", F_FORECAST, "    perfect: perfectLine(c),", "    perfect: null,", P_FORECAST),
    mut("star-word-changed", F_PERFECT, 'star: "Perfect star",', 'star: "Perfect Star",', P_WORDS),
    mut("count-word-changed", F_PERFECT, "count: (n: number) => `, ${n} with a Perfect star`,", "count: (n: number) => ` and ${n} with a Perfect star`,", P_WORDS),
    mut("kept-line-changed", F_PERFECT, "the Book keeps its star.", "the Book keeps it.", P_WORDS),
    # what retiring and the dev panel keep
    mut("retire-drops-the-flag", F_ACT, ", ...(c.perfect === true ? { perfect: true as const } : {})", "", P_RETIRE),
    mut("retire-flags-every-life", F_ACT, "...(c.perfect === true ? { perfect: true as const } : {})", "perfect: true as const", P_PLAIN),
    mut("forced-evolve-keeps-the-record", F_DEV, "  delete save.creature.pastMistakes;\n", "", P_FORCED),
    mut("forced-evolve-keeps-the-flag", F_DEV, "  delete save.creature.perfect;", "", P_FLAG),
    # the loader
    mut("loader-keeps-an-unknown-form", F_STATE, " && Object.prototype.hasOwnProperty.call(forms, id)", "", P_KEEPS),
    mut("loader-lets-constructor-in", F_STATE, "Object.prototype.hasOwnProperty.call(forms, id)", "id in forms", P_KEEPS),
    mut("loader-keeps-repeats", F_STATE, "[...new Set(value.perfect.filter(", "[...(value.perfect.filter(", P_KEEPS),
    mut("loader-trusts-a-bad-list", F_STATE, "value.perfect = Array.isArray(value.perfect) ?", "value.perfect = value.perfect ?", P_NOTLIST),
    mut("loader-leaves-an-old-save-without-a-list", F_STATE, ")))] : [];", ")))] : undefined as unknown as string[];", P_OLDLIST),
    mut("loader-keeps-any-life-flag", F_STATE, "...(perfect === true ? { perfect: true as const } : {})", "...(perfect ? { perfect: true as const } : {})", P_LIFESTAR),
    mut("loader-keeps-any-creature-flag", F_STATE, "if ((value.creature as { perfect?: unknown }).perfect !== true) delete", "if (!(value.creature as { perfect?: unknown }).perfect) delete", P_CRSTAR),
    mut("fresh-save-has-no-list", F_STATE, "    perfect: [],\n", "", P_FRESH),
    # the recipes' words and rules
    mut("recipe-skips-the-baby", F_RECIPES, "  for (const id of line) {\n    const stage = stageOf(id);", "  for (const id of line.slice(1)) {\n    const stage = stageOf(id);", R_STEPS, T_RECIPES),
    mut("note-on-the-baby", F_RECIPES, 'note: stage === "baby" || stage === "special" ? null : recipeText.note', 'note: stage === "special" ? null : recipeText.note', R_NOTE, T_RECIPES),
    mut("note-on-the-special", F_RECIPES, 'note: stage === "baby" || stage === "special" ? null : recipeText.note', 'note: stage === "baby" ? null : recipeText.note', R_NOTE, T_RECIPES),
    mut("note-only-on-kids", F_RECIPES, 'note: stage === "baby" || stage === "special" ? null : recipeText.note', 'note: stage !== "kid" ? null : recipeText.note', R_NOTE, T_RECIPES),
    mut("special-step-missing", F_RECIPES, '  if (stage === "special") return recipeText.special;\n', "", R_STEPS, T_RECIPES),
    mut("kid-step-minutes-added", F_RECIPES, "${g.fieldCellsToKid * g.fieldCellMinutes} awake minutes", "${g.fieldCellsToKid + g.fieldCellMinutes} awake minutes", R_WORDS, T_RECIPES),
    mut("kid-step-hours-of-the-baby", F_RECIPES, "After ${g.kidHours} hours the food with the most whole cells wins.", "After ${g.babyHours} hours the food with the most whole cells wins.", R_WORDS, T_RECIPES),
    mut("tie-servings-flipped", F_RECIPES, "(${g.servingsPerFoodCell + 1} servings against ${g.servingsPerFoodCell} is a tie)", "(${g.servingsPerFoodCell} servings against ${g.servingsPerFoodCell + 1} is a tie)", R_WORDS, T_RECIPES),
    mut("tier-1-needs-fewer-cells", F_RECIPES, "${g.careCellsMax} hunger cells (a feeding", "${g.careCellsMax - 1} hunger cells (a feeding", R_WORDS, T_RECIPES),
    mut("tier-1-without-the-star-line", F_RECIPES, '          "Add no mistake in the baby and kid stages for a Perfect star."\n', '          ""\n', R_WORDS, T_RECIPES),
    mut("tier-2-one-mistake-too-many", F_RECIPES, "${after} ${mistakes(g.tier2MaxMistakes)}, or no mistake", "${after} ${mistakes(g.tier2MaxMistakes + 1)}, or no mistake", R_WORDS, T_RECIPES),
    mut("tier-3-starts-a-mistake-early", F_RECIPES, "range(g.tier2MaxMistakes + 1, g.tier3MaxMistakes)", "range(g.tier2MaxMistakes, g.tier3MaxMistakes)", R_WORDS, T_RECIPES),
    mut("tier-4-starts-a-mistake-early", F_RECIPES, "${g.tier3MaxMistakes + 1} or more mistakes", "${g.tier3MaxMistakes} or more mistakes", R_WORDS, T_RECIPES),
    mut("special-hours-doubled", F_RECIPES, "special: `Leave a baby or a kid with no care for ${g.neglectHours} awake hours.", "special: `Leave a baby or a kid with no care for ${g.neglectHours * 2} awake hours.", R_WORDS, T_RECIPES),
    mut("care-words-name-a-poke", F_RECIPES, "or a pet or a tickle while it is awake counts as care.", "or a pet, a poke or a tickle while it is awake counts as care.", R_WORDS, T_RECIPES),
    mut("kid-step-names-land-always", F_RECIPES, "return recipeText.kid(fields[field].name);", 'return recipeText.kid("Land");', R_WORDS, T_RECIPES),
    mut("next-ignores-what-is-raised", F_RECIPES, "    if (found.has(id)) continue;\n    const recipe = recipeOf(id);", "    const recipe = recipeOf(id);", R_FIRST, T_RECIPES),
    mut("next-says-the-first-step", F_RECIPES, "step: recipe.steps[recipe.steps.length - 1]!.text", "step: recipe.steps[0]!.text", R_FIRST, T_RECIPES),
    mut("next-is-never-none", F_RECIPES, "  return null;\n}\n\n// ---- the Book card ----", '  return { formId: "", label: "", step: "" };\n}\n\n// ---- the Book card ----', R_NULL, T_RECIPES),
    mut("describe-adult-has-no-tier", F_RECIPES, '`${tier ? `a tier ${tier} adult` : "an adult"}${place}`', '`an adult${place}`', R_DESCRIBE, T_RECIPES),
    mut("label-names-an-unraised-creature", F_RECIPES, LABEL_OLD, "return found ? `${name}, raised${perfect ? `, ${perfectText.star}` : \"\"}` : `${name}, not raised yet`;", R_LABEL, T_RECIPES),
    mut("label-has-no-star", F_RECIPES, LABEL_OLD, "return found ? `${name}, raised` : `${cardText.hidden}, not raised yet`;", R_LABEL, T_RECIPES),
    mut("label-does-not-start-with-the-word", F_RECIPES, LABEL_OLD, "return found ? `Open ${name}, raised${perfect ? `, ${perfectText.star}` : \"\"}` : `${cardText.hidden}, not raised yet`;", R_LABEL, T_RECIPES),
]

# Not mutated, argued from the code; `--equivalents` applies each one and exits 0 only when every test still passes, which is the proof that the argument holds:
#  - isPerfectGrowUp is read BEFORE evolveTo in sim.ts "so the counters are still the old ones", but after the change the count is `pastMistakes + 0`, which is the sum the old call read, so judging
#    after the change gives the same answer for a tier 1 adult. The order is kept as documentation of the intent, not because the result depends on it.
#  - the `typeof id === "string"` half of the loader's filter: `hasOwnProperty.call(forms, 7)` is already false, so a number never passes either way.
EQUIVALENT = [
    mut("judged-after-the-change", F_SIM, "  const perfect = isPerfectGrowUp(c, next); // judged before the stage counters are replaced\n  evolveTo(save, next, t);\n  if (perfect) awardPerfect(save, c, t);", "  evolveTo(save, next, t);\n  const perfect = isPerfectGrowUp(c, next);\n  if (perfect) awardPerfect(save, c, t);", P_EARNS),
    mut("loader-does-not-test-for-a-string", F_STATE, 'typeof id === "string" && Object.prototype.hasOwnProperty.call(forms, id)', "Object.prototype.hasOwnProperty.call(forms, id)", P_KEEPS),
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
        shutil.rmtree(COPY)  # COPY is a directory this script made with copytree; a symlink at that path would make rmtree raise, which stops the run before anything is broken
    shutil.copytree(REAL, COPY, ignore=top_ignore, symlinks=True)
    os.symlink(os.path.join(REAL, "node_modules"), os.path.join(COPY, "node_modules"))


def run_vitest(name, files):
    jpath = os.path.join(OUT, name + ".json")
    if os.path.exists(jpath):
        os.remove(jpath)
    with open(os.path.join(OUT, name + ".log"), "w", encoding="utf-8") as log:
        # its own process group, so a timeout or Ctrl-C kills vitest's node children too, not only the npx parent
        proc = subprocess.Popen(["npx", "vitest", "run", *files] + VITEST_ARGS + ["--outputFile=" + jpath], cwd=COPY, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
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
    """How many times the first `old` occurs in the real file; a mutant with `also` replaces counts 0 if any of those does not occur exactly once."""
    text = read(os.path.join(REAL, m["file"]))
    if any(text.count(o) != 1 for o, _ in m["also"]):
        return 0
    return text.count(m["old"])


def titles_of(test_file):
    """The titles of the `it(...)` tests in a test file (double-quoted, as this repo writes them)."""
    text = read(os.path.join(REAL, test_file))
    return re.findall(r'\bit\(\s*"((?:[^"\\]|\\.)*)"', text)


def do_list():
    bad = 0
    known = {f: titles_of(f) for f in TESTS}
    for m in MUTANTS if EQUIV_MODE else MUTANTS + EQUIVALENT:
        if m["expect"] != "(none)" and not any(m["expect"] in t for t in known[m.get("expect_file", TEST_FILE)]):
            bad += 1
            print("NO TEST TITLE in %s contains the expect of %s: %s" % (m.get("expect_file", TEST_FILE), m["id"], m["expect"]))
    print("%-32s %5s  %-22s %-22s %s" % ("id", "count", "file", "expect_file", "expect (title substring)"))
    rows = MUTANTS if EQUIV_MODE else MUTANTS + EQUIVALENT  # (the default list checks the EQUIVALENT texts too: they must occur once as well)
    for m in rows:
        n = occurrences(m)
        if n != 1:
            bad += 1
        print("%-32s %5d  %-22s %-22s %s" % (m["id"], n, m["file"], m.get("expect_file", TEST_FILE).split("/")[-1], m["expect"]))
    print("LIST total=%d bad=%d" % (len(rows), bad))
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
        rc, data = run_vitest("baseline", BASELINE)
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
        bad_also = [o for o, _ in m["also"] if orig.count(o) != 1]
        if n != 1 or bad_also:
            results.append((m, "ERROR", "old occurs %d times in the copy%s" % (n, (", and %d `also` text(s) do not occur exactly once" % len(bad_also)) if bad_also else ""), []))
            continue
        write(os.path.join(ORIG, m["file"].replace("/", "__")), orig)
        try:
            text = orig.replace(m["old"], m["new"], 1)
            for o, nw in m["also"]:
                if text.count(o) != 1:  # the earlier replaces moved or copied it
                    raise RuntimeError("an `also` old text does not occur exactly once after the earlier replaces")
                text = text.replace(o, nw, 1)
            write(path, text)
            rc, data = run_vitest(m["id"], BASELINE if EQUIV_MODE else [m.get("expect_file", TEST_FILE)])  # an EQUIVALENT mutant must leave every test of the baseline passing, the Kid ones too
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
