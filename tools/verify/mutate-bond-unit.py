#!/usr/bin/env python3
# Mutation runner for the rules of Bond (Broodkeep, adult slice A3.1, docs/adult-a3-plan.md section 4): the levels, what a pet and a tickle earn and the chain (game/bond.ts), the taper
# and the Kid branch of `touch` (game/actions.ts), the numbers (data/tuning.ts) and what the loader keeps (game/state.ts migrateSave). The screen side (the HUD, the burst, the idle hop)
# is the UI runner's: mutate-bond-ui.py.
#
# It works on a COPY of the repo (bond-unit-copy/), never on the real tree. Each mutant is one exact text replace whose `old` must occur exactly once in its file. Only the test file below
# runs per mutant: a mutant counts only when ITS named test fails, so the rest of the suite cannot change the verdict. A mutant is CAUGHT only when the test named in `expect` (a substring
# of its full name, in `expect_file`) fails.
#
#   python3 mutate-bond-unit.py --list   checks each `old` occurs once in the real files (the EQUIVALENT ones too), prints the table, runs no tests
#   python3 mutate-bond-unit.py          makes a fresh copy, runs the baseline, then every mutant, then checks the copy
#   python3 mutate-bond-unit.py --only id1,id2   the same, for these mutants only
#   python3 mutate-bond-unit.py --equivalents    runs the EQUIVALENT list (the mutants argued to change nothing) instead: exit 0 only when every one of them leaves every test passing
#
# Exit: 0 every mutant CAUGHT; 1 some mutant not CAUGHT (or an occurrence count is not 1); 2 baseline failed, the copy differs at the end, or an unknown or empty --only id.
# With --equivalents the codes are reversed for the mutants: 0 when every one of them SURVIVED (changed nothing), 1 when one is caught or fails any test; 2 as above.
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
COPY = os.path.join(VERIFY_OUT, "bond-unit-copy")
ORIG = os.path.join(VERIFY_OUT, "bond-unit-orig")
OUT = os.path.join(VERIFY_OUT, "bond-unit-out")
T_BOND = "tests/bond.test.ts"
VITEST = ["npx", "vitest", "run", T_BOND, "--cache=false", "--fsModuleCache=false", "--reporter=json"]
TEST_FILE = T_BOND
TIMEOUT_S = 600
EQUIV_MODE = False

F_BOND = "src/game/bond.ts"
F_ACTIONS = "src/game/actions.ts"
F_STATE = "src/game/state.ts"
F_SIM = "src/game/sim.ts"
F_IDLE = "src/art/idle.ts"
F_SCENE = "src/art/scene.ts"
F_HUD = "src/game/hud.ts"
F_TUNING = "src/data/tuning.ts"


def mut(id, file, old, new, expect, test=T_BOND):
    return dict(id=id, file=file, old=old, new=new, expect=expect, expect_file=test)


# Test titles (substrings of the full test names in tests/bond.test.ts)
LEVELS = "start at 0, 300, 800, 1,500, 3,000, 4,500, 6,500, 9,000, 12,000 and 15,000 XP"
INFO = "read as the level, the XP inside it, what the level takes and the next level"
UNLOCKS = "name only the unlocks that exist"
AGREE = "agrees with the HUD's `isAdultMode`"
TAPER_PET = "pays a pet 2 eight times, 1 fourteen times, then 0.5"
TAPER_TICKLE = "pays a tickle 3 five times, 1.5 ten times, then 0.75"
TAPER_PURE = "is a pure function of the want and the points gained so far"
WINDOW = "starts the window again after 60 minutes, and also when the clock was set back inside it"
AT100 = "still pays XP and the taper's amount when happiness is already 100"
STREAK = "pays a pet 1 XP up to the ninth of a chain and 2 from the tenth"
TICKLE = "pays a tickle 3 and leaves the chain and the time of the last pet alone"
GAP = "goes on with a gap of 0 and of 2,000 ms, and starts again after 2,001 ms"
BACK = "starts the chain again when the clock went back"
CAP = "stops at 15,000 XP and stays level 10"
LEVELUP = "reports a level once"
SHAPE = "gives a result of exactly the old shape when there is no new level"
ASLEEP = "pays nothing to a creature that is asleep (night or nap), away on a job, dead or an egg"
KID1 = "pays 15 happiness an hour in all, with no Bond written and the old result shape"
KID2 = "does not restart its window when the clock goes back"
KID3 = "leaves Bond data a profile already has as it is"
HOLD150 = "keeps a hold of 150 pets through a reload"
COERCE_GOOD = "reads a good Bond as it is and ignores other keys in it"
COERCE_BAD = "drops a damaged Bond whole"
LOADER = "is dropped by the loader when damaged and never throws"
BOUNDARY = "keeps the window at 59 minutes and starts it again at exactly 60"
SHARED = "shares the window with Kid Mode"
NEVER = "never goes down, whichever touch comes and whatever the clock does"
NEXT = "starts again with the next creature"
FIELD = "pays a creature in a field as at home"
FONDQ = "is fond from level 2 in Adult Mode"
BOUNCE = "makes a fond creature in a good mood bounce for joy"
NOTFOND = "leaves a creature that is not fond as it was"
GROW1 = "earns happy cells only inside the old hourly limit"
GROW2 = "earns no cell when the window has gained the old limit exactly"
LABEL = "reads the level and what is left, for a screen reader"
BAR = "fills the bar by the share of the level done"
LINES = "lists where it stands, the next unlock that exists"

# Not mutated (each argued from the code; `--equivalents` applies each one and exits 0 only when every test still passes, which is the proof that the argument holds):
#  - dropping `before.chain > 0 &&` in earnBond: with no chain the sum is `0 + 1`, so the chain is 1 whether or not the gap passes the test, and the else branch is 1 as well.
#  - dropping the `typeof ... !== "number"` guard on xp, chain or at in coerceBond: `Number.isInteger` and `Number.isFinite` do not convert, so each is false for a string or any other
#    non-number and the same `return undefined` follows. (The guards stay because they narrow the type for the comparisons after them; esbuild, which runs the tests, does not check types.)
# id, file, old (exact, must occur once in the file), new, expect (substring of the test's full name), expect_file
EQUIVALENT = [
    mut("chain-needs-no-previous", F_BOND, "before.chain > 0 && gap >= 0", "gap >= 0", "(none)"),
    mut("coerce-xp-typeof", F_BOND, 'if (typeof xp !== "number" || ', "if (", "(none)"),
    mut("coerce-chain-typeof", F_BOND, 'if (typeof chain !== "number" || ', "if (", "(none)"),
    mut("coerce-at-typeof", F_BOND, 'if (typeof at !== "number" || ', "if (", "(none)"),
]

_TAPER = "taper: { full: 15, half: 30, halfFactor: 0.5, quarterFactor: 0.25 },"
_LEVELS = "levelAt: [0, 300, 800, 1500, 3000, 4500, 6500, 9000, 12000, 15000],"
_STARTS = [0, 300, 800, 1500, 3000, 4500, 6500, 9000, 12000, 15000]


def level_mutants():
    out = []
    for i in range(1, 10):
        starts = list(_STARTS)
        starts[i] += 1  # one XP late: the table test reads the level just below and at each start
        out.append(mut("level-%d-starts-one-late" % (i + 1), F_TUNING, _LEVELS, "levelAt: [%s]," % ", ".join(str(x) for x in starts), LEVELS))
    return out


MUTANTS = level_mutants() + [
    # reading the XP
    mut("level-needs-more-than-the-start", F_BOND, "if (xp >= (b.levelAt[n] as number)) level = n + 1;", "if (xp > (b.levelAt[n] as number)) level = n + 1;", LEVELS),
    mut("info-span-one-too-long", F_BOND, "span: (b.levelAt[level] as number) - from,", "span: (b.levelAt[level] as number) - from + 1,", INFO),
    mut("info-last-level-has-a-next", F_BOND, "return { level, into: xp - from, span: 0, next: null };", "return { level, into: xp - from, span: 0, next: level };", INFO),
    mut("unlock-of-level-2-missing", F_BOND, '  [FOND_LEVEL]: "a happy bounce of its own now and then",\n', "", UNLOCKS),
    mut("unlock-of-level-5-renamed", F_BOND, '[BIG_BURST_LEVEL]: "a bigger burst when petted",', '[BIG_BURST_LEVEL]: "a burst",', UNLOCKS),
    mut("next-unlock-includes-this-level", F_BOND, "for (let n = level + 1; n <= LAST_LEVEL; n++) {", "for (let n = level; n <= LAST_LEVEL; n++) {", UNLOCKS),
    mut("adult-save-is-truthy", F_BOND, "save.settings.adultMode === true;", "Boolean(save.settings.adultMode);", AGREE),
    # earning XP
    mut("streak-from-the-ninth", F_TUNING, "streakFrom: 10,", "streakFrom: 9,", STREAK),
    mut("streak-from-the-eleventh", F_TUNING, "streakFrom: 10,", "streakFrom: 11,", STREAK),
    mut("streak-pays-three", F_TUNING, "xpPetStreak: 2,", "xpPetStreak: 3,", STREAK),
    mut("tickle-pays-two", F_TUNING, "xpTickle: 3,", "xpTickle: 2,", TICKLE),
    mut("tickle-moves-the-chain", F_BOND, 'if (kind === "pet") {', 'if (kind === "pet" || kind === "tickle") {', TICKLE),
    mut("pet-does-not-save-its-time", F_BOND, "    at = now;\n", "", STREAK),
    mut("chain-gap-2001-breaks", F_TUNING, "chainGapMs: 2000,", "chainGapMs: 1999,", GAP),
    mut("chain-gap-2002-goes-on", F_TUNING, "chainGapMs: 2000,", "chainGapMs: 2001,", GAP),
    mut("chain-gap-0-breaks", F_BOND, "gap >= 0 && gap <= b.chainGapMs", "gap > 0 && gap <= b.chainGapMs", GAP),
    mut("chain-allows-a-negative-gap", F_BOND, "gap >= 0 && gap <= b.chainGapMs", "gap <= b.chainGapMs", BACK),
    mut("chain-is-stored-uncapped", F_BOND, "Math.min(b.streakFrom, before.chain + 1)", "before.chain + 1", STREAK),
    mut("xp-has-no-cap", F_BOND, "const xp = Math.min(XP_MAX, before.xp + amount);", "const xp = before.xp + amount;", CAP),
    mut("level-up-every-time", F_BOND, "return after > levelOf(before.xp) ? after : null;", "return after;", LEVELUP),
    mut("level-up-when-equal", F_BOND, "return after > levelOf(before.xp) ? after : null;", "return after >= levelOf(before.xp) ? after : null;", LEVELUP),
    # the taper
    mut("taper-full-under-14", F_TUNING, _TAPER, "taper: { full: 14, half: 30, halfFactor: 0.5, quarterFactor: 0.25 },", TAPER_PET),
    mut("taper-half-under-29", F_TUNING, _TAPER, "taper: { full: 15, half: 29, halfFactor: 0.5, quarterFactor: 0.25 },", TAPER_PET),
    mut("taper-half-factor-0.6", F_TUNING, _TAPER, "taper: { full: 15, half: 30, halfFactor: 0.6, quarterFactor: 0.25 },", TAPER_PET),
    mut("taper-quarter-factor-0.3", F_TUNING, _TAPER, "taper: { full: 15, half: 30, halfFactor: 0.5, quarterFactor: 0.3 },", TAPER_PET),
    mut("taper-full-up-to-15", F_BOND, "gainedInWindow < t.full ? 1", "gainedInWindow <= t.full ? 1", TAPER_PURE),
    mut("taper-half-up-to-30", F_BOND, "gainedInWindow < t.half ?", "gainedInWindow <= t.half ?", TAPER_PURE),
    mut("adult-touch-skips-the-taper", F_ACTIONS, "adult ? taper(want, a.gained) :", "adult ? want :", TAPER_TICKLE),
    # `touch`
    mut("kid-gets-the-adult-rule", F_ACTIONS, "const adult = isAdultSave(save);", "const adult = true;", KID1),
    mut("adult-keeps-the-cap", F_ACTIONS, "const gained = adult ? taper(want, a.gained) : Math.max(", "const gained = Math.max(", TAPER_PET),
    mut("adult-window-ignores-a-clock-set-back", F_ACTIONS, " || (adult && nowMs < a.windowStart)", "", WINDOW),
    mut("kid-window-follows-a-clock-set-back", F_ACTIONS, "(adult && nowMs < a.windowStart)", "nowMs < a.windowStart", KID2),
    mut("bond-earned-in-kid-mode", F_ACTIONS, "const levelUp = adult ? earnBond(c, kind, nowMs) : null;", "const levelUp = earnBond(c, kind, nowMs);", KID1),
    mut("kid-bond-data-is-changed", F_ACTIONS, "const levelUp = adult ? earnBond(c, kind, nowMs) : null;", "const levelUp = adult || c.bond ? earnBond(c, kind, nowMs) : null;", KID3),
    mut("level-up-not-logged", F_ACTIONS, "    logEvent(save, nowMs, `Bond level ${levelUp}`);\n", "", LEVELUP),
    mut("result-always-has-a-level-up-key", F_ACTIONS, "  return { gained, asleep: false };\n}\n\n// A new egg takes", "  return { gained, asleep: false, levelUp: undefined };\n}\n\n// A new egg takes", SHAPE),
    mut("a-sleeper-is-paid", F_ACTIONS, "if (c.sleep) return { gained: 0, asleep: true };", "if (c.sleep && false) return { gained: 0, asleep: true };", ASLEEP),
    mut("an-away-creature-is-paid", F_ACTIONS, 'return save.phase === "alive" && !save.creature?.job ? save.creature : null;', 'return save.phase === "alive" ? save.creature : null;', ASLEEP),
    # what is saved
    mut("loader-keeps-anything", F_STATE, "const bond = coerceBond((value.creature as { bond?: unknown }).bond);", "const bond = (value.creature as { bond?: unknown }).bond as never;", LOADER),
    mut("loader-drops-a-good-bond", F_STATE, "if (bond) value.creature.bond = bond;", "if (bond && false) value.creature.bond = bond;", HOLD150),
    mut("coerce-keeps-a-fractional-xp", F_BOND, "!Number.isInteger(xp) || ", "", COERCE_BAD),
    mut("coerce-keeps-a-negative-xp", F_BOND, "xp < 0 || ", "", COERCE_BAD),
    mut("coerce-keeps-xp-over-the-cap", F_BOND, "xp > XP_MAX)", "xp > XP_MAX + 1)", COERCE_BAD),
    mut("coerce-keeps-a-fractional-chain", F_BOND, "!Number.isInteger(chain) || ", "", COERCE_BAD),
    mut("coerce-keeps-a-negative-chain", F_BOND, "chain < 0 || ", "", COERCE_BAD),
    mut("coerce-keeps-a-chain-over-ten", F_BOND, "chain > b.streakFrom)", "chain > b.streakFrom + 1)", COERCE_BAD),
    mut("coerce-keeps-a-time-that-is-not-finite", F_BOND, "!Number.isFinite(at) || ", "", COERCE_BAD),
    mut("coerce-keeps-a-negative-time", F_BOND, " || at < 0)", ")", COERCE_BAD),
    mut("coerce-reads-inherited-keys", F_BOND, '  if (!Object.hasOwn(v, "xp") || !Object.hasOwn(v, "chain") || !Object.hasOwn(v, "at")) return undefined;\n', "", COERCE_BAD),
    mut("coerce-reads-an-array-with-the-keys", F_BOND, 'if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;', 'if (typeof value !== "object" || value === null) return undefined;', COERCE_BAD),
    mut("coerce-throws-on-null", F_BOND, 'if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;', 'if (typeof value !== "object" || Array.isArray(value)) return undefined;', COERCE_BAD),
    mut("coerce-adds-the-other-keys", F_BOND, "return { xp, chain, at };\n}\n", "return { ...v, xp, chain, at } as Bond;\n}\n", COERCE_GOOD),
    # the window and the numbers of `touch`
    mut("window-is-59-minutes", F_TUNING, "affection: { windowMinutes: 60, maxGainPerWindow: 15, pet: 2, tickle: 3 },", "affection: { windowMinutes: 59, maxGainPerWindow: 15, pet: 2, tickle: 3 },", BOUNDARY),
    mut("window-is-61-minutes", F_TUNING, "affection: { windowMinutes: 60, maxGainPerWindow: 15, pet: 2, tickle: 3 },", "affection: { windowMinutes: 61, maxGainPerWindow: 15, pet: 2, tickle: 3 },", BOUNDARY),
    mut("window-restarts-only-after-more-than-60", F_ACTIONS, "nowMs - a.windowStart >= tuning.affection.windowMinutes * MINUTE", "nowMs - a.windowStart > tuning.affection.windowMinutes * MINUTE", BOUNDARY),
    mut("a-pet-is-worth-3-happiness", F_TUNING, "affection: { windowMinutes: 60, maxGainPerWindow: 15, pet: 2, tickle: 3 },", "affection: { windowMinutes: 60, maxGainPerWindow: 15, pet: 3, tickle: 3 },", TAPER_PET),
    mut("a-tickle-is-worth-4-happiness", F_TUNING, "affection: { windowMinutes: 60, maxGainPerWindow: 15, pet: 2, tickle: 3 },", "affection: { windowMinutes: 60, maxGainPerWindow: 15, pet: 2, tickle: 4 },", TAPER_TICKLE),
    mut("kid-has-its-own-window", F_ACTIONS, "tuning.affection.maxGainPerWindow - a.gained", "tuning.affection.maxGainPerWindow", SHARED),
    mut("taper-full-rate-is-double", F_BOND, "gainedInWindow < t.full ? 1 :", "gainedInWindow < t.full ? 2 :", TAPER_PURE),
    mut("a-poke-is-paid", F_ACTIONS, '  if (kind === "poke") return { gained: 0, asleep: false };\n', "", FIELD),
    mut("result-key-for-every-touch", F_ACTIONS, "if (levelUp !== null) {", "if (true) {", SHAPE),
    mut("a-dead-creature-is-paid", F_ACTIONS, 'return save.phase === "alive" && !save.creature?.job ? save.creature : null;', 'return !save.creature?.job ? save.creature : null;', ASLEEP),
    # XP and the chain
    mut("a-pet-is-worth-2-xp", F_TUNING, "xpPet: 1,", "xpPet: 2,", STREAK),
    mut("streak-needs-more-than-ten", F_BOND, "gain = chain >= b.streakFrom ?", "gain = chain > b.streakFrom ?", STREAK),
    mut("xp-starts-again-with-the-chain", F_BOND, "c.bond = { xp: before.xp, chain, at };", "c.bond = { xp: chain === 1 ? 0 : before.xp, chain, at };", NEVER),
    mut("hatched-creature-carries-a-bond", F_SIM, "    affection: { windowStart: t, gained: 0 },\n", "    affection: { windowStart: t, gained: 0 },\n    bond: { xp: 1, chain: 0, at: 0 },\n", NEXT),
    # growth: the happy cell
    mut("cells-always-open", F_ACTIONS, "underOldLimit ? happinessBefore : 100", "happinessBefore", GROW1),
    mut("cells-open-at-the-limit", F_ACTIONS, "const underOldLimit = a.gained < tuning.affection.maxGainPerWindow;", "const underOldLimit = a.gained <= tuning.affection.maxGainPerWindow;", GROW2),
    mut("cells-limit-read-after-the-touch", F_ACTIONS, "  const underOldLimit = a.gained < tuning.affection.maxGainPerWindow; // (what the window had gained before this touch)\n  a.gained += gained;\n",
        "  a.gained += gained;\n  const underOldLimit = a.gained < tuning.affection.maxGainPerWindow;\n", GROW1),
    # what the levels unlock
    mut("fond-from-level-3", F_BOND, "export const FOND_LEVEL = 2;", "export const FOND_LEVEL = 3;", UNLOCKS),
    mut("big-burst-from-level-6", F_BOND, "export const BIG_BURST_LEVEL = 5;", "export const BIG_BURST_LEVEL = 6;", UNLOCKS),
    mut("fond-in-kid-mode", F_BOND, "save.creature !== null && isAdultSave(save) && bondLevel", "save.creature !== null && bondLevel", FONDQ),
    mut("fond-in-a-grave", F_BOND, 'save.phase === "alive" && save.creature !== null && isAdultSave(save)', "save.creature !== null && isAdultSave(save)", FONDQ),
    mut("fond-with-no-creature", F_BOND, 'save.phase === "alive" && save.creature !== null && isAdultSave(save)', 'save.phase === "alive" && isAdultSave(save)', FONDQ),
    mut("mood-has-no-fond", F_SCENE, "    fond: bondAtLeast(save, FOND_LEVEL),\n", "", FONDQ),
    mut("bounce-chance-is-0.2", F_IDLE, "export const FOND_CHANCE = 0.12;", "export const FOND_CHANCE = 0.2;", BOUNCE),
    mut("bounce-includes-the-chance", F_IDLE, "if (rest < FOND_CHANCE) {", "if (rest <= FOND_CHANCE) {", BOUNCE),
    mut("bounce-shows-no-heart", F_IDLE, '      setPose(view, "happy");\n      addHeart(view);\n      return;\n', '      setPose(view, "happy");\n      return;\n', BOUNCE),
    mut("bounce-roll-not-spread", F_IDLE, "calm = (rest - FOND_CHANCE) / (1 - FOND_CHANCE);", "calm = rest;", BOUNCE),
    mut("low-spirits-forgets-hunger", F_IDLE, "if (mood.sick || mood.sad || mood.hungry || mood.sleepy) {", "if (mood.sick || mood.sad || mood.sleepy) {", NOTFOND),
    mut("low-spirits-forgets-sleepiness", F_IDLE, "if (mood.sick || mood.sad || mood.hungry || mood.sleepy) {", "if (mood.sick || mood.sad || mood.hungry) {", NOTFOND),
    mut("bounce-in-low-spirits", F_IDLE, '    else setPose(view, "idle", 2 + rand() * 3);\n    return;\n', '    else setPose(view, "idle", 2 + rand() * 3);\n', NOTFOND),
    # what the screen says
    mut("label-top-level-reworded", F_HUD, "`Bond level ${level}, the top level`", "`Bond level ${level}, top level`", LABEL),
    mut("label-swaps-the-numbers", F_HUD, "${level}, ${into} of ${span} to level ${next}`", "${level}, ${span} of ${into} to level ${next}`", LABEL),
    mut("bar-rounds", F_HUD, "Math.floor((100 * into) / span)", "Math.round((100 * into) / span)", BAR),
    mut("bar-empty-at-the-top", F_HUD, "return next === null ? 100 : Math.floor", "return next === null ? 0 : Math.floor", BAR),
    mut("lines-leave-out-the-unlock", F_HUD, "if (unlock) lines.push(", "if (false && unlock) lines.push(", LINES),
    mut("lines-poke-label-reworded", F_HUD, '"Poke: gets attention."', '"Poke: startles."', LINES),
    mut("lines-count-the-levels-wrong", F_HUD, "of ${tuning.bond.levelAt.length}.`", "of 9.`", LINES),
    # the loader
    mut("loader-reads-bond-of-a-null-creature", F_STATE, 'if (typeof value.creature === "object" && value.creature !== null) {', 'if (typeof value.creature === "object") {', LOADER),
    mut("loader-keeps-a-damaged-bond", F_STATE, "    else delete value.creature.bond;\n", "", LOADER),
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
