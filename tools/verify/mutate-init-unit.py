#!/usr/bin/env python3
# Mutation runner for the rules of creature initiatives (Broodkeep, adult slice A3.3, docs/adult-a3-plan.md section 14): the pure rules (game/initiatives.ts, data/initiatives.ts), their life in
# `Game` (ui/game.ts: the gate, the countdown, the answers, the feed, the clears), the bubble's place (art/scene.ts bubbleBox) and the Bond card line (game/hud.ts). The screen side (the Stage's
# hit test and attributes, the draw, `App`'s menuOpen effect, `ActionBar`) is the UI runner's: mutate-init-ui.py.
#
# It works on a COPY of the repo (init-unit-copy/), never on the real tree. Each mutant is one exact text replace whose `old` must occur exactly once in its file. Only the test file named in
# `expect_file` runs per mutant: a mutant counts only when ITS named test fails (a substring of its full name, in `expect_file`), so the rest of the suite cannot change the verdict.
#
#   python3 mutate-init-unit.py --list   checks each `old` occurs once in the real files (the EQUIVALENT ones too) and each `expect` is a real test title, prints the table, runs no tests
#   python3 mutate-init-unit.py          makes a fresh copy, runs the baseline (the three test files), then every mutant, then checks the copy
#   python3 mutate-init-unit.py --only id1,id2   the same, for these mutants only
#   python3 mutate-init-unit.py --equivalents    runs the EQUIVALENT list (the mutants argued to change nothing) instead: exit 0 only when every one of them leaves every test passing
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
COPY = os.path.join(VERIFY_OUT, "init-unit-copy")
ORIG = os.path.join(VERIFY_OUT, "init-unit-orig")
OUT = os.path.join(VERIFY_OUT, "init-unit-out")
T_TRAIN = "tests/initiatives.test.ts"  # (the rules of one initiative; the name is the framework's)
T_GAME = "tests/initiative-game.test.ts"
T_BOND = "tests/bond.test.ts"
VITEST_ARGS = ["--cache=false", "--fsModuleCache=false", "--reporter=json"]
TEST_FILE = T_TRAIN
TIMEOUT_S = 600
EQUIV_MODE = False

F_RULES = "src/game/initiatives.ts"
F_DATA = "src/data/initiatives.ts"
F_GAME = "src/ui/game.ts"
F_SCENE = "src/art/scene.ts"
F_HUD = "src/game/hud.ts"

# The row names of the blocker tables in tests/initiative-game.test.ts (the template titles are expanded with them).
FIXED_ROWS = ["Kid Mode", "no creature (an egg)", "a dead creature", "asleep"]
ROWS = ["away on a job", "a call", "the habitat screen", "the arena screen", "a fight", "a training session", "Decorate mode", "a hatch or evolve scene", "a haul card waiting", "an open panel", "a meal in progress"]
ROW_NAMES = FIXED_ROWS + ROWS


def mut(id, file, old, new, expect, test=T_TRAIN):
    return dict(id=id, file=file, old=old, new=new, expect=expect, expect_file=test)


# Test titles (substrings of the full test names)
DELAY = "is 60,000 ms at rand 0 and 90,000 ms at the top"
STEPS = "gives every kind a step of 0, 1 or 2 that never changes for a form"
DIFFER = "makes the forms differ"
BASEPLUS = "is the base plus the step, and play rises a quarter for each Bond level above the first, the others not"
HEAVIEST = "names the two heaviest kinds, heaviest first, and the line says them in words"
TIE = "breaks a tie in the order play, craving, gift"
LEANS = "leans to play more as the Bond level rises, and does not depend on what is possible now"
MENU = "asks for a food of its menu without the treat, from a kid's field foods"
ASKS = "asks for nothing when it is full, asleep or away, and a baby can still ask for the pellet"
EDGES = "takes the first kind with weight at rand 0 and the last at the top, and covers the weights as they are"
NOCRAVE = "never takes a craving when nothing can be asked for, whatever rand is, and takes the next kind at the edges"
MADE = "is made for this creature at this time, and a craving is a food it could ask for, never the treat"
GIFTDRAW = "makes a gift of 2 coins when the second draw is under a third and a material otherwise, every material reachable"
PLAYMADE = "makes a play with nothing else on it"
FADE = "fades a craving or a gift 30,000 ms after it was made, to the millisecond"
PLAYFADE = "fades a play nobody has begun at 30,000 ms, and a play that has begun 15,000 ms after its first toss"
SIXTOSS = "counts six tosses and takes no seventh, the first one starting the 15 seconds"
NOTOSS = "takes no toss when it is a craving or a gift or the play is already over by time"
PAYBOND = "pays Bond XP and logs only a level-up, returning the level"
PAYGIFT = "pays a gift exactly: 2 coins, or 1 of the material, with its note and one log line"
WORDS = "says play, cravings and gifts"
MOOT = "is a craving whose food would be refused now (full, asleep, away) and never a play or a gift"
# the game
FIRST = "makes the first after exactly 60 seconds of clear time (59 none), a play at rand 0, with the ball in the view"
LONGEST = "waits 90 seconds when the draw is at the top of the range (89 none)"
WAKES = "wakes the screens when one is made and when it fades, and not at any other step"
FADES = "fades 30 seconds after it was made (29 still there, 30 gone), and the next comes 60 seconds after the start of this one"
CAP = "counts a tick of 100,000 ms as 2,000 (the direct step too)"
BACK = "counts a step backwards (the system clock set back) as nothing"
ONE = "makes only one at a time, even when the countdown has run out under the one that shows"
CADENCE = "makes 3 in 300 seconds at the longest wait, 4 at 72 s and 5 at the shortest"
PICTURES = "draws a craving, a coin gift and a material gift with their own picture in the bubble"
FIELD = "is not stopped by a creature out in a field"
BLOCKWAKE = "wakes the screens when a blocker drops an active initiative, once"
UNSEEN = "holds the countdown while the creature is out of view, keeps an active one, and lets it fade on time"
HIDDEN = "counts only 2 seconds for a tab that was hidden for 10 minutes"
MOOTDROP = "drops a craving at the next step when its food is no longer accepted, and keeps one that still is"
COINGIFT = "takes a coin gift once: 2 coins, one note, one log line, one save; a second tap finds nothing"
MATGIFT = "takes a material gift once: 1 of that material, the note names it"
SIXTAPS = "pays 2 Bond XP a toss, six tosses in all (12), and the sixth ends the play; a seventh pays nothing"
FIFTEEN = "ends a play 15 seconds after the first toss (14 s: a toss still pays; 15 s: gone), and pays the tosses made"
TOSSLEVEL = "reports the Bond level a toss reaches, once, and logs it as a pet does"
NOANSWER = "does nothing for a craving, for no initiative, in Kid Mode, for another creature's offer, or while blocked"
HALFVIEW = "still answers while the creature counts as out of view"
CRAVEPAY = "pays 8 Bond XP once for a meal of the food asked for, and ends the craving"
CRAVELEVEL = "reports the level a craving reaches"
BLOCKEDFEED = "pays nothing for a meal of the food asked for while the game is blocked"
OTHERFOOD = "pays nothing for another food and leaves the craving"
REFUSEDFEED = "pays nothing for a refused meal (full), leaves the craving there, and the next step drops it as moot"
CLOCKCRAVE = "answers a craving made by the clock"
KIDFEED = "is the old feeding in Kid Mode: the same result and the same save as `act(feed)` on a copy of the game"
IGNORE = "leaves the save and every call the same as a control run with the creature out of view, over 20 minutes"
SCREENCLEAR = "is ended at once by changing the screen, starting Decorate mode or a training session"
RETIRECLEAR = "is ended by retiring, by Adult Mode going off, and by another creature hatching"
NOTEVERY = "does not drop on every change: a pet and a meal go through `changed` and a gift stays"
DEATHCLEAR = "is ended at once, with no tick, by the creature dying or another hatching"
REPLACE = "zeroes the clock and draws a new wait when a different game is put in (replaceSave), and only then"
DEVSPEED = "is not changed by a dev speed: the wait counts real time, not game time"
BOXENDS = "sits over the creature's head, 12 by 15, with the call's clamp at the left and right ends"
BOXPOSE = "follows the creature's pose: the box is the resting box plus the pose's own offset"
BOXLITERAL = "is 8 pixels higher at the top of a startle and 6 at the top of a hop (literals)"
BONDCARD = "lists where it stands, the next unlock that exists, and what each way of touching does"


def row(name, tail="makes none"):
    return "%s: %s" % (name, tail)


# Not mutated (each argued from the code; `--equivalents` applies each one and exits 0 only when every test still passes, which is the proof that the argument holds):
#  - dropping `w > 0 &&` in pickKind: `left` starts at `rand() * total` and each step subtracts a weight that `left` was not under, so `left` is never below 0 where a zero weight is looked at, and
#    `left < 0` is false: the strict comparison already skips a zero weight (IEEE subtraction of x >= y is never negative).
#  - dropping `|| a.i - b.i` in preferenceOf: `Array.prototype.sort` is stable, and the kinds start in the order play, craving, gift, so equal weights keep that order all the same.
#  - dropping `i.food === null ||` in isMoot: `feedRefusal(c, null)` finds null off the menu and answers "off-menu", which is not null, so a craving with no food is moot all the same.
#  - dropping `i.kind === "craving" &&` in Game.feed: only a craving has a food; a play or a gift has food null, which never equals a food id, so `answers` is false for both all the same.
#  - dropping `this.initiativeClock = 0;` in replaceSave: the clock is only ever used as a difference from times taken from it (`at`, `playFrom`), and the replace clears the initiative, so a clock that carries on gives the same answers.
EQUIVALENT = [
    mut("pick-zero-weight-guard", F_RULES, "if (w > 0 && left < w) return kind;", "if (left < w) return kind;", "(none)"),
    mut("pref-tie-break-dropped", F_RULES, "order.sort((a, b) => b.w - a.w || a.i - b.i);", "order.sort((a, b) => b.w - a.w);", "(none)"),
    mut("moot-null-food", F_RULES, 'i.kind === "craving" && (i.food === null || feedRefusal(c, i.food) !== null);', 'i.kind === "craving" && feedRefusal(c, i.food as FoodId) !== null;', "(none)"),
    mut("feed-kind-guard", F_GAME, 'const answers = i !== null && i.kind === "craving" && i.food === food && !this.initiativeBlocked();', "const answers = i !== null && i.food === food && !this.initiativeBlocked();", "(none)"),
    mut("replace-clock-kept", F_GAME, "    this.initiativeClock = 0;\n    this.initiativeWait = null; // (a new game draws its own wait)", "    this.initiativeWait = null; // (a new game draws its own wait)", "(none)"),
]

MUTANTS = [
    # the wait, from data and rules
    mut("delay-top-unreachable", F_RULES, "Math.floor(rand() * (t.delayMs[1] - t.delayMs[0] + 1))", "Math.floor(rand() * (t.delayMs[1] - t.delayMs[0]))", DELAY),
    mut("delay-range-longer", F_DATA, "delayMs: [60_000, 90_000] as [number, number]", "delayMs: [60_000, 91_000] as [number, number]", DELAY),
    mut("delay-range-shorter", F_DATA, "delayMs: [60_000, 90_000] as [number, number]", "delayMs: [59_000, 90_000] as [number, number]", DELAY),
    # the weights
    mut("step-modulus", F_RULES, "return h % t.stepSteps;", "return h % 2;", STEPS),
    mut("step-steps-more", F_DATA, "stepSteps: 3,", "stepSteps: 4,", STEPS),
    mut("weight-step-dropped", F_RULES, "t.base[kind] + stepOf(formId, kind) + (kind", "t.base[kind] + (kind", BASEPLUS),
    mut("weight-bond-for-all", F_RULES, '(kind === "play" ? t.playPerBond * (level - 1) : 0)', "(t.playPerBond * (level - 1))", BASEPLUS),
    mut("weight-bond-none", F_RULES, '(kind === "play" ? t.playPerBond * (level - 1) : 0)', "0", BASEPLUS),
    mut("weight-base-play", F_DATA, "base: { play: 3, craving: 2, gift: 2 }", "base: { play: 4, craving: 2, gift: 2 }", BASEPLUS),
    mut("weight-base-craving", F_DATA, "base: { play: 3, craving: 2, gift: 2 }", "base: { play: 3, craving: 3, gift: 2 }", BASEPLUS),
    mut("weight-base-gift", F_DATA, "base: { play: 3, craving: 2, gift: 2 }", "base: { play: 3, craving: 2, gift: 3 }", BASEPLUS),
    mut("weight-per-bond", F_DATA, "playPerBond: 0.25,", "playPerBond: 0.5,", BASEPLUS),
    mut("kinds-reordered", F_DATA, '["play", "craving", "gift"]', '["gift", "craving", "play"]', TIE),
    mut("pref-tie-reversed", F_RULES, "b.w - a.w || a.i - b.i", "b.w - a.w || b.i - a.i", TIE),
    mut("pref-names-one", F_RULES, "return order.slice(0, 2).map((o) => o.kind);", "return order.slice(0, 1).map((o) => o.kind);", HEAVIEST),
    mut("pref-names-three", F_RULES, "return order.slice(0, 2).map((o) => o.kind);", "return order.slice(0, 3).map((o) => o.kind);", HEAVIEST),
    mut("pref-uses-possible", F_RULES, "const order = initiativeKinds.map((kind, i) => ({ kind, i, w: weightOf(c.formId, level, kind) }));", "const order = initiativeKinds.map((kind, i) => ({ kind, i, w: possible(c)[kind] ? weightOf(c.formId, level, kind) : 0 }));", LEANS),
    mut("pref-word-craving", F_RULES, 'craving: "cravings"', 'craving: "craving"', WORDS),
    # what can be asked for
    mut("craving-treat-allowed", F_RULES, 'menuOf(c).filter((food) => food !== "treat" && feedRefusal(c, food) === null)', "menuOf(c).filter((food) => feedRefusal(c, food) === null)", MENU),
    mut("craving-full-allowed", F_RULES, 'menuOf(c).filter((food) => food !== "treat" && feedRefusal(c, food) === null)', 'menuOf(c).filter((food) => food !== "treat")', ASKS),
    mut("possible-craving-always", F_RULES, "craving: cravingFoods(c).length > 0,", "craving: true,", NOCRAVE),
    # the draw
    mut("pick-total-short", F_RULES, "let left = rand() * total;", "let left = rand() * (total - 1);", EDGES),
    mut("pick-not-strict", F_RULES, "if (w > 0 && left < w) return kind;", "if (w > 0 && left <= w) return kind;", NOCRAVE),
    mut("pick-zero-weight-taken", F_RULES, "if (w > 0 && left < w) return kind;", "if (left <= w) return kind;", NOCRAVE),
    mut("food-first-always", F_RULES, "food = foods[Math.floor(rand() * foods.length)] as FoodId;", "food = foods[0] as FoodId;", MADE),
    mut("gift-coin-inverted", F_RULES, "rand() < t.giftCoinChance ?", "rand() > t.giftCoinChance ?", GIFTDRAW),
    mut("gift-chance-half", F_DATA, "giftCoinChance: 1 / 3,", "giftCoinChance: 1 / 2,", GIFTDRAW),
    mut("gift-coins-three", F_DATA, "giftCoins: 2,", "giftCoins: 3,", GIFTDRAW),
    mut("gift-material-last-unreachable", F_RULES, "Math.floor(rand() * materialIds.length)", "Math.floor(rand() * (materialIds.length - 1))", GIFTDRAW),
    mut("play-made-with-food", F_RULES, "return { kind, bornAt: c.bornAt, at: clock, food, gift, tosses: 0, playFrom: null };", "return { kind, bornAt: c.bornAt, at: clock, food: food ?? \"pellet\", gift, tosses: 0, playFrom: null };", PLAYMADE),
    mut("made-for-another-creature", F_RULES, "return { kind, bornAt: c.bornAt,", "return { kind, bornAt: c.bornAt + 1,", MADE),
    # time
    mut("fade-later", F_DATA, "fadeMs: 30_000,", "fadeMs: 31_000,", FADE),
    mut("fade-non-strict", F_RULES, "return clock - i.at >= t.fadeMs;", "return clock - i.at > t.fadeMs;", FADE),
    mut("play-ms-longer", F_DATA, "playMs: 15_000,", "playMs: 16_000,", PLAYFADE),
    mut("play-end-non-strict", F_RULES, "clock - i.playFrom >= t.playMs", "clock - i.playFrom > t.playMs", PLAYFADE),
    mut("play-tosses-seven", F_DATA, "tosses: 6,", "tosses: 7,", SIXTOSS),
    mut("play-tosses-non-strict", F_RULES, "i.tosses >= t.tosses ||", "i.tosses > t.tosses ||", SIXTOSS),
    mut("play-unbegun-uses-first-toss", F_RULES, 'if (i.kind === "play" && i.playFrom !== null) return', 'if (i.kind === "play") return', PLAYFADE),
    mut("toss-over-allowed", F_RULES, 'if (i.kind !== "play" || isOver(i, clock)) return false;', 'if (i.kind !== "play") return false;', NOTOSS),
    mut("toss-any-kind", F_RULES, 'if (i.kind !== "play" || isOver(i, clock)) return false;', "if (isOver(i, clock)) return false;", NOTOSS),
    mut("toss-restarts-play", F_RULES, "if (i.playFrom === null) i.playFrom = clock;", "i.playFrom = clock;", SIXTOSS),
    # pay
    mut("bond-always-logs", F_RULES, "if (level !== null) logEvent(save, nowMs, `Bond level ${level}`);", "logEvent(save, nowMs, `Bond level ${level}`);", PAYBOND),
    mut("toss-xp-three", F_DATA, "tossXp: 2,", "tossXp: 3,", SIXTAPS, T_GAME),
    mut("craving-xp-nine", F_DATA, "cravingXp: 8,", "cravingXp: 9,", CRAVEPAY, T_GAME),
    mut("gift-coins-paid-one", F_RULES, "save.coins += gift.amount;", "save.coins += 1;", PAYGIFT),
    mut("gift-material-paid-two", F_RULES, "(save.inventory[gift.id] ?? 0) + 1;", "(save.inventory[gift.id] ?? 0) + 2;", PAYGIFT),
    mut("gift-log-keeps-stop", F_RULES, "logEvent(save, nowMs, note.slice(0, -1));", "logEvent(save, nowMs, note);", PAYGIFT),
    mut("gift-note-text", F_RULES, "`Found some ${materials[gift.id].name.toLowerCase()}.`", "`Found some ${materials[gift.id].name}.`", PAYGIFT),
    mut("moot-inverted", F_RULES, "feedRefusal(c, i.food) !== null);", "feedRefusal(c, i.food) === null);", MOOT),
    mut("moot-any-kind", F_RULES, 'i.kind === "craving" && (i.food === null', "(i.food === null", MOOT),
    # the clock and the countdown, in Game
    mut("step-cap-dropped", F_GAME, "Math.max(0, Math.min(dtMs, initiativeTuning.clockCapMs))", "Math.max(0, dtMs)", CAP, T_GAME),
    mut("step-cap-longer", F_DATA, "clockCapMs: 2000,", "clockCapMs: 3000,", CAP, T_GAME),
    mut("step-negative-allowed", F_GAME, "Math.max(0, Math.min(dtMs, initiativeTuning.clockCapMs))", "Math.min(dtMs, initiativeTuning.clockCapMs)", BACK, T_GAME),
    mut("tick-steps-with-dev-speed", F_GAME, "this.stepInitiative(elapsed);", "this.stepInitiative(elapsed * this.devSpeed);", DEVSPEED, T_GAME),
    mut("tick-never-steps", F_GAME, "this.stepInitiative(elapsed);", "", FIRST, T_GAME),
    mut("next-wait-drawn-late", F_GAME, "this.initiativeWait = nextDelay(this.rand); // from this start to the next one", "this.initiativeWait = null;", FADES, T_GAME),
    mut("wait-counts-while-unseen", F_GAME, "if (!this.view.inView) return; // out of the camera's view: the countdown holds (a showing initiative goes on fading)", "", UNSEEN, T_GAME),
    mut("fade-not-checked", F_GAME, "i.bornAt !== c.bornAt || isOver(i, this.initiativeClock) || isMoot(i, c)", "i.bornAt !== c.bornAt || isMoot(i, c)", FADES, T_GAME),
    mut("other-creature-not-checked", F_GAME, "i.bornAt !== c.bornAt || isOver(i, this.initiativeClock) || isMoot(i, c)", "isOver(i, this.initiativeClock) || isMoot(i, c)", RETIRECLEAR, T_GAME),
    mut("moot-not-checked", F_GAME, "i.bornAt !== c.bornAt || isOver(i, this.initiativeClock) || isMoot(i, c)", "i.bornAt !== c.bornAt || isOver(i, this.initiativeClock)", MOOTDROP, T_GAME),
    mut("second-while-showing", F_GAME, "if (this.initiativeWait > 0 || this.initiative) return;", "if (this.initiativeWait > 0) return;", ONE, T_GAME),
    mut("wait-wakes-always", F_GAME, "if (this.clearInitiative()) this.listeners.forEach((listener) => listener());", "this.clearInitiative();\n    this.listeners.forEach((listener) => listener());", BLOCKWAKE, T_GAME),
    mut("made-not-shown", F_GAME, "this.view.invite = this.inviteOf(this.initiative);", "", FIRST, T_GAME),
    mut("made-not-woken", F_GAME, "this.initiativeWait = nextDelay(this.rand); // from this start to the next one\n    this.listeners.forEach((listener) => listener());", "this.initiativeWait = nextDelay(this.rand); // from this start to the next one", WAKES, T_GAME),
    mut("invite-play-icon", F_GAME, 'if (i.kind === "play") return "ball";', 'if (i.kind === "play") return "coin";', FIRST, T_GAME),
    mut("invite-craving-icon", F_GAME, 'if (i.kind === "craving") return i.food as IconName;', 'if (i.kind === "craving") return "pellet";', PICTURES, T_GAME),
    mut("invite-coin-icon", F_GAME, 'i.gift?.kind === "coins" ? "coin" : (i.gift as { id: IconName }).id', 'i.gift?.kind === "coins" ? "ball" : (i.gift as { id: IconName }).id', PICTURES, T_GAME),
    mut("invite-material-icon", F_GAME, 'i.gift?.kind === "coins" ? "coin" : (i.gift as { id: IconName }).id', 'i.gift?.kind === "coins" ? "coin" : "herb"', PICTURES, T_GAME),
    # the gate, one row at a time
    mut("gate-adult-dropped", F_GAME, "if (!isAdultMode(this.save) || this.save.phase !== \"alive\" || !c) return true;", "if (this.save.phase !== \"alive\" || !c) return true;", row("Kid Mode", "makes none"), T_GAME),
    mut("gate-alive-dropped", F_GAME, "if (!isAdultMode(this.save) || this.save.phase !== \"alive\" || !c) return true;", "if (!isAdultMode(this.save) || !c) return true;", row("a dead creature", "makes none"), T_GAME),
    mut("gate-creature-dropped", F_GAME, "if (!isAdultMode(this.save) || this.save.phase !== \"alive\" || !c) return true;", "if (!isAdultMode(this.save) || this.save.phase !== \"alive\") return true;", row("no creature (an egg)", "makes none"), T_GAME),
    mut("gate-job-dropped", F_GAME, "if (c.job || c.sleep || c.call !== null) return true;", "if (c.sleep || c.call !== null) return true;", row("away on a job", "makes none for 120 seconds"), T_GAME),
    mut("gate-sleep-dropped", F_GAME, "if (c.job || c.sleep || c.call !== null) return true;", "if (c.job || c.call !== null) return true;", row("asleep", "makes none"), T_GAME),
    mut("gate-call-dropped", F_GAME, "if (c.job || c.sleep || c.call !== null) return true;", "if (c.job || c.sleep) return true;", row("a call", "makes none for 120 seconds"), T_GAME),
    mut("gate-screen-dropped", F_GAME, 'if (this.screen !== "room" || this.arena', "if (this.arena", row("the habitat screen", "makes none for 120 seconds"), T_GAME),
    mut("gate-arena-screen-only-habitat", F_GAME, 'if (this.screen !== "room" || this.arena', 'if (this.screen === "habitat" || this.arena', row("the arena screen", "makes none for 120 seconds"), T_GAME),
    mut("gate-fight-dropped", F_GAME, 'if (this.screen !== "room" || this.arena || this.training', 'if (this.screen !== "room" || this.training', row("a fight", "makes none for 120 seconds"), T_GAME),
    mut("gate-training-dropped", F_GAME, "this.arena || this.training || this.decor", "this.arena || this.decor", row("a training session", "makes none for 120 seconds"), T_GAME),
    mut("gate-decor-dropped", F_GAME, "this.training || this.decor || this.view.moment !== null) return true;", "this.training || this.view.moment !== null) return true;", row("Decorate mode", "makes none for 120 seconds"), T_GAME),
    mut("gate-moment-dropped", F_GAME, "this.decor || this.view.moment !== null) return true;", "this.decor) return true;", row("a hatch or evolve scene", "makes none for 120 seconds"), T_GAME),
    mut("gate-haul-dropped", F_GAME, "return this.save.hauls.length > 0 || this.menuOpen || this.view.snack !== null;", "return this.menuOpen || this.view.snack !== null;", row("a haul card waiting", "makes none for 120 seconds"), T_GAME),
    mut("gate-panel-dropped", F_GAME, "return this.save.hauls.length > 0 || this.menuOpen || this.view.snack !== null;", "return this.save.hauls.length > 0 || this.view.snack !== null;", row("an open panel", "makes none for 120 seconds"), T_GAME),
    mut("gate-meal-dropped", F_GAME, "return this.save.hauls.length > 0 || this.menuOpen || this.view.snack !== null;", "return this.save.hauls.length > 0 || this.menuOpen;", row("a meal in progress", "makes none for 120 seconds"), T_GAME),
    mut("gate-field-blocks", F_GAME, "if (c.job || c.sleep || c.call !== null) return true;", 'if (c.job || c.sleep || c.call !== null || c.place !== "home") return true;', FIELD, T_GAME),
    mut("gate-unblocked-no-drop", F_GAME, "if (this.initiativeBlocked() || !c) {\n      this.dropInitiative();", "if (this.initiativeBlocked() || !c) {\n      this.initiative = this.initiative;", row("an open panel", "makes none for 120 seconds, holds the countdown"), T_GAME),
    mut("gate-countdown-runs-blocked", F_GAME, "if (this.initiativeBlocked() || !c) {\n      this.dropInitiative(); // (an initiative that is blocked goes at once, with no cost; the countdown holds)\n      return;", "if (this.initiativeBlocked() || !c) {\n      this.dropInitiative(); // (an initiative that is blocked goes at once, with no cost; the countdown holds)\n      if (this.initiativeWait !== null) this.initiativeWait -= dt;\n      return;", row("an open panel", "makes none for 120 seconds, holds the countdown"), T_GAME),
    # the answers
    mut("answer-kind-guard-dropped", F_GAME, 'if (!i || (i.kind !== "play" && i.kind !== "gift")) return null;', "if (!i) return null;", NOANSWER, T_GAME),
    mut("answer-blocked-dropped", F_GAME, "if (this.initiativeBlocked() || i.bornAt !== this.save.creature?.bornAt) {", "if (i.bornAt !== this.save.creature?.bornAt) {", NOANSWER, T_GAME),
    mut("answer-creature-dropped", F_GAME, "if (this.initiativeBlocked() || i.bornAt !== this.save.creature?.bornAt) {", "if (this.initiativeBlocked()) {", NOANSWER, T_GAME),
    mut("answer-tests-unseen", F_GAME, "if (this.initiativeBlocked() || i.bornAt !== this.save.creature?.bornAt) {", "if (this.initiativeBlocked() || !this.view.inView || i.bornAt !== this.save.creature?.bornAt) {", HALFVIEW, T_GAME),
    mut("gift-not-cleared", F_GAME, "      this.clearInitiative(); // (before it pays, so a second tap finds nothing)\n", "", COINGIFT, T_GAME),
    mut("gift-note-not-said", F_GAME, "      this.say(note);\n", "", COINGIFT, T_GAME),
    mut("gift-paid-by-play-amount", F_GAME, "const note = this.act((save, now) => payGift(save, gift, now));", "const note = this.act((save, now) => payGift(save, { kind: \"coins\", amount: 1 }, now));", MATGIFT, T_GAME),
    mut("toss-not-counted", F_GAME, "if (!countToss(i, this.initiativeClock)) {", "if (false) {", SIXTAPS, T_GAME),
    mut("toss-pays-cravingxp", F_GAME, "payBond(save, save.creature!, initiativeTuning.tossXp, now)", "payBond(save, save.creature!, initiativeTuning.cravingXp, now)", SIXTAPS, T_GAME),
    mut("toss-over-not-dropped", F_GAME, "    if (over) this.dropInitiative();\n    return { kind: \"play\", levelUp, over };", "    return { kind: \"play\", levelUp, over };", SIXTAPS, T_GAME),
    mut("toss-level-not-returned", F_GAME, 'return { kind: "play", levelUp, over };', 'return { kind: "play", levelUp: null, over };', TOSSLEVEL, T_GAME),
    # feeding
    mut("feed-any-food", F_GAME, 'i.kind === "craving" && i.food === food && !this.initiativeBlocked();', 'i.kind === "craving" && !this.initiativeBlocked();', OTHERFOOD, T_GAME),
    mut("feed-blocked-pays", F_GAME, 'i.kind === "craving" && i.food === food && !this.initiativeBlocked();', 'i.kind === "craving" && i.food === food;', BLOCKEDFEED, T_GAME),
    mut("feed-refused-pays", F_GAME, 'if (r === "ate" && answers) levelUp', "if (answers) levelUp", REFUSEDFEED, T_GAME),
    mut("feed-not-cleared", F_GAME, 'if (result === "ate" && answers) this.dropInitiative();', "", CRAVEPAY, T_GAME),
    mut("feed-level-not-returned", F_GAME, "return { result, levelUp };", "return { result, levelUp: null };", CRAVELEVEL, T_GAME),
    mut("feed-pays-twice", F_GAME, "if (r === \"ate\" && answers) levelUp = payBond(save, save.creature!, initiativeTuning.cravingXp, now);", "if (r === \"ate\" && answers) { payBond(save, save.creature!, initiativeTuning.cravingXp, now); levelUp = payBond(save, save.creature!, initiativeTuning.cravingXp, now); }", CRAVEPAY, T_GAME),
    mut("feed-not-the-old-act", F_GAME, "      const r = feed(save, food, now, dish);\n", "      const r = feed(save, food, now + 1, dish);\n", KIDFEED, T_GAME),
    # the clears
    mut("changed-clears-always", F_GAME, "if (this.initiative && (this.save.phase !== \"alive\" || !c || c.bornAt !== this.initiative.bornAt || !isAdultMode(this.save))) this.clearInitiative();", "if (this.initiative) this.clearInitiative();", NOTEVERY, T_GAME),
    mut("changed-death-not-cleared", F_GAME, "if (this.initiative && (this.save.phase !== \"alive\" || !c ||", "if (this.initiative && (", DEATHCLEAR, T_GAME),
    mut("changed-hatch-not-cleared", F_GAME, "c.bornAt !== this.initiative.bornAt || !isAdultMode(this.save))) this.clearInitiative();", "!isAdultMode(this.save))) this.clearInitiative();", DEATHCLEAR, T_GAME),
    mut("changed-adult-off-not-cleared", F_GAME, "c.bornAt !== this.initiative.bornAt || !isAdultMode(this.save))) this.clearInitiative();", "c.bornAt !== this.initiative.bornAt)) this.clearInitiative();", RETIRECLEAR, T_GAME),
    mut("screen-not-cleared", F_GAME, "    this.clearInitiative(); // (the listeners are woken below)\n", "", SCREENCLEAR, T_GAME),
    mut("decor-not-cleared", F_GAME, "    reseat(this.view); // (it stands on a tile, and a walk or a meal is called off)\n    this.clearInitiative();\n", "    reseat(this.view); // (it stands on a tile, and a walk or a meal is called off)\n", SCREENCLEAR, T_GAME),
    mut("training-not-cleared", F_GAME, "    this.clearInitiative();\n    this.listeners.forEach((listener) => listener());\n    return \"started\";", "    this.listeners.forEach((listener) => listener());\n    return \"started\";", SCREENCLEAR, T_GAME),
    mut("replace-not-cleared", F_GAME, "    this.clearInitiative();\n    this.initiativeClock = 0;", "    this.initiativeClock = 0;", REPLACE, T_GAME),
    mut("replace-wait-kept", F_GAME, "    this.initiativeWait = null; // (a new game draws its own wait)\n", "", REPLACE, T_GAME),
    # the bubble's place and the Bond card
    mut("box-not-clamped-right", F_SCENE, "Math.max(0, Math.min(x + size - 2, spotsW - BUBBLE.w))", "Math.max(0, x + size - 2)", BOXENDS, T_GAME),
    mut("box-not-clamped-left", F_SCENE, "Math.max(0, Math.min(x + size - 2, spotsW - BUBBLE.w))", "Math.min(x + size - 2, spotsW - BUBBLE.w)", BOXENDS, T_GAME),
    mut("box-top-not-clamped", F_SCENE, "y: Math.max(0, y - 12),", "y: y - 12,", BOXENDS, T_GAME),
    mut("box-height", F_SCENE, "export const BUBBLE = { w: 12, h: 15 };", "export const BUBBLE = { w: 12, h: 14 };", BOXENDS, T_GAME),
    mut("box-width", F_SCENE, "export const BUBBLE = { w: 12, h: 15 };", "export const BUBBLE = { w: 13, h: 15 };", BOXENDS, T_GAME),
    mut("box-pose-dx-dropped", F_SCENE, "const x = Math.round(view.x + off.dx);", "const x = Math.round(view.x);", BOXPOSE, T_GAME),
    mut("box-pose-dy-dropped", F_SCENE, "const y = view.y - size + off.dy;", "const y = view.y - size;", BOXLITERAL, T_GAME),
    mut("box-x-not-rounded", F_SCENE, "const x = Math.round(view.x + off.dx);", "const x = view.x + off.dx;", BOXENDS, T_GAME),
    mut("box-above-head-lower", F_SCENE, "y: Math.max(0, y - 12),", "y: Math.max(0, y - 11),", BOXENDS, T_GAME),
    mut("bond-card-line-dropped", F_HUD, '"Poke: gets attention.", preferenceLine(c));', '"Poke: gets attention.");', BONDCARD, T_BOND),
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
    """The titles of the `it(...)` tests in a test file: the double-quoted ones as written, and the template ones (`it(`...${name}...`)`) once for each row name of the blocker tables."""
    text = read(os.path.join(REAL, test_file))
    titles = re.findall(r'\bit\(\s*"((?:[^"\\]|\\.)*)"', text)
    for template in re.findall(r"\bit\(\s*`((?:[^`\\]|\\.)*)`", text):
        for name in ROW_NAMES:
            titles.append(template.replace("${name}", name))
    return titles


def do_list():
    bad = 0
    known = {f: titles_of(f) for f in (T_TRAIN, T_GAME, T_BOND)}
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
        rc, data = run_vitest("baseline", [T_TRAIN, T_GAME, T_BOND])
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
