#!/usr/bin/env python3
# Mutation runner for the rules of Bug Catch (Broodkeep, adult slice A3.2, docs/adult-a3-plan.md section 10): the engine and the bands (game/training.ts, data/training.ts), what a run pays and
# the day count (game/training.ts, game/trainingDay.ts, game/bond.ts addBondXp), what the loader keeps (game/state.ts), the entry and the session's life in `Game` (ui/game.ts), the refusal
# sentences (game/reasons.ts), `localDay` (game/time.ts) and the words on the cards. The screen side (the overlay, the touch, the layout) is the UI runner's: mutate-train-ui.py.
#
# It works on a COPY of the repo (train-unit-copy/), never on the real tree. Each mutant is one exact text replace whose `old` must occur exactly once in its file. Only the test file named
# in `expect_file` runs per mutant (tests/training.test.ts or tests/training-game.test.ts): a mutant counts only when ITS named test fails, so the rest of the suite cannot change the verdict.
# A mutant is CAUGHT only when the test named in `expect` (a substring of its full name, in `expect_file`) fails.
#
#   python3 mutate-train-unit.py --list   checks each `old` occurs once in the real files (the EQUIVALENT ones too), prints the table, runs no tests
#   python3 mutate-train-unit.py          makes a fresh copy, runs the baseline (both test files), then every mutant, then checks the copy
#   python3 mutate-train-unit.py --only id1,id2   the same, for these mutants only
#   python3 mutate-train-unit.py --equivalents    runs the EQUIVALENT list (the mutants argued to change nothing) instead: exit 0 only when every one of them leaves every test passing
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
COPY = os.path.join(VERIFY_OUT, "train-unit-copy")
ORIG = os.path.join(VERIFY_OUT, "train-unit-orig")
OUT = os.path.join(VERIFY_OUT, "train-unit-out")
T_TRAIN = "tests/training.test.ts"
T_GAME = "tests/training-game.test.ts"
VITEST_ARGS = ["--cache=false", "--fsModuleCache=false", "--reporter=json"]
TEST_FILE = T_TRAIN
TIMEOUT_S = 600
EQUIV_MODE = False

F_TRAIN = "src/game/training.ts"
F_DAY = "src/game/trainingDay.ts"
F_DATA = "src/data/training.ts"
F_BOND = "src/game/bond.ts"
F_STATE = "src/game/state.ts"
F_TIME = "src/game/time.ts"
F_REASONS = "src/game/reasons.ts"
F_GAME = "src/ui/game.ts"


def mut(id, file, old, new, expect, test=T_TRAIN):
    return dict(id=id, file=file, old=old, new=new, expect=expect, expect_file=test)


# The refusals of `startTraining` from "open" to the line that makes the session; `startBurst` (A3.4) has the same four lines and then `const stage`, so the mutants of the session's entry anchor on this longer text.
SESSION_HEAD = 'if (this.training) return "open";\n    if (this.arena || this.view.moment !== null || this.decor) return "elsewhere";\n    const code = trainRefusal(c);\n    if (code !== null) return code;\n    this.training = {'


# Test titles (substrings of the full test names)
ALLOWED = "lets an awake, well kid, young or adult creature train, whatever its energy and wherever it is"
REFUSED = "refuses a baby, an away, asleep or sick creature, in the order away, asleep, sick, too young"
TIMETABLE = "spawns a kid run's bugs on the hand-worked timetable"
FRAMES = "gives the same run for the same seed at any frame rate"
BOUNDS = "keeps every bug inside the field and no more than the row allows"
GOLDSPEED = "makes a golden bug faster than a plain one and lets it live as long"
CAPDT = "counts at most 100 ms of one call and none of a bad one"
ENDING = "ends at exactly 75,000 ms of engine time, swept every millisecond around it"
PAUSE = "pays no time while paused, ignores taps while paused and goes on from the same place"
SCORING = "scores 10 a bug and 30 a golden one, doubles from the 5th catch of a streak and starts the streak again after a miss"
TWICE = "does not catch a bug twice or one that is not there, and does not let an expired bug touch the streak or the score"
FIFTH = "scores a catch when the 5th catch of a streak is the first one doubled, not the 4th and not the 6th"
BETWEEN = "has a tap that lands between bugs be a miss: it resets the streak and nothing else"
EDGES = "puts a score one under a line in the band below, on it in the band above, for every stage and both lines"
ORDER = "keeps the lines in order, the younger stage's lower, and the test scores in the band their names say"
GOLDSHARE = "gives Gold to 20 to 30 percent of the stand-in player's runs in every stage"
NOCATCH = "pays nothing and counts for nothing for a run with no catch"
NOBODY = "pays nobody when there is no living creature or it is away, and leaves the save as it was"
TIERS = "pays Gold +2 Speed for the first 3 sessions of a day, +1 for the next 3 and none after, with the tiers named"
HALF = "pays Bronze and Silver +1 Speed for the first 3 sessions and 0 for the next 3 (half rounds down)"
NEWDAY = "starts the count again on a new day and keeps one count for a whole local day, across a daylight saving change"
STOREDDAY = "follows the stored-day rule: a day before starts again, tomorrow keeps its counts and day and adds, two days ahead starts again"
STARTCARD = "reads the stored day the same way for the start card's count"
CAPPED = "pays 0 points at the stage cap, says so, and still pays Bond XP and discipline and counts the session"
CAPREAD = "reads the cap at the pay: a creature that grew up during the run pays with the adult cap"
AMOUNTS = "pays Bond XP 10, 20 and 30 and discipline +1, +1 and +2 by band, stopping at 100 and at 15,000"
LEVELONCE = "reports a Bond level once, when it is reached, and leaves the pet chain and the last pet time alone"
LOGLINE = "writes one dev-log line for a run that counted and none for one that did not"
ELSE = "changes nothing else about the creature"
COERCE = "keeps a whole, well-formed one and drops anything else without throwing"
STARTWORDS = "names the reward of the next session from the number already counted today"
RESULTWORDS = "says what each kind of result paid"
# tests/training-game.test.ts
ADULTONLY = "answers adult-only in Kid Mode and changes nothing"
NOCREATURE = "answers no-creature for an egg and for a dead creature"
ELSEWHERE = "answers elsewhere during a fight, a hatch or evolve scene and Decorate mode"
OWNREASON = "answers with the creature's own reason, in the order away, asleep, sick, too young, and not for tired or a place"
OPENCARD = "opens the start card, wakes the screens once, and answers open to a second call"
SEEDGO = "starts the run from Math.random, at the stage the session began at, and ignores a second Go"
BYTES = "leaves the save byte-identical and writes nothing through start, Go, a catch, a miss, a pause and Quit"
CHANGEDONCE = "makes the finish the only player call of changed"
PAYONCE = "pays a finished run once, stores the result for the card, wakes the screens after it is stored, and pays nothing for a second call"
FINISHGUARDS = "does nothing for a finish with no session, before the run is over, or while the start card is up"
QUIT = "closes a run that is quit in the middle, with a catch made, paying nothing"
DIED = "pays nobody when the creature died in the gap before the finish, and closes with no card"
CLEARS = "is a death, a retire and a hatch, and a save put in from the account; an evolution does not"
GROWS = "goes on when the clock moves and when the creature evolves, keeps the stage it began at, and pays with the new stage's cap"
REASONS = "says each reason the way a fight does, with train for fight"
LOADGOOD = "keeps a good one through a load, and leaves a save from before it without one"
LOADBAD = "drops a damaged one without throwing and keeps the rest of the creature"
SPRITES = "is a ladybug and a golden bug that differ in shape and size, not only in colour"

# Not mutated (each argued from the code; `--equivalents` applies each one and exits 0 only when every test still passes, which is the proof that the argument holds):
#  - dropping `|| Array.isArray(value)` in coerceTraining: an array has no own `day`, so the `hasOwn` test on the next line returns undefined for it all the same.
#  - dropping `|| !Object.hasOwn(v, "sessions")`: a missing `sessions` is undefined, and `typeof undefined !== "object"` two lines on returns undefined for it all the same.
#  - dropping `t.phase !== "playing" ||` in finishTraining: in the start card's phase `t.run` is null (`!t.run` returns) and in the result card's phase `t.result` is not null (the guard returns).
#  - dropping `|| t.result !== null` in finishTraining: `t.phase !== "playing"` returns for the same states (the phase is set to "done" in the line right after the result is stored, and nothing sets it back), so the two guards cover each other; the mutant that drops both is `finish-both-repeat-guards-dropped`.
#  - dropping `typeof day !== "number" ||` in coerceTraining: `!Number.isInteger(day)` on the same line is false for a string or any other non-number (Number.isInteger does not convert),
#    so the same `return undefined` follows. (The guard stays because it narrows the type for `day < 0`; esbuild, which runs the tests, does not check types.)
#  - `Math.round` -> `Math.floor` in localDay: `Date.UTC(...) / 86_400_000` is a whole number of days, so both give the same number.
# id, file, old (exact, must occur once in the file), new, expect (substring of the test's full name), expect_file
EQUIVALENT = [
    mut("coerce-array-guard", F_DAY, "value === null || Array.isArray(value)) return undefined;", "value === null) return undefined;", "(none)"),
    mut("coerce-sessions-key", F_DAY, ' || !Object.hasOwn(v, "sessions")) return undefined;', ") return undefined;", "(none)"),
    mut("finish-phase-guard", F_GAME, '!t || t.phase !== "playing" || !t.run', "!t || !t.run", "(none)"),
    mut("finish-result-guard", F_GAME, "|| !t.run.over || t.result !== null) return;", "|| !t.run.over) return;", "(none)"),  # the phase guard covers it: result and phase are set together
    mut("coerce-day-typeof", F_DAY, 'if (typeof day !== "number" || ', "if (", "(none)"),
    mut("local-day-floor", F_TIME, "return Math.round(Date.UTC(", "return Math.floor(Date.UTC(", "(none)"),
]

MUTANTS = [
    # who may train
    mut("refuse-busy-dropped", F_TRAIN, 'if (c.job) return "busy";', "", REFUSED),
    mut("refuse-asleep-dropped", F_TRAIN, 'if (c.sleep) return "asleep";', "", REFUSED),
    mut("refuse-sick-dropped", F_TRAIN, 'if (c.sick) return "sick";', "", REFUSED),
    mut("refuse-too-young-dropped", F_TRAIN, 'combatTuning.minStage)) return "too-young";', 'combatTuning.minStage) && false) return "too-young";', REFUSED),
    mut("refuse-sick-before-asleep", F_TRAIN, 'if (c.sleep) return "asleep";\n  if (c.sick) return "sick";', 'if (c.sick) return "sick";\n  if (c.sleep) return "asleep";', REFUSED),
    mut("refuse-tired-added", F_TRAIN, 'if (c.sick) return "sick";', 'if (c.sick) return "sick";\n  if (c.stats.energy < 90) return "asleep";', ALLOWED),
    # the engine
    mut("spawn-allows-one-more", F_TRAIN, "s.spawnInMs === 0 && s.bugs.length < row.most", "s.spawnInMs === 0 && s.bugs.length <= row.most", BOUNDS),
    mut("spawn-timer-goes-negative", F_TRAIN, "s.spawnInMs = Math.max(0, s.spawnInMs - t.stepMs);", "s.spawnInMs = s.spawnInMs - t.stepMs;", TIMETABLE),
    mut("spawn-timer-restarts-while-full", F_TRAIN, "if (s.spawnInMs === 0 && s.bugs.length < row.most) {", "if (s.spawnInMs === 0 && s.bugs.length >= row.most) s.spawnInMs = row.gapMs;\n  if (s.spawnInMs === 0 && s.bugs.length < row.most) {", TIMETABLE),
    mut("bug-lives-one-step-longer", F_TRAIN, "b.ageMs < row.lifeMs", "b.ageMs <= row.lifeMs", TIMETABLE),
    mut("bug-leaves-the-right-edge", F_TRAIN, "} else if (b.x > hi) {", "} else if (b.x > hi + 200) {", BOUNDS),
    mut("bug-leaves-the-top-edge", F_TRAIN, "if (b.y < lo) {", "if (b.y < lo - 200) {", BOUNDS),
    mut("golden-not-faster", F_DATA, "goldenSpeed: 1.5,", "goldenSpeed: 1,", GOLDSPEED),
    mut("one-step-a-call", F_TRAIN, "while (s.carryMs >= t.stepMs && !s.over) {", "if (s.carryMs >= t.stepMs && !s.over) {", CAPDT),
    mut("frame-cap-99", F_DATA, "frameCapMs: 100,", "frameCapMs: 99,", CAPDT),
    mut("frame-cap-101", F_DATA, "frameCapMs: 100,", "frameCapMs: 101,", CAPDT),
    mut("no-frame-cap", F_TRAIN, "Math.min(Math.max(dtMs, 0), t.frameCapMs)", "Math.max(dtMs, 0)", CAPDT),
    mut("bad-time-counted", F_TRAIN, "Number.isFinite(dtMs) ? Math.min(Math.max(dtMs, 0), t.frameCapMs) : 0", "Math.min(Math.max(dtMs, 0), t.frameCapMs)", CAPDT),
    mut("run-ends-a-step-late", F_TRAIN, "if (s.elapsedMs >= s.lengthMs) s.over = true;", "if (s.elapsedMs > s.lengthMs) s.over = true;", ENDING),
    mut("run-is-74-99-seconds", F_DATA, "sessionMs: 75_000,", "sessionMs: 74_990,", ENDING),
    mut("run-is-75-01-seconds", F_DATA, "sessionMs: 75_000,", "sessionMs: 75_010,", ENDING),
    mut("time-passes-while-paused", F_TRAIN, "if (s.over || s.paused) return false;\n  s.carryMs +=", "if (s.over) return false;\n  s.carryMs +=", PAUSE),
    mut("catch-while-paused", F_TRAIN, "if (s.over || s.paused) return null;", "if (s.over) return null;", PAUSE),
    mut("miss-while-paused", F_TRAIN, "if (s.over || s.paused) return false;\n  s.streak = 0;", "if (s.over) return false;\n  s.streak = 0;", PAUSE),
    # scoring
    mut("catch-worth-5", F_DATA, "catchPoints: 10,", "catchPoints: 5,", SCORING),
    mut("golden-worth-20", F_DATA, "goldenPoints: 30,", "goldenPoints: 20,", SCORING),
    mut("streak-doubles-from-the-4th", F_DATA, "streakFrom: 5,", "streakFrom: 4,", FIFTH),
    mut("streak-doubles-from-the-6th", F_DATA, "streakFrom: 5,", "streakFrom: 6,", FIFTH),
    mut("streak-triples", F_DATA, "streakFactor: 2,", "streakFactor: 3,", SCORING),
    mut("miss-keeps-the-streak", F_TRAIN, "  s.streak = 0;\n  s.misses += 1;", "  s.misses += 1;", BETWEEN),
    mut("miss-costs-points", F_TRAIN, "  s.streak = 0;\n  s.misses += 1;", "  s.streak = 0;\n  s.score = Math.max(0, s.score - 5);\n  s.misses += 1;", BETWEEN),
    mut("expired-bug-breaks-the-streak", F_TRAIN, "if (s.bugs.length !== before) changed = true;", "if (s.bugs.length !== before) {\n    changed = true;\n    s.streak = 0;\n  }", TWICE),
    mut("caught-bug-stays", F_TRAIN, "  s.bugs.splice(i, 1);\n", "", TWICE),
    # the bands
    mut("silver-needs-more-than-the-line", F_TRAIN, "score >= row.silverAt ?", "score > row.silverAt ?", EDGES),
    mut("gold-needs-more-than-the-line", F_TRAIN, "score >= row.goldAt ?", "score > row.goldAt ?", EDGES),
    mut("kid-silver-line-651", F_DATA, "silverAt: 650,", "silverAt: 651,", EDGES),
    mut("kid-gold-line-691", F_DATA, "goldAt: 690 }", "goldAt: 691 }", EDGES),
    mut("young-silver-line-791", F_DATA, "silverAt: 790,", "silverAt: 791,", EDGES),
    mut("young-gold-line-841", F_DATA, "goldAt: 840 }", "goldAt: 841 }", EDGES),
    mut("adult-silver-line-851", F_DATA, "silverAt: 850,", "silverAt: 851,", EDGES),
    mut("adult-gold-line-911", F_DATA, "goldAt: 910 }", "goldAt: 911 }", EDGES),
    mut("adult-gold-line-lower", F_DATA, "goldAt: 910 }", "goldAt: 880 }", GOLDSHARE),
    # what a run pays
    mut("zero-catch-run-counts", F_TRAIN, "  if (hits === 0) return result;\n  result.counted = true;", "  result.counted = true;", NOCATCH),
    mut("pay-an-away-creature", F_TRAIN, 'if (save.phase !== "alive" || !c || c.job) return null;\n  return paySession(save, c, "bug"', 'if (save.phase !== "alive" || !c) return null;\n  return paySession(save, c, "bug"', NOBODY),
    mut("pay-a-dead-save", F_TRAIN, 'if (save.phase !== "alive" || !c || c.job) return null;\n  return paySession(save, c, "bug"', 'if (!c || c.job) return null;\n  return paySession(save, c, "bug"', NOBODY),
    mut("three-full-sessions-become-2", F_DATA, "full: 3,", "full: 2,", TIERS),
    mut("three-full-sessions-become-4", F_DATA, "full: 3,", "full: 4,", TIERS),
    mut("three-half-sessions-become-2", F_DATA, "half: 3,", "half: 2,", TIERS),
    mut("three-half-sessions-become-4", F_DATA, "half: 3,", "half: 4,", TIERS),
    mut("half-rounds-up", F_TRAIN, "Math.floor(full / 2)", "Math.ceil(full / 2)", HALF),
    mut("gold-pays-1-speed", F_DATA, "points: { bronze: 1, silver: 1, gold: 2 }", "points: { bronze: 1, silver: 1, gold: 1 }", TIERS),
    mut("silver-pays-2-speed", F_DATA, "points: { bronze: 1, silver: 1, gold: 2 }", "points: { bronze: 1, silver: 2, gold: 2 }", HALF),
    mut("full-tier-ends-a-session-late", F_DAY, 'count < t.full ? "full"', 'count <= t.full ? "full"', TIERS),
    mut("half-tier-ends-a-session-late", F_DAY, 'count < t.full + t.half ? "half"', 'count <= t.full + t.half ? "half"', TIERS),
    mut("capped-stat-still-pays", F_TRAIN, "result.points = addTrained(c, stat, want);", "result.points = want;", CAPPED),
    mut("the-stat-is-strength", F_DATA, 'bug: { name: "Bug Catch", stat: "spd", statName: "Speed" }', 'bug: { name: "Bug Catch", stat: "str", statName: "Speed" }', TIERS),
    mut("count-is-not-capped", F_TRAIN, "Math.min(day.count + 1, t.countMax)", "day.count + 1", TIERS),
    mut("count-cap-is-5", F_DATA, "countMax: 6,", "countMax: 5,", COERCE),
    mut("discipline-gold-1", F_DATA, "discipline: { bronze: 1, silver: 1, gold: 2 }", "discipline: { bronze: 1, silver: 1, gold: 1 }", AMOUNTS),
    mut("discipline-silver-2", F_DATA, "discipline: { bronze: 1, silver: 1, gold: 2 }", "discipline: { bronze: 1, silver: 2, gold: 2 }", AMOUNTS),
    mut("discipline-bronze-2", F_DATA, "discipline: { bronze: 1, silver: 1, gold: 2 }", "discipline: { bronze: 2, silver: 1, gold: 2 }", AMOUNTS),
    mut("discipline-cap-101", F_DATA, "disciplineMax: 100,", "disciplineMax: 101,", AMOUNTS),
    mut("bond-xp-silver-10", F_DATA, "bondXp: { bronze: 10, silver: 20, gold: 30 }", "bondXp: { bronze: 10, silver: 10, gold: 30 }", AMOUNTS),
    mut("bond-xp-bronze-5", F_DATA, "bondXp: { bronze: 10, silver: 20, gold: 30 }", "bondXp: { bronze: 5, silver: 20, gold: 30 }", AMOUNTS),
    mut("bond-xp-gold-20", F_DATA, "bondXp: { bronze: 10, silver: 20, gold: 30 }", "bondXp: { bronze: 10, silver: 20, gold: 20 }", AMOUNTS),
    mut("bond-xp-has-no-cap", F_BOND, "const xp = Math.min(XP_MAX, before.xp + amount);", "const xp = before.xp + amount;", AMOUNTS),
    mut("bond-xp-resets-the-chain", F_BOND, "c.bond = { xp, chain: before.chain, at: before.at };", "c.bond = { xp, chain: 0, at: before.at };", LEVELONCE),
    mut("bond-xp-resets-the-pet-time", F_BOND, "c.bond = { xp, chain: before.chain, at: before.at };", "c.bond = { xp, chain: before.chain, at: 0 };", LEVELONCE),
    mut("bond-level-reported-every-time", F_BOND, "return after > levelOf(before.xp) ? after : null;", "return after;", LEVELONCE),
    mut("log-line-dropped", F_TRAIN, "  logEvent(save, nowMs, `${name}: ${band}", "  void (save, nowMs, `${name}: ${band}", LOGLINE),
    # the day count and localDay
    mut("same-day-starts-again", F_DAY, "have.day < today ||", "have.day <= today ||", NEWDAY),
    mut("yesterday-keeps-its-count", F_DAY, "have.day < today ||", "have.day < today - 1 ||", NEWDAY),
    mut("tomorrow-starts-again", F_DAY, "have.day > today + 1)", "have.day > today)", STOREDDAY),
    mut("two-days-ahead-is-kept", F_DAY, "have.day > today + 1)", "have.day > today + 2)", STOREDDAY),
    mut("tomorrow-is-rewritten-as-today", F_TRAIN, "c.training = { day: day.day,", "c.training = { day: localDay(nowMs),", STOREDDAY),
    mut("start-card-keeps-two-days-ahead", F_DAY, "have.day > today + 1)", "have.day > today + 1 && false)", STARTCARD),
    mut("local-day-is-the-utc-day", F_TIME, "Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())", "Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())", NEWDAY),
    # the loader
    mut("coerce-allows-a-fractional-day", F_DAY, 'typeof day !== "number" || !Number.isInteger(day) || day < 0)', 'typeof day !== "number" || day < 0)', COERCE),
    mut("coerce-allows-a-negative-day", F_DAY, "!Number.isInteger(day) || day < 0) return undefined;", "!Number.isInteger(day)) return undefined;", COERCE),
    mut("coerce-allows-a-fractional-count", F_DAY, 'typeof count !== "number" || !Number.isInteger(count) || count < 0', 'typeof count !== "number" || count < 0', COERCE),
    mut("coerce-allows-a-negative-count", F_DAY, "!Number.isInteger(count) || count < 0 || count > t.countMax", "!Number.isInteger(count) || count > t.countMax", COERCE),
    mut("coerce-allows-a-count-over-6", F_DAY, "|| count < 0 || count > t.countMax) return undefined;", "|| count < 0) return undefined;", COERCE),
    mut("coerce-allows-an-unknown-stat", F_DAY, "if (!STAT_KEYS.includes(key as CombatStat)) return undefined;", "", COERCE),
    mut("coerce-allows-an-array-of-sessions", F_DAY, "sessions === null || Array.isArray(sessions)) return undefined;", "sessions === null) return undefined;", COERCE),
    mut("loader-keeps-a-damaged-one", F_STATE, "    else delete value.creature.training;\n", "", LOADBAD, T_GAME),
    mut("loader-drops-a-good-one", F_STATE, "if (training) value.creature.training = training;", "if (false) value.creature.training = training;", LOADGOOD, T_GAME),
    # the words
    mut("start-line-bond-only-reworded", F_TRAIN, "return `${word}: Bond XP only today`;", "return `${word}: bond only today`;", STARTWORDS),
    mut("start-line-half-counts-from-0", F_TRAIN, "${count - t.full + 1} of ${t.half} today", "${count - t.full} of ${t.half} today", STARTWORDS),
    mut("start-line-full-counts-from-0", F_TRAIN, "${count + 1} of ${t.full} today", "${count} of ${t.full} today", STARTWORDS),
    mut("result-no-catch-reworded", F_TRAIN, '"No bugs caught: nothing to pay."', '"Nothing caught."', RESULTWORDS),
    mut("result-leaves-out-discipline", F_TRAIN, "if (r.discipline > 0) lines.push(", "if (false) lines.push(", RESULTWORDS),
    mut("result-leaves-out-the-level", F_TRAIN, "\n  if (r.level !== null) lines.push(", "\n  if (false) lines.push(", RESULTWORDS),
    mut("result-capped-reworded", F_TRAIN, "`${word} is as high as it can go for now`", "`${word} is full`", RESULTWORDS),
    mut("result-half-reworded", F_TRAIN, "`No ${word} from this one: half rewards round down`", "`No ${word} from this one`", RESULTWORDS),
    mut("result-used-up-reworded", F_TRAIN, "`Bond XP only now: today's ${word} sessions are used up`", "`Bond XP only now`", RESULTWORDS),
    mut("reason-sick-reworded", F_REASONS, '"Sick: it needs medicine before it can train."', '"Sick."', REASONS, T_GAME),
    mut("reason-too-young-says-fight", F_REASONS, "Too young to train: it starts at", "Too young to fight: it starts at", REASONS, T_GAME),
    # the entry and the session's life
    mut("entry-adult-check-dropped", F_GAME, 'if (!isAdultMode(this.save)) return "adult-only";\n    this.tick();', "this.tick();", ADULTONLY, T_GAME),
    mut("entry-no-creature-check-dropped", F_GAME, 'this.tick();\n    const c = this.save.creature;\n    if (this.save.phase !== "alive" || !c) return "no-creature";\n    if (this.training) return "open";', 'this.tick();\n    const c = this.save.creature;\n    if (this.training) return "open";', NOCREATURE, T_GAME),
    mut("entry-open-check-dropped", F_GAME, SESSION_HEAD, SESSION_HEAD.replace('if (this.training) return "open";\n    ', ""), OPENCARD, T_GAME),
    mut("entry-arena-check-dropped", F_GAME, SESSION_HEAD, SESSION_HEAD.replace("this.arena || ", ""), ELSEWHERE, T_GAME),
    mut("entry-moment-check-dropped", F_GAME, SESSION_HEAD, SESSION_HEAD.replace("this.view.moment !== null || ", ""), ELSEWHERE, T_GAME),
    mut("entry-decor-check-dropped", F_GAME, SESSION_HEAD, SESSION_HEAD.replace(" || this.decor", ""), ELSEWHERE, T_GAME),
    mut("entry-refusal-dropped", F_GAME, SESSION_HEAD, SESSION_HEAD.replace("    const code = trainRefusal(c);\n    if (code !== null) return code;\n", ""), OWNREASON, T_GAME),
    mut("entry-stage-is-adult", F_GAME, "stage: trainStageOf(c), game: this.trainPick, phase", 'stage: "adult", game: this.trainPick, phase', SEEDGO, T_GAME),
    mut("seed-from-the-save", F_GAME, "newBugCatch(Math.floor(Math.random() * 2 ** 32), t.stage)", "newBugCatch(this.save.rngState >>> 0, t.stage)", SEEDGO, T_GAME),
    mut("begin-marks-changed", F_GAME, '    t.phase = "playing";\n    this.listeners.forEach((listener) => listener());', '    t.phase = "playing";\n    this.changed();\n    this.listeners.forEach((listener) => listener());', BYTES, T_GAME),
    mut("a-second-go-starts-again", F_GAME, 'if (!t || t.phase !== "ready") return;', "if (!t) return;", SEEDGO, T_GAME),
    mut("finish-both-repeat-guards-dropped", F_GAME, ' || t.phase !== "playing" || !t.run || !t.run.over || t.result !== null) return;', " || !t.run || !t.run.over) return;", PAYONCE, T_GAME),
    mut("finish-before-the-end", F_GAME, "|| !t.run.over ||", "||", FINISHGUARDS, T_GAME),
    mut("finish-without-a-tick", F_GAME, "    this.tick();\n    if (this.training !== t) return;\n", "", DIED, T_GAME),
    mut("finish-does-not-wake-after-the-store", F_GAME, '      t.phase = "done";\n    }\n    this.listeners.forEach((listener) => listener());\n', '      t.phase = "done";\n    }\n', PAYONCE, T_GAME),
    mut("quit-pays", F_GAME, "    if (!this.training) return;\n    this.training = null;", "    if (!this.training) return;\n    const run = this.training.run;\n    if (run) this.act((save, now) => payTraining(save, save.creature, run, now));\n    this.training = null;", QUIT, T_GAME),
    mut("birth-time-not-compared", F_GAME, "|| c.bornAt !== this.training.bornAt)", ")", CLEARS, T_GAME),
    mut("evolution-ends-the-session", F_GAME, "|| c.bornAt !== this.training.bornAt)", "|| c.bornAt !== this.training.bornAt || trainStageOf(c) !== this.training.stage)", GROWS, T_GAME),
    mut("death-keeps-the-session", F_GAME, 'if (this.training && (this.save.phase !== "alive" || !c ||', "if (this.training && (!c ||", CLEARS, T_GAME),
    mut("replace-save-keeps-the-session", F_GAME, "    this.training = null; // a save put in from the account or another profile pays nothing\n", "", CLEARS, T_GAME),
    # the pictures
    mut("golden-bug-loses-a-wing-row", "src/art/sprites.ts", '"LLWKYYYYKWLL",', '"...KYYYYK...",', SPRITES, T_GAME),
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
    return read(os.path.join(REAL, m["file"])).count(m["old"])


def titles_of(test_file):
    """The titles of the `it(...)` tests in a test file (double-quoted, as this repo writes them)."""
    text = read(os.path.join(REAL, test_file))
    return re.findall(r'\bit\(\s*"((?:[^"\\]|\\.)*)"', text)


def do_list():
    bad = 0
    known = {f: titles_of(f) for f in (T_TRAIN, T_GAME)}
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
        rc, data = run_vitest("baseline", [T_TRAIN, T_GAME])
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
            rc, data = run_vitest(m["id"], [m.get("expect_file", TEST_FILE)])
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
