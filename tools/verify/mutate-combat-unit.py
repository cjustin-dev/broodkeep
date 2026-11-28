#!/usr/bin/env python3
# Mutation runner for the rules of Timed combat (Broodkeep, adult slice A4.3, docs/adult-a4-plan.md section 10 and 13): how a tap is graded and worded (game/combat/timing.ts), what a grade does to the
# player's blows, guard and meter, the parry, the foe's shown move, the one sulk (game/combat/battle.ts), the harder ladder and the start of a fight (data/combat.ts, game/combat/fight.ts, game/actions.ts)
# and the recoil of a parried blow (art/arena.ts). The screen side (the pad, the notes, the result card) is the UI runner's: mutate-combat-ui.py. The Kid-Mode mutants are caught by the golden record
# (tests/combat-golden.test.ts), the rest by tests/combat-timed.test.ts.
#
# It works on a COPY of the repo (combat-unit-copy/), never on the real tree. Each mutant is one exact text replace whose `old` must occur exactly once in its file. Only the test file named in
# `expect_file` runs per mutant: a mutant counts only when ITS named test fails, so the rest of the suite cannot change the verdict. The baseline runs the two files and the older combat tests
# (tests/combat.test.ts and tests/arena.test.ts, which must pass unchanged: Kid Mode's rules). `--equivalents` runs all four files for each EQUIVALENT mutant.
#
#   python3 mutate-combat-unit.py --list   checks each `old` occurs once in the real files (the EQUIVALENT ones too), prints the table, runs no tests
#   python3 mutate-combat-unit.py          makes a fresh copy, runs the baseline, then every mutant, then checks the copy
#   python3 mutate-combat-unit.py --only id1,id2   the same, for these mutants only
#   python3 mutate-combat-unit.py --equivalents    runs the EQUIVALENT list (the mutants argued to change nothing) instead: exit 0 only when every one of them leaves every test passing
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
COPY = os.path.join(VERIFY_OUT, "combat-unit-copy")
ORIG = os.path.join(VERIFY_OUT, "combat-unit-orig")
OUT = os.path.join(VERIFY_OUT, "combat-unit-out")
T_TIMED = "tests/combat-timed.test.ts"
T_GOLDEN = "tests/combat-golden.test.ts"
T_KID = "tests/combat.test.ts"  # Kid Mode's rules, unchanged: in the baseline only
T_ARENA = "tests/arena.test.ts"  # unchanged: in the baseline only
TESTS = [T_TIMED, T_GOLDEN]
BASELINE = [T_TIMED, T_GOLDEN, T_KID, T_ARENA]
VITEST_ARGS = ["--cache=false", "--fsModuleCache=false", "--reporter=json"]
TEST_FILE = T_TIMED
TIMEOUT_S = 600
EQUIV_MODE = False

F_TIMING = "src/game/combat/timing.ts"
F_BATTLE = "src/game/combat/battle.ts"
F_DATA = "src/data/combat.ts"
F_FIGHT = "src/game/combat/fight.ts"
F_ACT = "src/game/actions.ts"
F_ARENA = "src/art/arena.ts"
F_RHYTHM = "src/data/rhythm.ts"
F_LAND = "src/data/forms/land.ts"
F_FIXTURE = "tests/fixtures/combat-golden.json"


def mut(id, file, old, new, expect, test=T_TIMED, also=()):
    # `also`: more (old, new) replaces in the same file, applied after the first; each `old` must occur exactly once too (for a mutant that needs two guards removed at once)
    return dict(id=id, file=file, old=old, new=new, expect=expect, expect_file=test, also=tuple(also))


# Test titles (substrings of the full test names), tests/combat-timed.test.ts
G_WIN = "has the two windows at 80 and 160 ms"
G_SWEEP = "grades every whole millisecond from -200 to +200"
G_EDGE = "calls the edges by name, early and late alike"
G_NAN = "counts a tap that is not a number, or is a very long way off, as Normal"
G_WORDS = "says the grade in words"
G_PG = "says nothing for a Perfect guard that had no blow to parry"
B_FACT = "hits for 8, 10 and 12"
B_GUARDFOE = "hits a guarding foe for 4, 5 and 6"
B_SPECIAL = "does the same for a special: 18, 22 and 27 open"
B_CRIT = "applies the grade after a critical hit"
B_SEED5 = "works the same way at another seed (5)"
GD_TAKES = "takes 4, 3 and 0 of an 8-point blow"
GD_FLOOR = "never takes a Normal or Good guard below 1"
GD_PARRY = "parries: the blow does nothing"
GD_METER = "charges the meter for a parry"
GD_SPECIAL = "parries a special too"
GD_ONE = "saves a creature that is at 1 HP from a parried blow"
GD_NOPARRY = "gives a Perfect guard against a guarding foe only the guard's own 1 of meter, and no parry"
M_PERF = "gets +1 from a Perfect Attack"
M_FULL = "stays full when a Perfect Attack lands on a full meter"
M_SPECIAL = "is emptied by a special, and a Perfect Special gives nothing back"
M_CAP = "is never above full"
M_FOE = "charges the foe by 1 for every blow the player lands"
R_LONG = "leaves the random state the same after every round of a long fight"
R_END = "is the same up to the round in which a fight ends"
P_START = "is drawn by planFoe with the chooser it is given"
P_EXACT = "is exactly what the wild creature then does"
P_CHOOSER = "uses the chooser given to planFoe"
P_DROP = "is dropped when the fight ends"
P_NEVER = "is never set in a fight that is not timed"
U_IGN = "is ignored: a Perfect guard does not parry"
S_ONCE = "lets a timed creature sulk exactly once in 30 rounds"
S_KID = "still lets a creature in a fight that is not timed sulk many times"
S_GRADE = "gives a sulked round no grade effect"
A_RECOIL = "does not make its target recoil"
L_RUNGS = "has as many rungs as the Kid ladder"
L_BUILD = "meets the same wild creature at each rung"
L_ADULT = "starts a timed fight only in Adult Mode"
T_ORDER = "applies the grade after the crit, where the order shows in the rounding"
T_FOEBLOW = "leaves the foe's blow alone in a round with a Perfect Attack"
M_FOEMETER = "charges the wild creature's meter the same for a Perfect Attack as for a Normal one"
S_ROLL = "draws the sulk roll even when the cap stops the sulk"
S_DISC = "never sulks at discipline 100"
P_SAVE = "is the same for the same save"
# tests/combat-golden.test.ts
K_FIGHTS = "plays the 14 recorded fights round by round as recorded"
K_STARTS = "starts the 22 recorded fights as recorded"
K_PAY = "pays and changes the save for the 24 recorded finished fights as recorded"
K_THRESH = "pays the coins and the dropped material of the 40 recorded wins"
K_ROSTER = "draws the wild creature from the recorded roster of forms"
K_COVER = "has recorded fights worth comparing with"

# Not mutated (each argued from the code; `--equivalents` applies each one and exits 0 only when every test still passes, which is the proof that the argument holds):
#  - dropping `offsetMs === null ||` in timingWord: Number.isFinite(null) is false, so `!Number.isFinite(offsetMs)` already returns null for a pad nobody tapped; the null test is there for the type.
#  - dropping `b.timed &&` from the choice of the foe's move (`b.timed && b.foeNext ? ...`): a fight that is not timed never has a `foeNext` (P_NEVER and the golden record), so the test is redundant at run time.
#  - `timed !== null &&` in the parry test (`parry-in-kid-fight`): playRound already makes the grade "normal" in a fight that is not timed, and a parry needs a Perfect grade, so the second guard is never the one that decides
#    (`grade-in-kid-fight` removes both guards at once and is caught; either guard alone changes nothing).
#  - `b.timed &&` in the grade of a round (`grade-passed-in-kid-fight`): a fight that is not timed hands its grade on to `strike`, but `strike` builds `timed` as null there and reads the grade only behind `timed &&` or `timed !== null`
#    (the multiplier, the parry, the meter bonus, the guard share), so the grade has nothing to act on. The test of a grade in a fight that is not timed used to catch it only through the `timing` mark on events (since removed).
#  - `mine !== "sulk"` in the grade of a round (`sulked-round-graded`): a creature that sulks neither strikes nor guards, so its grade has nothing to multiply, no guard to turn into a parry and no guard event to mark;
#    the gate says in code what the plan says in words, and nothing observable depends on it.
#  - the burst that `drawStrikes` skips for a parried blow (art/arena.ts): it is drawing only, no unit test reads canvas pixels and the screen runner cannot hold a 100 ms flash still; it is argued and
#    looked at on the contact sheet only (docs/known-issues.md).
# id, file, old (exact, must occur once in the file), new, expect (substring of the test's full name), expect_file
EQUIVALENT = [
    mut("word-null-check", F_TIMING, "if (offsetMs === null || !Number.isFinite(offsetMs)) return null;", "if (!Number.isFinite(offsetMs as number)) return null;", "(none)"),
    mut("kid-reads-plan", F_BATTLE, "const theirs = b.timed && b.foeNext ? b.foeNext : chooseFoe(b, rng);", "const theirs = b.foeNext ? b.foeNext : chooseFoe(b, rng);", "(none)"),
    mut("parry-in-kid-fight", F_BATTLE, 'const parried = timed !== null && who === "foe" && target.guarding && grade === "perfect";', 'const parried = who === "foe" && target.guarding && grade === "perfect";', "(none)"),
    mut("grade-passed-in-kid-fight", F_BATTLE, 'const grade: Timing = b.timed && mine !== "sulk" ? timing : "normal";', 'const grade: Timing = mine !== "sulk" ? timing : "normal";', "(none)"),
    mut("sulked-round-graded", F_BATTLE, 'const grade: Timing = b.timed && mine !== "sulk" ? timing : "normal";', 'const grade: Timing = b.timed ? timing : "normal";', "(none)"),
]

GRADE_BLOCK_OLD = '''  const timed = b.timed ? combatTuning.timed : null;
  if (timed && who === "me") damage = Math.round(damage * timed.grade[grade]);
  const parried = timed !== null && who === "foe" && target.guarding && grade === "perfect";
  if (parried) damage = 0;
  else if (target.guarding) {
    const share = timed && who === "foe" && grade === "good" ? timed.guardGood : combatTuning.guardFactor;
    damage = Math.max(1, Math.round(damage * share));
  }
'''
GRADE_BLOCK_AFTER_GUARD = '''  const timed = b.timed ? combatTuning.timed : null;
  const parried = timed !== null && who === "foe" && target.guarding && grade === "perfect";
  if (parried) damage = 0;
  else if (target.guarding) {
    const share = timed && who === "foe" && grade === "good" ? timed.guardGood : combatTuning.guardFactor;
    damage = Math.max(1, Math.round(damage * share));
  }
  if (timed && who === "me") damage = Math.round(damage * timed.grade[grade]);
'''
SULK_IF = "if (rng.chance(b.sulkChance) && !(b.timed && b.sulks >= 1)) {"
GRADE_LINE = 'if (timed && who === "me") damage = Math.round(damage * timed.grade[grade]);'
PERFECT_BONUS = 'else if (timed && who === "me" && grade === "perfect") attacker.meter = Math.min(combatTuning.meterMax, attacker.meter + 1);'
SPECIAL_EMPTY = 'if (kind === "special") attacker.meter = 0;'
FOE_PLAN_ROUND = "else b.foeNext = chooseFoe(b, rng);"
PARRIED_DEF = 'const parried = timed !== null && who === "foe" && target.guarding && grade === "perfect";'
TIMED_LINE = "  const timed = b.timed ? combatTuning.timed : null;"
GRADE_OF_ROUND = 'const grade: Timing = b.timed && mine !== "sulk" ? timing : "normal";'
TARGET_METER = "target.meter = Math.min(combatTuning.meterMax, target.meter + 1 + (parried ? combatTuning.timed.parryMeter : 0));"

MUTANTS = [
    # grading a tap and the words for it
    mut("perfect-window-wide", F_TIMING, 'if (distance <= timingWindows.perfectMs) return "perfect";', 'if (distance <= timingWindows.perfectMs + 1) return "perfect";', G_SWEEP),
    mut("perfect-edge-open", F_TIMING, 'if (distance <= timingWindows.perfectMs) return "perfect";', 'if (distance < timingWindows.perfectMs) return "perfect";', G_EDGE),
    mut("good-window-wide", F_TIMING, 'if (distance <= timingWindows.goodMs) return "good";', 'if (distance <= timingWindows.goodMs + 1) return "good";', G_SWEEP),
    mut("good-edge-open", F_TIMING, 'if (distance <= timingWindows.goodMs) return "good";', 'if (distance < timingWindows.goodMs) return "good";', G_EDGE),
    mut("offset-not-absolute", F_TIMING, "const distance = Math.abs(offsetMs);", "const distance = offsetMs;", G_SWEEP),
    mut("miss-is-good", F_TIMING, '  return "normal";', '  return "good";', G_NAN),
    mut("perfect-guard-always-said", F_TIMING, 'return action === "guard" && !parried ? null : `Perfect ${action}`;', "return `Perfect ${action}`;", G_PG),
    mut("good-word-without-action", F_TIMING, 'if (grade === "good") return `Good ${action}`;', 'if (grade === "good") return "Good";', G_WORDS),
    mut("early-late-swapped", F_TIMING, 'return offsetMs < 0 ? "Early" : "Late";', 'return offsetMs < 0 ? "Late" : "Early";', G_WORDS),
    mut("nan-says-late", F_TIMING, "if (offsetMs === null || !Number.isFinite(offsetMs)) return null;", "if (offsetMs === null) return null;", G_WORDS),
    mut("perfect-window-in-the-data", F_RHYTHM, "perfectMs: 80,", "perfectMs: 90,", G_WIN),
    # the numbers
    mut("perfect-factor-low", F_DATA, "grade: { perfect: 1.5, good: 1.2, normal: 1 },", "grade: { perfect: 1.4, good: 1.2, normal: 1 },", B_FACT),
    mut("good-factor-high", F_DATA, "grade: { perfect: 1.5, good: 1.2, normal: 1 },", "grade: { perfect: 1.5, good: 1.3, normal: 1 },", B_SPECIAL),
    mut("good-factor-dropped", F_DATA, "grade: { perfect: 1.5, good: 1.2, normal: 1 },", "grade: { perfect: 1.5, good: 1, normal: 1 },", B_FACT),
    mut("normal-factor-up", F_DATA, "grade: { perfect: 1.5, good: 1.2, normal: 1 },", "grade: { perfect: 1.5, good: 1.2, normal: 1.1 },", B_FACT),
    mut("good-guard-share-up", F_DATA, "guardGood: 0.35,", "guardGood: 0.5,", GD_TAKES),
    mut("parry-meter-zero", F_DATA, "parryMeter: 1,", "parryMeter: 0,", GD_METER),
    mut("adult-first-rung-steep", F_DATA, "adultLadder: [0.8, 1.2, 1.65, 2.4, 3.3],", "adultLadder: [1.0, 1.2, 1.65, 2.4, 3.3],", L_RUNGS),
    mut("adult-ladder-short", F_DATA, "adultLadder: [0.8, 1.2, 1.65, 2.4, 3.3],", "adultLadder: [0.8, 1.2, 1.65, 2.4],", L_RUNGS),
    mut("adult-boss-edited", F_DATA, "adultLadder: [0.8, 1.2, 1.65, 2.4, 3.3],", "adultLadder: [0.8, 1.2, 1.65, 2.4, 3.0],", L_RUNGS),
    # what a grade does to the player's blows
    mut("grade-before-crit", F_BATTLE, "  if (crit) damage = Math.round(damage * combatTuning.crit.factor);\n" + GRADE_BLOCK_OLD.split("\n", 2)[0] + "\n" + GRADE_BLOCK_OLD.split("\n", 2)[1], GRADE_BLOCK_OLD.split("\n", 2)[0] + "\n" + GRADE_BLOCK_OLD.split("\n", 2)[1] + "\n  if (crit) damage = Math.round(damage * combatTuning.crit.factor);", T_ORDER),
    mut("grade-after-foe-guard", F_BATTLE, GRADE_BLOCK_OLD, GRADE_BLOCK_AFTER_GUARD, B_CRIT),
    mut("grade-on-foe-blows", F_BATTLE, GRADE_LINE, "if (timed) damage = Math.round(damage * timed.grade[grade]);", GD_TAKES),
    mut("good-guard-on-my-blows", F_BATTLE, "const share = timed && who === \"foe\" && grade === \"good\" ?", "const share = timed && grade === \"good\" ?", B_GUARDFOE),
    mut("good-guard-is-normal", F_BATTLE, 'const share = timed && who === "foe" && grade === "good" ? timed.guardGood : combatTuning.guardFactor;', "const share = combatTuning.guardFactor;", GD_TAKES),
    mut("grade-rounds-up", F_BATTLE, GRADE_LINE, 'if (timed && who === "me") damage = Math.ceil(damage * timed.grade[grade]);', B_SEED5),
    mut("special-guard-share", F_BATTLE, "damage = Math.max(1, Math.round(damage * share));", 'damage = Math.max(1, Math.round(damage * (kind === "special" ? 0.6 : share)));', B_SPECIAL),
    mut("guard-floor-dropped", F_BATTLE, "damage = Math.max(1, Math.round(damage * share));", "damage = Math.round(damage * share);", GD_FLOOR),
    # the parry
    mut("parry-without-guard", F_BATTLE, PARRIED_DEF, 'const parried = timed !== null && who === "foe" && grade === "perfect";', T_FOEBLOW),
    mut("parry-on-good", F_BATTLE, PARRIED_DEF, 'const parried = timed !== null && who === "foe" && target.guarding && grade !== "normal";', GD_TAKES),
    mut("parry-of-my-own-blow", F_BATTLE, PARRIED_DEF, 'const parried = timed !== null && target.guarding && grade === "perfect";', B_GUARDFOE),
    mut("parry-leaves-one", F_BATTLE, "if (parried) damage = 0;", "if (parried) damage = 1;", GD_ONE),
    mut("perfect-guard-bonus-without-a-blow", F_BATTLE, "b[who].meter = Math.min(combatTuning.meterMax, b[who].meter + 1);", 'b[who].meter = Math.min(combatTuning.meterMax, b[who].meter + 1 + (b.timed && who === "me" && grade === "perfect" ? combatTuning.timed.parryMeter : 0));', GD_NOPARRY),
    mut("parry-meter-not-added", F_BATTLE, TARGET_METER, "target.meter = Math.min(combatTuning.meterMax, target.meter + 1);", GD_METER),
    mut("parry-meter-uncapped", F_BATTLE, TARGET_METER, "target.meter = target.meter + 1 + (parried ? combatTuning.timed.parryMeter : 0);", M_CAP),
    mut("parried-special-keeps-foe-meter", F_BATTLE, SPECIAL_EMPTY, 'if (kind === "special" && !parried) attacker.meter = 0;', GD_SPECIAL),
    mut("parried-blow-unmarked", F_BATTLE, ", ...(parried ? { parried: true as const } : {}) });", ", ...({}) });", GD_PARRY),
    # the meter
    mut("perfect-special-refunds", F_BATTLE, SPECIAL_EMPTY, 'if (kind === "special") attacker.meter = timed && who === "me" && grade === "perfect" ? 1 : 0;', M_SPECIAL),
    mut("good-attack-charges", F_BATTLE, PERFECT_BONUS, PERFECT_BONUS.replace('grade === "perfect"', 'grade !== "normal"'), M_PERF),
    mut("perfect-attack-no-charge", F_BATTLE, PERFECT_BONUS, PERFECT_BONUS.replace('grade === "perfect"', 'grade === "perfect" && false'), M_PERF),
    mut("perfect-attack-charges-two", F_BATTLE, PERFECT_BONUS, PERFECT_BONUS.replace("attacker.meter + 1", "attacker.meter + 2"), M_PERF),
    mut("perfect-attack-charge-uncapped", F_BATTLE, "attacker.meter = Math.min(combatTuning.meterMax, attacker.meter + 1);", "attacker.meter = attacker.meter + 1;", M_FULL),
    mut("perfect-charges-the-foe-too", F_BATTLE, PERFECT_BONUS, PERFECT_BONUS.replace('timed && who === "me" && ', "timed && "), M_FOEMETER),
    # the random stream: a grade must not change how many numbers a round draws
    mut("good-tap-draws-a-number", F_BATTLE, "  const roll = lo + rng.next() * (hi - lo);\n", "  const roll = lo + rng.next() * (hi - lo);\n  if (grade === \"good\") rng.next();\n", R_LONG),
    mut("perfect-blow-in-reach-of-a-kill-draws-a-number", F_BATTLE, "  target.hp = Math.max(0, target.hp - damage);\n", "  if (grade === \"perfect\" && target.hp <= damage * 2) rng.next();\n  target.hp = Math.max(0, target.hp - damage);\n", R_END),
    # the foe's shown move
    mut("plan-not-redrawn", F_BATTLE, FOE_PLAN_ROUND, "else b.foeNext = b.foeNext;", P_START),
    mut("plan-kept-after-fight", F_BATTLE, "if (b.over) delete b.foeNext;", "if (b.over) b.foeNext = b.foeNext;", P_DROP),
    mut("foe-ignores-plan", F_BATTLE, "const theirs = b.timed && b.foeNext ? b.foeNext : chooseFoe(b, rng);", "const theirs = chooseFoe(b, rng);", P_EXACT),
    mut("plan-in-kid-fight", F_BATTLE, "  if (b.timed) {\n    if (b.over) delete b.foeNext;", "  if (true) {\n    if (b.over) delete b.foeNext;", P_NEVER),
    mut("plan-ignores-own-chooser", F_BATTLE, "  b.foeNext = chooseFoe(b, rng);\n  b.rngState", "  b.foeNext = foeChoice(b, rng);\n  b.rngState", P_CHOOSER),
    mut("first-plan-not-drawn", F_FIGHT, "if (timed) planFoe(battle);", "", P_SAVE),
    # the one sulk and the grade of a sulked round
    mut("sulk-cap-two", F_BATTLE, SULK_IF, "if (rng.chance(b.sulkChance) && !(b.timed && b.sulks >= 2)) {", S_ONCE),
    mut("sulk-cap-none", F_BATTLE, SULK_IF, "if (rng.chance(b.sulkChance) && !(b.timed && b.sulks >= 99)) {", S_ONCE),
    mut("sulk-cap-in-kid-fight", F_BATTLE, SULK_IF, "if (rng.chance(b.sulkChance) && !(b.sulks >= 1)) {", S_KID),
    mut("sulks-not-counted", F_BATTLE, "b.sulks += 1;", "b.sulks += 0;", S_ONCE),
    mut("sulk-roll-skipped-once-capped", F_BATTLE, SULK_IF, "if (!(b.timed && b.sulks >= 1) && rng.chance(b.sulkChance)) {", S_ROLL),
    mut("grade-lost-after-the-sulk", F_BATTLE, GRADE_OF_ROUND, 'const grade: Timing = b.timed && mine !== "sulk" && b.sulks === 0 ? timing : "normal";', S_GRADE),
    mut("sulk-chance-cap-raised", F_DATA, "sulk: { below: 50, perPoint: 0.01, max: 0.3 },", "sulk: { below: 50, perPoint: 0.01, max: 0.4 },", S_DISC),
    mut("grade-in-kid-fight", F_BATTLE, GRADE_OF_ROUND, 'const grade: Timing = mine !== "sulk" ? timing : "normal";', U_IGN, also=[(TIMED_LINE, "  const timed = combatTuning.timed;")]),
    # the harder ladder and the start of a fight
    mut("kid-fight-uses-adult-ladder", F_FIGHT, "(timed ? combatTuning.adultLadder : combatTuning.ladder)[rung - 1]!", "combatTuning.adultLadder[rung - 1]!", L_BUILD),
    mut("timed-fight-uses-kid-ladder", F_FIGHT, "(timed ? combatTuning.adultLadder : combatTuning.ladder)[rung - 1]!", "combatTuning.ladder[rung - 1]!", L_BUILD),
    mut("battle-not-marked-timed", F_FIGHT, "isBossRung(rung), sulkChance(c.stats.discipline), seed, timed);", "isBossRung(rung), sulkChance(c.stats.discipline), seed);", L_ADULT),
    mut("every-fight-timed", F_ACT, "beginFight(save, c, nowMs, save.settings.adultMode === true)", "beginFight(save, c, nowMs, true)", L_ADULT),
    mut("adult-mode-off-counts-as-on", F_ACT, "beginFight(save, c, nowMs, save.settings.adultMode === true)", "beginFight(save, c, nowMs, save.settings.adultMode !== undefined)", L_ADULT),
    mut("no-fight-timed", F_ACT, "beginFight(save, c, nowMs, save.settings.adultMode === true)", "beginFight(save, c, nowMs, false)", L_ADULT),
    # the screen's reading of a parried blow
    mut("parried-blow-recoils", F_ARENA, "step.event.actor !== side && !step.event.parried) found", "step.event.actor !== side) found", A_RECOIL),
    # Kid Mode, held by the golden record alone: the same texts, caught by the recorded fights, starts and payouts
    mut("golden-plan-in-kid-fight", F_BATTLE, "  if (b.timed) {\n    if (b.over) delete b.foeNext;", "  if (true) {\n    if (b.over) delete b.foeNext;", K_FIGHTS, T_GOLDEN),
    mut("golden-sulk-cap-in-kid-fight", F_BATTLE, SULK_IF, "if (rng.chance(b.sulkChance) && !(b.sulks >= 1)) {", K_FIGHTS, T_GOLDEN),
    mut("golden-kid-boss-rung", F_DATA, "ladder: [0.7, 0.85, 1.0, 1.15, 1.4],", "ladder: [0.7, 0.85, 1.0, 1.15, 1.5],", K_STARTS, T_GOLDEN),
    mut("golden-kid-uses-adult-ladder", F_FIGHT, "(timed ? combatTuning.adultLadder : combatTuning.ladder)[rung - 1]!", "combatTuning.adultLadder[rung - 1]!", K_STARTS, T_GOLDEN),
    mut("golden-kid-guard-factor", F_DATA, "guardFactor: 0.5,", "guardFactor: 0.6,", K_FIGHTS, T_GOLDEN),
    mut("golden-kid-boss-pay", F_DATA, "bossFactor: 2,", "bossFactor: 3,", K_PAY, T_GOLDEN),
    mut("golden-roster-form-moved", F_LAND, 'id: "gravelhorn",\n    stage: "adult",', 'id: "gravelhorn",\n    stage: "young",', K_ROSTER, T_GOLDEN),
    mut("golden-coverage-line-changed", F_FIXTURE, '"discipline 45|0.05",', '"discipline 45|0.06",', K_COVER, T_GOLDEN),
    mut("golden-kid-coin-range", F_DATA, "coinsExtra: 2,", "coinsExtra: 3,", K_THRESH, T_GOLDEN),
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
