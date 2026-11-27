#!/usr/bin/env python3
# Mutation runner for the rules of field tappables (Broodkeep, adult slice A3.4, docs/adult-a3-plan.md section 17): the pure rules (game/tappables.ts, data/tappables.ts), the burst's pay
# (game/training.ts payBurst), and their life in `Game` (ui/game.ts: the visit, the two clocks, the calm blocks, the leaves and clears, the tap, the reaction, the burst). The screen side (the Stage's
# hit test, hold and attributes, the draw order) is the UI runner's: mutate-tap-ui.py.
#
# It works on a COPY of the repo (tap-unit-copy/), never on the real tree. Each mutant is one exact text replace whose `old` must occur exactly once in its file. Only the test file named in
# `expect_file` runs per mutant: a mutant counts only when ITS named test fails (a substring of its full name, in `expect_file`), so the rest of the suite cannot change the verdict.
#
#   python3 mutate-tap-unit.py --list   checks each `old` occurs once in the real files (the EQUIVALENT ones too) and each `expect` is a real test title, prints the table, runs no tests
#   python3 mutate-tap-unit.py          makes a fresh copy, runs the baseline (the two test files), then every mutant, then checks the copy
#   python3 mutate-tap-unit.py --only id1,id2   the same, for these mutants only
#   python3 mutate-tap-unit.py --equivalents    runs the EQUIVALENT list (the mutants argued to change nothing) instead, against BOTH test files: exit 0 only when every one of them leaves every test passing
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
COPY = os.path.join(VERIFY_OUT, "tap-unit-copy")
ORIG = os.path.join(VERIFY_OUT, "tap-unit-orig")
OUT = os.path.join(VERIFY_OUT, "tap-unit-out")
T_RULES = "tests/tappables.test.ts"  # the pure rules, the tuning and the burst's pay
T_GAME = "tests/tappables-game.test.ts"
VITEST_ARGS = ["--cache=false", "--fsModuleCache=false", "--reporter=json"]
TEST_FILE = T_RULES
TIMEOUT_S = 600
EQUIV_MODE = False

F_RULES = "src/game/tappables.ts"
F_DATA = "src/data/tappables.ts"
F_GAME = "src/ui/game.ts"
F_TRAIN = "src/game/training.ts"

# The row names of the table in tests/tappables-game.test.ts that holds a visit (`it(`${name}: no spawn for 120 s, ...`)`); there is no table of fixed rows.
FIXED_ROWS = []
ROWS = ["the habitat screen", "the arena screen", "a fight", "a training session", "Decorate mode", "a hatch or evolve scene", "a haul card waiting", "an open panel", "a meal in progress"]


def mut(id, file, old, new, expect, test=T_RULES):
    return dict(id=id, file=file, old=old, new=new, expect=expect, expect_file=test)


def game(id, file, old, new, expect):
    return mut(id, file, old, new, expect, T_GAME)


def row(name):
    return "%s: no spawn for 120 s" % name


# Test titles (substrings of the full test names). The pure rules:
TUNING = "is the built numbers, as literals"
PICKUPS = "names each field's pickup and the material it pays"
WAITENDS = "is 20,000 ms at the bottom of the draw and 40,000 at the top"
WALK = "walks sparkle, rustle, bug, pickup by their weights"
NOKIND = "never takes a kind that is not possible"
NOPICKUP = "with no pickup left the top of the draw is a bug"
POSSIBLE = "allows a bug only when the creature can train and none is out, and the pickup only once a visit"
PLACE1 = "is the first try that is in the band and clear of the creature"
WIDE = "keeps the picture clear of the creature's box widened by the hit pad"
GAP = "keeps 2 pixels between two pictures"
TRIES = "tries six times"
TOUCH = "counts up to the pad (8) past the picture on each side"
NEAREST = "is for the nearest of those it touches"
SPARKLE = "a sparkle is 1 coin, or in half of the draws 1 material"
RUSTLE = "a rustle is a found gift in half of the draws"
RUSTLEV = "a rustle that reaches a Bond level says which"
PICKUP = "a pickup is 1 of its field's material with its own name"
BURSTLEN = "is as long as it is told"
BURSTXP = "pays 1 Bond XP for each bug up to 6"
BURSTMAT = "pays 1 of the field's material only when a golden bug was caught"
BURSTLOG = "writes one line in the log for a catch"
NOTSESSION = "is not a training session: no Speed"
NOBODY = "pays nobody when there is no living creature or it is away"
BURSTWORDS = "is read out as the number caught"
# the game
G_FIRST = "starts at the first step in the field"
G_LONG = "waits 40 s when the draw is at the top of the range"
G_NEXT = "counts the next wait from the start of the one before"
G_WAKES = "wakes the screens when one is made and when it fades"
G_CAP = "counts a step of 100,000 ms as 2,000"
G_CAPLIFE = "ages a tappable that is out by 2,000 ms on a step of 100,000"
G_CLEAR = "keeps the picture off the creature"
G_REPLACE = "goes when a game is put in with the same creature in the same field"
G_BACK = "counts a step backwards"
G_DEV = "is not moved by the dev speed"
G_FADE = "fades a tappable at 90,000 ms of unblocked time"
G_PANEL = "a panel open for ten minutes removes nothing"
G_CALL = "a call is not a block"
G_WHO = "makes none for 10 minutes in Kid Mode"
G_LEAVE = "goes when the creature leaves"
G_PICKUPFIELD = "a visit's pickup is the new field's after a move"
G_FOUR = "shows at most four at once"
G_BUG2 = "makes a second bug only when the first is gone"
G_PICK1 = "makes the pickup once a visit"
G_SICK = "makes no bug for a creature that cannot train"
G_SPARKLE = "on a sparkle pays 1 coin"
G_SPMAT = "on a sparkle can pay a material"
G_RUSTLE = "on a rustle is a moment together"
G_PICKUPTAP = "on a pickup pays its field's material with its name"
G_FACE = "turns the creature toward the spot"
G_WRONGID = "takes the one nearest its middle only when asked by id"
G_PASSIVE = "is an ordinary player action"
G_STALE = "that arrives after a block began"
G_ASLEEP = "that arrives after the creature fell asleep"
G_STALEBUG = "on a bug that turned sick since the last step"
G_BURSTOPEN = "opens the overlay at once in `playing`"
G_BURSTPAY = "is paid as a burst: Bond XP for each bug"
G_BURSTREFUSE = "is refused for the same reasons as a session"
G_BURSTQUIT = "pays nothing when it is quit or closed"
G_BURSTEARLY = "pays nothing for a finish while the run is not over"
G_SESSION = "is not what a session is paid as"
G_NOGLOBAL = "never reads the global Math.random"
G_NORAND = "never reads `game.rand`"
G_160 = "makes the fourth tappable at exactly 160,000 ms"

BLOCK = 'this.screen !== "room" || this.arena !== null || this.training !== null || this.decor !== null || this.view.moment !== null || this.save.hauls.length > 0 || this.menuOpen || this.view.snack !== null;'


# the lines of `startBurst` that `startTraining` does not share (it has `stage: trainStageOf(c)` inline, and a `tick()` first)
BURST_TAIL = 'if (this.training) return "open";\n    if (this.arena || this.view.moment !== null || this.decor) return "elsewhere";\n    const code = trainRefusal(c);\n    if (code !== null) return code;\n    const stage = trainStageOf(c);'


def without(term):
    """The calm-blocks line with one term taken out."""
    assert term in BLOCK
    rest = BLOCK.replace(term + " || ", "", 1) if (term + " || ") in BLOCK else BLOCK.replace(" || " + term, "", 1)
    return rest


# Not mutated (each argued from the code; `--equivalents` applies each one and exits 0 only when every test still passes, which is the proof that the argument holds):
#  - dropping `this.tapClock = 0;` when a visit starts: the clock is only ever used as a difference (`tapClock - p.born`), and a new visit has no tappables, so a clock that goes on from the last visit changes nothing.
#  - dropping `c.bornAt === v.bornAt` from the guard in `tapTappable` (the stale-tap check): `changed()` already ends a visit when another creature hatched (`dropVisitIfGone`), so a visit that still stands is always the same creature's; the guard is a second line of defence for a path that mutates the save without `changed()`.
#  - dropping `c.place !== visit.place` there: the same argument for a move to another field, which goes through `act` and so through `changed()`.
#  - `!!c` taken out of `tapEligible` (`!c?.job && c?.sleep === null`): with no creature `c?.sleep` is undefined, `undefined === null` is false, so the line is false and `c.place` after it is never reached: the same value for every save.
#  - `this.tapEligible()` taken out of `syncTapView`: every caller either has no visit (`endVisit` sets it null first, `stepTappables` has dropped it), has just checked eligibility (`tapTappable`), or has a session open (`startBurst` sets its training before the sync), which `tapBlocked` already hides.
#  - (`blocked-time-counts` already covers a clock that runs while blocked; the life is on that clock, so a separate mutant for the life was a no-op and was removed.)
EQUIVALENT = [
    mut("clock-not-reset", F_GAME, "      this.tapClock = 0;\n      this.tapWait = nextWait(rng);", "      this.tapWait = nextWait(rng);", "(none)"),
    mut("tap-stale-creature-guard", F_GAME, "if (!this.tapEligible() || c.bornAt !== visit.bornAt || c.place !== visit.place) {", "if (!this.tapEligible() || c.place !== visit.place) {", "(none)"),
    mut("eligible-no-creature", F_GAME, "this.save.phase === \"alive\" && !!c && !c.job && c.sleep === null", "this.save.phase === \"alive\" && !c?.job && c?.sleep === null", "(none)"),
    mut("view-shows-while-ineligible", F_GAME, "this.tapVisit !== null && this.tapEligible() && !this.tapBlocked() ?", "this.tapVisit !== null && !this.tapBlocked() ?", "(none)"),
    mut("tap-stale-place-guard", F_GAME, "if (!this.tapEligible() || c.bornAt !== visit.bornAt || c.place !== visit.place) {", "if (!this.tapEligible() || c.bornAt !== visit.bornAt) {", "(none)"),
]

MUTANTS = [
    # ---- the tuning that the rules read ----
    mut("delay-bottom-19s", F_DATA, "delayMs: [20_000, 40_000] as [number, number],", "delayMs: [19_000, 40_000] as [number, number],", WAITENDS),
    mut("delay-top-41s", F_DATA, "delayMs: [20_000, 40_000] as [number, number],", "delayMs: [20_000, 41_000] as [number, number],", WAITENDS),
    game("cap-2500", F_DATA, "clockCapMs: 2000,", "clockCapMs: 2500,", G_CAP),
    game("cap-1999", F_DATA, "clockCapMs: 2000,", "clockCapMs: 1999,", G_CAP),
    game("most-5", F_DATA, "most: 4,", "most: 5,", G_FOUR),
    game("most-3", F_DATA, "most: 4,", "most: 3,", G_FOUR),
    game("life-91s", F_DATA, "lifeMs: 90_000,", "lifeMs: 91_000,", G_FADE),
    game("life-89s", F_DATA, "lifeMs: 90_000,", "lifeMs: 89_000,", G_FADE),
    mut("weight-sparkle", F_DATA, "weights: { sparkle: 4, rustle: 3, bug: 3, pickup: 2 }", "weights: { sparkle: 5, rustle: 3, bug: 3, pickup: 2 }", WALK),
    mut("weight-rustle", F_DATA, "weights: { sparkle: 4, rustle: 3, bug: 3, pickup: 2 }", "weights: { sparkle: 4, rustle: 4, bug: 3, pickup: 2 }", WALK),
    mut("weight-bug", F_DATA, "weights: { sparkle: 4, rustle: 3, bug: 3, pickup: 2 }", "weights: { sparkle: 4, rustle: 3, bug: 2, pickup: 2 }", WALK),
    mut("weight-pickup", F_DATA, "weights: { sparkle: 4, rustle: 3, bug: 3, pickup: 2 }", "weights: { sparkle: 4, rustle: 3, bug: 3, pickup: 3 }", WALK),
    mut("sparkle-material-third", F_DATA, "sparkleMaterialChance: 1 / 2,", "sparkleMaterialChance: 1 / 3,", SPARKLE),
    mut("rustle-xp-4", F_DATA, "rustleXp: 3,", "rustleXp: 4,", RUSTLE),
    mut("rustle-gift-third", F_DATA, "rustleGiftChance: 1 / 2,", "rustleGiftChance: 1 / 3,", RUSTLE),
    mut("burst-11s", F_DATA, "burstMs: 10_000,", "burstMs: 11_000,", TUNING),
    mut("burst-xp-max-7", F_DATA, "burstXpMax: 6,", "burstXpMax: 7,", BURSTXP),
    mut("size-9", F_DATA, "size: 8,", "size: 9,", TUNING),
    mut("pad-7", F_DATA, "pad: 8,", "pad: 7,", TOUCH),
    mut("pad-9", F_DATA, "pad: 8,", "pad: 9,", TOUCH),
    mut("tries-5", F_DATA, "tries: 6,", "tries: 5,", TRIES),
    mut("tries-7", F_DATA, "tries: 6,", "tries: 7,", TRIES),
    mut("gap-1", F_DATA, "gap: 2,", "gap: 1,", GAP),
    mut("gap-3", F_DATA, "gap: 2,", "gap: 3,", GAP),
    mut("band-x-min-11", F_DATA, "xMin: 12,", "xMin: 11,", TUNING),
    mut("band-x-max-109", F_DATA, "xMax: 108,", "xMax: 109,", TUNING),
    mut("band-y-min-95", F_DATA, "yMin: 96,", "yMin: 95,", TUNING),
    mut("band-y-max-110", F_DATA, "yMax: 109 }", "yMax: 110 }", TUNING),
    mut("pickup-land-stone", F_DATA, 'land: { name: "acorn", article: "an", material: "wood" }', 'land: { name: "acorn", article: "an", material: "stone" }', PICKUPS),
    mut("pickup-water-wood", F_DATA, 'water: { name: "shell", article: "a", material: "fish" }', 'water: { name: "shell", article: "a", material: "wood" }', PICKUPS),
    mut("pickup-sky-fish", F_DATA, 'sky: { name: "crystal", article: "a", material: "stone" }', 'sky: { name: "crystal", article: "a", material: "fish" }', PICKUPS),
    # ---- the wait, the kind, the place ----
    mut("wait-top-short", F_RULES, "rng.int(t.delayMs[0], t.delayMs[1]);", "rng.int(t.delayMs[0], t.delayMs[1] - 1);", WAITENDS),
    mut("bug-ignores-training", F_RULES, 'bug: canTrain && !tappables.some((p) => p.kind === "bug"),', 'bug: !tappables.some((p) => p.kind === "bug"),', POSSIBLE),
    mut("second-bug-allowed", F_RULES, 'bug: canTrain && !tappables.some((p) => p.kind === "bug"),', "bug: canTrain,", POSSIBLE),
    mut("pickup-every-time", F_RULES, "pickup: !visit.pickupMade }", "pickup: true }", POSSIBLE),
    mut("kind-slice-edge-taken", F_RULES, "if (w > 0 && left < w) return kind;", "if (w > 0 && left <= w) return kind;", WALK),
    mut("kind-not-possible-weighs", F_RULES, "can[kind] ? t.weights[kind] : 0", "t.weights[kind]", NOKIND),
    mut("kind-total-short", F_RULES, "let left = rng.next() * total;", "let left = rng.next() * (total - 1);", WALK),
    mut("place-not-widened", F_RULES, "const wide: Box = { x: creature.x - t.pad, y: creature.y - t.pad, w: creature.w + 2 * t.pad, h: creature.h + 2 * t.pad };", "const wide: Box = { x: creature.x, y: creature.y, w: creature.w, h: creature.h };", WIDE),
    mut("place-widened-left-only", F_RULES, "w: creature.w + 2 * t.pad,", "w: creature.w + t.pad,", WIDE),
    mut("place-creature-ignored", F_RULES, "if (overlaps(box, wide)) continue;", "", WIDE),
    mut("place-others-ignored", F_RULES, "const apart = others.every((o) => !overlaps(box, { x: o.x - t.gap, y: o.y - t.gap, w: t.size + 2 * t.gap, h: t.size + 2 * t.gap }));", "const apart = true;", GAP),
    mut("place-gap-one-side", F_RULES, "w: t.size + 2 * t.gap, h: t.size + 2 * t.gap", "w: t.size + t.gap, h: t.size + 2 * t.gap", GAP),
    mut("place-gap-rows-dropped", F_RULES, "h: t.size + 2 * t.gap }", "h: t.size }", GAP),
    mut("place-x-first-y-second-swapped", F_RULES, "const x = rng.int(t.band.xMin, t.band.xMax);\n    const y = rng.int(t.band.yMin, t.band.yMax);", "const y = rng.int(t.band.yMin, t.band.yMax);\n    const x = rng.int(t.band.xMin, t.band.xMax);", PLACE1),
    mut("place-one-try-fewer", F_RULES, "for (let k = 0; k < t.tries; k++) {", "for (let k = 0; k < t.tries - 1; k++) {", TRIES),
    # ---- the touch ----
    mut("touch-left-strict", F_RULES, "x >= p.x - t.pad &&", "x > p.x - t.pad &&", TOUCH),
    mut("touch-right-strict", F_RULES, "x <= p.x + t.size + t.pad &&", "x < p.x + t.size + t.pad &&", TOUCH),
    mut("touch-top-strict", F_RULES, "y >= p.y - t.pad &&", "y > p.y - t.pad &&", TOUCH),
    mut("touch-bottom-strict", F_RULES, "y <= p.y + t.size + t.pad;", "y < p.y + t.size + t.pad;", TOUCH),
    mut("touch-no-pad-left", F_RULES, "x >= p.x - t.pad &&", "x >= p.x &&", TOUCH),
    mut("nearest-uses-corner", F_RULES, "Math.hypot(p.x + t.size / 2 - x, p.y + t.size / 2 - y)", "Math.hypot(p.x - x, p.y - y)", NEAREST),
    mut("nearest-oldest-on-tie", F_RULES, "best !== null && p.id > best.id", "best !== null && p.id < best.id", NEAREST),
    mut("nearest-farthest", F_RULES, "if (d < bestDistance ||", "if (d > bestDistance ||", NEAREST),
    # ---- the pays ----
    mut("sparkle-material-inverted", F_RULES, "const material = rng.chance(t.sparkleMaterialChance);", "const material = !rng.chance(t.sparkleMaterialChance);", SPARKLE),
    mut("sparkle-coins-2", F_RULES, '{ kind: "coins", amount: 1 }', '{ kind: "coins", amount: 2 }', SPARKLE),
    mut("rustle-gift-inverted", F_RULES, "if (rng.chance(t.rustleGiftChance)) return", "if (!rng.chance(t.rustleGiftChance)) return", RUSTLE),
    mut("rustle-xp-one", F_RULES, "payBond(save, c, t.rustleXp, nowMs);", "payBond(save, c, 1, nowMs);", RUSTLE),
    mut("rustle-level-dropped", F_RULES, "return { note: `A moment together: +${t.rustleXp} Bond XP.`, found: false, level };", "return { note: `A moment together: +${t.rustleXp} Bond XP.`, found: false, level: null };", RUSTLEV),
    mut("rustle-gift-not-found", F_RULES, "found: true, level: null };", "found: false, level: null };", RUSTLE),
    mut("pickup-pays-two", F_RULES, "save.inventory[p.material] = (save.inventory[p.material] ?? 0) + 1;", "save.inventory[p.material] = (save.inventory[p.material] ?? 0) + 2;", PICKUP),
    mut("pickup-no-log", F_RULES, "  logEvent(save, nowMs, note.slice(0, -1));\n", "", PICKUP),
    mut("pickup-wrong-article", F_RULES, "const note = `Found ${p.article} ${p.name}.`;", "const note = `Found a ${p.name}.`;", PICKUP),
    # ---- the burst's pay ----
    mut("burst-pays-for-none", F_TRAIN, "if (run.catches === 0) return result;\n  const xpBefore = bondOf(c).xp;", "if (run.catches < 0) return result;\n  const xpBefore = bondOf(c).xp;", BURSTMAT),
    mut("burst-xp-uncapped", F_TRAIN, "Math.min(run.catches, tapTuning.burstXpMax)", "run.catches", BURSTXP),
    mut("burst-material-for-any", F_TRAIN, "if (run.goldens > 0) {", "if (run.catches > 0) {", BURSTMAT),
    mut("burst-material-own-field-ignored", F_TRAIN, "const material = pickups[field].material;", 'const material = pickups.land.material;', BURSTMAT),
    mut("burst-pays-the-away", F_TRAIN, "if (save.phase !== \"alive\" || !c || c.job) return null;\n  const result: BurstResult", "if (save.phase !== \"alive\" || !c) return null;\n  const result: BurstResult", NOBODY),
    mut("burst-no-log", F_TRAIN, "  logEvent(save, nowMs, `Bug burst:", "  void (save, nowMs, `Bug burst:", BURSTLOG),
    mut("burst-words-no-xp-line", F_TRAIN, "if (r.bondXp > 0) lines.push(`+${r.bondXp} Bond XP`);\n    if (r.material)", "if (r.material)", BURSTWORDS),
    mut("burst-words-bug-plural", F_TRAIN, '${r.catches === 1 ? "bug" : "bugs"}.`];', '${"bugs"}.`];', BURSTWORDS),
    # ---- Game: who gets a visit ----
    game("eligible-kid", F_GAME, "return isAdultMode(this.save) && this.save.phase === \"alive\" && !!c && !c.job && c.sleep === null && c.place !== \"home\";", "return this.save.phase === \"alive\" && !!c && !c.job && c.sleep === null && c.place !== \"home\";", G_WHO),
    game("eligible-away", F_GAME, "&& !!c && !c.job && c.sleep === null && c.place !== \"home\";", "&& !!c && c.sleep === null && c.place !== \"home\";", G_LEAVE),
    game("eligible-asleep", F_GAME, "&& !!c && !c.job && c.sleep === null && c.place !== \"home\";", "&& !!c && !c.job && c.place !== \"home\";", G_LEAVE),
    game("eligible-home", F_GAME, "&& !!c && !c.job && c.sleep === null && c.place !== \"home\";", "&& !!c && !c.job && c.sleep === null;", G_WHO),
    # ---- Game: the calm blocks (each term taken out of the line; a call put in) ----
    game("block-screen", F_GAME, BLOCK, without('this.screen !== "room"'), row("the habitat screen")),
    game("block-arena", F_GAME, BLOCK, without("this.arena !== null"), row("a fight")),
    game("block-training", F_GAME, BLOCK, without("this.training !== null"), row("a training session")),
    game("block-decor", F_GAME, BLOCK, without("this.decor !== null"), row("Decorate mode")),
    game("block-moment", F_GAME, BLOCK, without("this.view.moment !== null"), row("a hatch or evolve scene")),
    game("block-hauls", F_GAME, BLOCK, without("this.save.hauls.length > 0"), row("a haul card waiting")),
    game("block-menu", F_GAME, BLOCK, without("this.menuOpen"), row("an open panel")),
    game("block-snack", F_GAME, BLOCK, without("this.view.snack !== null"), row("a meal in progress")),
    game("block-call", F_GAME, BLOCK, BLOCK[:-1] + " || this.save.creature?.call != null;", G_CALL),
    game("blocked-time-counts", F_GAME, "if (!this.tapBlocked()) {\n      this.tapClock += dt;", "if (true) {\n      this.tapClock += dt;", row("an open panel")),
    game("view-shows-while-blocked", F_GAME, "this.tapVisit !== null && this.tapEligible() && !this.tapBlocked() ?", "this.tapVisit !== null && this.tapEligible() ?", row("an open panel")),
    # ---- Game: the two clocks and the waits ----
    game("clock-uncapped", F_GAME, "const dt = Math.max(0, Math.min(dtMs, tapTuning.clockCapMs));", "const dt = Math.max(0, dtMs);", G_CAP),
    game("clock-backwards-counts", F_GAME, "const dt = Math.max(0, Math.min(dtMs, tapTuning.clockCapMs));", "const dt = Math.min(dtMs, tapTuning.clockCapMs);", G_BACK),
    game("wait-counts-uncapped", F_GAME, "this.tapWait -= dt;", "this.tapWait -= dtMs;", G_CAP),
    game("life-counts-uncapped", F_GAME, "this.tapClock += dt;", "this.tapClock += dtMs;", G_CAPLIFE),
    game("dev-speed-moves-clock", F_GAME, "this.stepTappables(elapsed);", "this.stepTappables(elapsed * this.devSpeed);", G_DEV),
    game("spawn-at-wait-strict", F_GAME, "if (this.tapWait <= 0) {", "if (this.tapWait < 0) {", G_FIRST),
    game("fade-at-life-inclusive", F_GAME, "this.tapClock - p.born < tapTuning.lifeMs &&", "this.tapClock - p.born <= tapTuning.lifeMs &&", G_FADE),
    game("full-waits-another-gap", F_GAME, "if (this.tappables.length >= tapTuning.most) this.tapWait = 0;", "if (this.tappables.length >= tapTuning.most) this.tapWait = nextWait(visit.rng);", G_FOUR),
    game("full-check-off-by-one", F_GAME, "if (this.tappables.length >= tapTuning.most) this.tapWait = 0;", "if (this.tappables.length > tapTuning.most) this.tapWait = 0;", G_FOUR),
    game("next-wait-from-the-fade", F_GAME, "this.tapWait = nextWait(visit.rng); // from this start to the next one", "this.tapWait = nextWait(visit.rng) + 1000; // from this start to the next one", G_NEXT),
    game("no-wait-for-the-first", F_GAME, "this.tapWait = nextWait(rng);\n    }", "this.tapWait = 0;\n    }", G_FIRST),
    game("seed-from-global-random", F_GAME, "this.tapRng(Math.floor(this.tapRand() * 2 ** 32))", "this.tapRng(Math.floor(Math.random() * 2 ** 32))", G_NOGLOBAL),
    game("seed-half-range", F_GAME, "this.tapRng(Math.floor(this.tapRand() * 2 ** 32))", "this.tapRng(Math.floor(this.tapRand() * 2 ** 31))", G_FIRST),
    game("visit-reads-initiative-rand", F_GAME, "this.tapRng(Math.floor(this.tapRand() * 2 ** 32))", "this.tapRng(Math.floor(this.rand() * 2 ** 32))", G_NORAND),
    game("bug-for-refused-creature", F_GAME, "const canTrain = trainRefusal(c) === null;", "const canTrain = true;", G_SICK),
    game("sick-bug-kept", F_GAME, "this.tapClock - p.born < tapTuning.lifeMs && (p.kind !== \"bug\" || canTrain));", "this.tapClock - p.born < tapTuning.lifeMs);", G_SICK),
    game("born-at-zero", F_GAME, "born: this.tapClock });", "born: 0 });", G_FADE),
    game("pickup-flag-not-set", F_GAME, 'if (kind === "pickup") visit.pickupMade = true;', "", G_PICK1),
    game("spawn-box-wrong-row", F_GAME, "{ x: v.x, y: v.y - v.size, w: v.size, h: v.size }", "{ x: v.x + 100, y: v.y - v.size, w: v.size, h: v.size }", G_CLEAR),
    game("wake-on-every-step", F_GAME, "if (this.syncTapView() || changed) this.listeners.forEach((listener) => listener());", "this.listeners.forEach((listener) => listener());", G_WAKES),
    game("no-wake-on-change", F_GAME, "if (this.syncTapView() || changed) this.listeners.forEach((listener) => listener());", "this.syncTapView();", G_WAKES),
    # ---- Game: the leaves and the clears ----
    game("leave-another-field", F_GAME, "c.bornAt === v.bornAt && c.place === v.place)) this.endVisit();", "c.bornAt === v.bornAt)) this.endVisit();", G_LEAVE),
    game("leave-another-creature", F_GAME, "c.bornAt === v.bornAt && c.place === v.place)) this.endVisit();", "c.place === v.place)) this.endVisit();", G_LEAVE),
    game("leave-ineligible", F_GAME, "if (v && !(this.tapEligible() && c && c.bornAt === v.bornAt && c.place === v.place)) this.endVisit();", "if (v && !(c && c.bornAt === v.bornAt && c.place === v.place)) this.endVisit();", G_LEAVE),
    game("end-visit-keeps-the-ground", F_GAME, "    this.tapVisit = null;\n    this.tappables = [];\n    this.syncTapView();\n    return had;", "    this.tapVisit = null;\n    this.syncTapView();\n    return had;", G_LEAVE),
    game("end-visit-keeps-the-view", F_GAME, "    this.tapVisit = null;\n    this.tappables = [];\n    this.syncTapView();\n    return had;", "    this.tapVisit = null;\n    this.tappables = [];\n    return had;", G_LEAVE),
    game("changed-does-not-drop", F_GAME, "this.dropVisitIfGone(); // the creature left the field, died, or another hatched: its tappables go with it", "// (dropped)", G_LEAVE),
    game("replace-save-keeps-visit", F_GAME, "this.endVisit(); // (and its own visit)", "// (kept)", G_REPLACE),
    game("step-keeps-visit-when-ineligible", F_GAME, "    this.dropVisitIfGone();\n    if (!this.tapEligible() || !c) {", "    if (!this.tapEligible() || !c) {", G_LEAVE),
    # ---- Game: a tap ----
    game("tap-pays-while-blocked", F_GAME, "if (this.tapBlocked()) {\n      if (this.syncTapView())", "if (false) {\n      if (this.syncTapView())", G_STALE),
    game("tap-stale-keeps-the-list", F_GAME, "if (this.tapBlocked()) {\n      if (this.syncTapView()) this.listeners.forEach((listener) => listener());\n      return null;", "if (this.tapBlocked()) {\n      return null;", G_STALE),
    game("tap-asleep-pays", F_GAME, "if (!this.tapEligible() || c.bornAt !== visit.bornAt || c.place !== visit.place) {", "if (c.bornAt !== visit.bornAt || c.place !== visit.place) {", G_ASLEEP),
    game("tap-keeps-the-tappable", F_GAME, "this.tappables = this.tappables.filter((q) => q !== p); // (before it pays, so a second tap finds nothing)", "", G_SPARKLE),
    game("tap-bug-refused-still-starts", F_GAME, 'if (p.kind === "bug" && trainRefusal(c) !== null) {', 'if (false) {', G_STALEBUG),
    game("tap-sparkle-pays-nothing", F_GAME, "this.say(this.act((save, now) => paySparkle(save, visit.rng, now)));", "this.say(paySparkle(this.save, visit.rng, this.now()));", G_PASSIVE),
    game("tap-sparkle-pose", F_GAME, 'this.reactTo(p, "hop", "sparkle");', 'this.reactTo(p, "happy", "sparkle");', G_SPARKLE),
    game("tap-rustle-pose", F_GAME, 'this.reactTo(p, "startle", r.found ? "sparkle" : "heart");', 'this.reactTo(p, "hop", r.found ? "sparkle" : "heart");', G_RUSTLE),
    game("tap-rustle-effect-swapped", F_GAME, 'r.found ? "sparkle" : "heart");', 'r.found ? "heart" : "sparkle");', G_RUSTLE),
    game("tap-rustle-level-dropped", F_GAME, "levelUp = r.level;", "levelUp = null;", G_RUSTLE),
    game("tap-pickup-wrong-field", F_GAME, "payPickup(save, visit.place, now)", 'payPickup(save, "land", now)', G_PICKUPFIELD),
    game("tap-pickup-pose", F_GAME, 'this.reactTo(p, "happy", "sparkle");', 'this.reactTo(p, "hop", "sparkle");', G_PICKUPTAP),
    game("tap-bug-no-burst", F_GAME, "      this.startBurst();\n    }\n    return { kind: p.kind, levelUp };", "    }\n    return { kind: p.kind, levelUp };", G_BURSTOPEN),
    game("tap-bug-no-reaction", F_GAME, 'this.reactTo(p, "startle", null);\n      this.startBurst();', "this.startBurst();", G_BURSTOPEN),
    game("react-faces-away", F_GAME, "v.facing = cx >= v.x + v.size / 2 ? 1 : -1;", "v.facing = cx >= v.x + v.size / 2 ? -1 : 1;", G_FACE),
    game("react-faces-before-the-pose", F_GAME, "    triggerPose(v, pose);\n    v.facing = cx >= v.x + v.size / 2 ? 1 : -1;", "    v.facing = cx >= v.x + v.size / 2 ? 1 : -1;\n    triggerPose(v, pose);", G_FACE),
    game("react-one-sparkle", F_GAME, '      addEffect(v, "sparkle", cx - 4, cy - 3);\n', "", G_SPARKLE),
    game("tap-returns-wrong-id-pays", F_GAME, "const p = this.tappables.find((q) => q.id === id);", "const p = this.tappables.find((q) => q.id === id) ?? this.tappables[0];", G_WRONGID),
    # ---- Game: the burst ----
    game("burst-not-playing", F_GAME, 'phase: "playing", run: newBugCatch', 'phase: "ready", run: newBugCatch', G_BURSTOPEN),
    game("burst-session-length", F_GAME, "newBugCatch(Math.floor(Math.random() * 2 ** 32), stage, tapTuning.burstMs)", "newBugCatch(Math.floor(Math.random() * 2 ** 32), stage)", G_BURSTOPEN),
    game("burst-not-for-the-field", F_GAME, 'burst: c.place === "home" ? undefined : c.place };', "burst: undefined };", G_BURSTOPEN),
    game("burst-no-sync", F_GAME, "    this.syncTapView(); // (a session holds the visit: nothing is shown under it)\n", "", G_BURSTOPEN),
    game("burst-open-allowed", F_GAME, BURST_TAIL, BURST_TAIL.split("\n", 1)[1], G_BURSTREFUSE),
    game("burst-elsewhere-allowed", F_GAME, BURST_TAIL, BURST_TAIL.replace('    if (this.arena || this.view.moment !== null || this.decor) return "elsewhere";\n', "", 1), G_BURSTREFUSE),
    game("burst-sick-allowed", F_GAME, "const code = trainRefusal(c);\n    if (code !== null) return code;\n    const stage = trainStageOf(c);\n    this.training = { bornAt: c.bornAt, stage, game: \"bug\", phase: \"playing\"", "const stage = trainStageOf(c);\n    this.training = { bornAt: c.bornAt, stage, game: \"bug\", phase: \"playing\"", G_BURSTREFUSE),
    game("burst-kid-allowed", F_GAME, 'if (!isAdultMode(this.save)) return "adult-only";\n    const c = this.save.creature;\n    if (this.save.phase !== "alive" || !c) return "no-creature";\n    if (this.training) return "open";', 'const c = this.save.creature;\n    if (this.save.phase !== "alive" || !c) return "no-creature";\n    if (this.training) return "open";', G_BURSTREFUSE),
    game("burst-paid-as-session", F_GAME, "      if (t.burst) return payBurst(save, save.creature, run as BugCatchState, t.burst, now);\n", "", G_BURSTPAY),
    game("session-paid-as-burst", F_GAME, "return t.game === \"rhythm\" ? payRhythm(save, save.creature, run as RhythmState, now) : payTraining(save, save.creature, run as BugCatchState, now);", "return payBurst(save, save.creature, run as BugCatchState, t.burst ?? \"land\", now);", G_SESSION),
    game("burst-quit-pays", F_GAME, "if (!t || t.phase !== \"playing\" || !t.run || !t.run.over || t.result !== null) return;", "if (!t || !t.run || t.result !== null) return;", G_BURSTEARLY),
    # ---- Game: the passive device ----
    game("spawn-is-a-player-change", F_GAME, "      this.tappables = this.tappables.filter((p) => this.tapClock - p.born < tapTuning.lifeMs", "      this.playerChanged = true;\n      this.tappables = this.tappables.filter((p) => this.tapClock - p.born < tapTuning.lifeMs", G_PASSIVE),
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
        return "CAUGHT-BY-OTHER", ("a test failed, so this is not equivalent" if EQUIV_MODE else "named test did not fail"), fails
    return "SURVIVED", "", fails


def occurrences(m):
    return read(os.path.join(REAL, m["file"])).count(m["old"])


def titles_of(test_file):
    """The titles of the `it(...)` tests in a test file: the double-quoted ones as written, and the template ones (`it(`...${name}...`)`) once for each row name of the blocker tables."""
    text = read(os.path.join(REAL, test_file))
    titles = re.findall(r'\bit\(\s*"((?:[^"\\]|\\.)*)"', text)
    for template in re.findall(r"\bit\(\s*`((?:[^`\\]|\\.)*)`", text):
        # (each template belongs to one table: expanding it with the other table's names would make titles that no test has)
        for name in FIXED_ROWS if template.startswith("makes none while") else ROWS:
            titles.append(template.replace("${name}", name))
    return titles


def do_list():
    bad = 0
    known = {f: titles_of(f) for f in (T_RULES, T_GAME)}
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
        rc, data = run_vitest("baseline", [T_RULES, T_GAME])
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
            rc, data = run_vitest(m["id"], [T_RULES, T_GAME] if EQUIV_MODE else [m.get("expect_file", TEST_FILE)])  # (an equivalent change must leave every test passing, in either file)
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
