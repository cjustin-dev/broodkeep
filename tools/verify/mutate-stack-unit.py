#!/usr/bin/env python3
# Mutation runner for the rules of Stack & Balance (Broodkeep, adult slice A4.2, docs/adult-a4-plan.md section 6, "Mutation targets"): the moving block and the landing (game/stack.ts, data/stack.ts), what a
# run pays (game/training.ts paySession and payStack, data/training.ts trainGames) and the picker and the session's life in `Game` (ui/game.ts). The screen side (the overlay, the touch, the layout) is the
# UI runner's: mutate-stack-ui.py.
#
# It works on a COPY of the repo (stack-unit-copy/), never on the real tree. Each mutant is one exact text replace whose `old` must occur exactly once in its file. Only the test file named in
# `expect_file` runs per mutant (tests/stack.test.ts or tests/stack-game.test.ts): a mutant counts only when ITS named test fails, so the rest of the suite cannot change the verdict.
# A mutant is CAUGHT only when the test named in `expect` (a substring of its full name, in `expect_file`) fails.
#
#   python3 mutate-stack-unit.py --list   checks each `old` occurs once in the real files (the EQUIVALENT ones too), prints the table, runs no tests
#   python3 mutate-stack-unit.py          makes a fresh copy, runs the baseline (both test files), then every mutant, then checks the copy
#   python3 mutate-stack-unit.py --only id1,id2   the same, for these mutants only
#   python3 mutate-stack-unit.py --equivalents    runs the EQUIVALENT list (the mutants argued to change nothing) instead: exit 0 only when every one of them leaves every test passing
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
COPY = os.path.join(VERIFY_OUT, "stack-unit-copy")
ORIG = os.path.join(VERIFY_OUT, "stack-unit-orig")
OUT = os.path.join(VERIFY_OUT, "stack-unit-out")
T_ENGINE = "tests/stack.test.ts"
T_GAME = "tests/stack-game.test.ts"
VITEST_ARGS = ["--cache=false", "--fsModuleCache=false", "--reporter=json"]
TEST_FILE = T_ENGINE
TIMEOUT_S = 600
EQUIV_MODE = False

F_ENGINE = "src/game/stack.ts"
F_DATA = "src/data/stack.ts"
F_TRAIN = "src/game/training.ts"
F_TDATA = "src/data/training.ts"
F_GAME = "src/ui/game.ts"


def mut(id, file, old, new, expect, test=T_ENGINE):
    return dict(id=id, file=file, old=old, new=new, expect=expect, expect_file=test)


# Test titles (substrings of the full test names)
# tests/stack.test.ts
D1 = "has a sensible row for each stage and a base that fits the field"
D2 = "holds the tuning as literals"
D3 = "says the Perfect window in milliseconds from the row"
M1 = "sweeps as a triangle wave: kid literals at whole steps"
M2 = "goes faster at the later stages: one literal each at 1,000 ms"
J1 = "is Perfect up to each stage's window and Good just past it, on both sides"
J2 = "keeps the width and snaps to the block below on a Perfect, and does not trim"
J3 = "puts a wider block on a narrower one (a streak makes the coming block wider)"
J4 = "makes a Good block the overlap, rounded down to even"
J5 = "measures the overlap against the top block's own width"
J6 = "splits Good from Bad at 35 percent of the coming block"
J7 = "splits Good from Bad at minW on its own"
J8 = "holds a needle: w and tw both 20"
J9 = "caps the Perfect window by the narrower of the two blocks"
B1 = "forgives the first: nothing is added"
B2 = "topples on the second, and a drop after the end is refused"
C1 = "counts Perfects in a row, loses them to a Good and to a Bad, and keeps the best"
G1 = "from 240: the 1st Perfect leaves it"
G2 = "at 300: the 1st and 2nd Perfect leave it at 300"
P1 = "pays 20, 25, 30, 35, 40, 45 and 45 for seven Perfects in a row"
S1 = "is 0 before the first block, then a step a step"
S2 = "stops at a topple and at the end: more steps change nothing"
S3 = "scores the blocks plus the whole seconds, floored"
S5 = "stays the height: the blocks on the base"
PA1 = "does nothing while paused: no time, no drop, then goes on"
PA2 = "counts no drop once the run is over"
GAP1 = "ignores a drop 10 ms before the next block comes"
GAP2 = "gives one Perfect for a tapper who drops every 10 ms through a Perfect window"
GAP3 = "starts the gap after a Bad drop too"
F1 = "reaches the same time and the same standing time at 7, 16 and 100 ms frames"
F2 = "cuts a frame at the cap: 99 moves 90"
F3 = "moves nothing for a negative, NaN or infinite frame"
F4 = "ends the run at lengthMs, 75 seconds by default"
F5 = "stops inside a call that has more time than the run has left"
BA1 = "puts Silver and Gold on their lines, one under, on and one over"
BA2 = "keeps the best steady tapper under Silver at every stage"
BA3 = "scores a player who drops once and waits 385, 390 and 390 at best"
BA5 = "reaches Gold in a fair share of the stand-in's runs"
T1 = "judges where the screen shows the block"
T2 = "does not count time fed but not yet a whole step"
W1 = "says what was last done and counts the drops"
W2 = "rounds the trimmed share to a whole percent"
R1 = "draws nothing for a whole run of the engine"
# tests/stack-game.test.ts
PY1 = "pays a Gold run +2 Strength, +2 Discipline and 30 Bond XP"
PY2 = "pays Bronze and Silver +1 Strength in a full session"
PY3 = "keeps Strength's count apart from Speed's and Spirit's"
PY4 = "stops at the stage cap: a kid at 12 Strength"
PY5 = "pays nothing and counts for nothing for a run where no Perfect or Good landed"
PY6 = "pays nobody when there is no creature, it is dead, or it is away"
PY8 = "counts a Good as a landed block"
WD1 = "names the reward of the next session for each tier"
WD2 = "says what each kind of result paid, with the blocks"
WD3 = "says one block, one second, and a fall"
WD4 = "says why no Strength was paid"
WD5 = "says when no block landed"
GM1 = "takes the pick only while the card shows"
GM2 = "begins at the creature's own stage with no random draw"
GM3 = "leaves the save byte-identical and writes nothing through start"
GM4 = "pays a played run as Strength, once, and saves it as a player action"
GM6 = "pays nobody when the creature is replaced before the run is paid"
GM7 = "starts a burst as Bug Catch whatever the pick"

# (`height` of the result line read from `r.catches` instead of `r.stack.height` was argued equivalent here, since in play both are the blocks landed; `--equivalents` showed the words test builds results whose
# catches differ from their height, so it is a normal mutant, paired with WD3.)
# Not mutated (each argued from the code; `--equivalents` applies each one and exits 0 only when every test still passes, which is the proof that the argument holds):
#  - dropping `Math.max(0, ...)` round the overlap: a negative overlap fails both Good tests (`overlap * 100 >= wobblePct * w` and `overlap >= minW`) the same way a zero one does, and the overlap is read
#    nowhere else, so the floor changes no result.
#  - dropping `if (!c) return;` in beginTraining: the session is cleared by a death, a retire and a hatch (tests/training-game.test.ts, "is a death, a retire and a hatch"), so a start card never outlives
#    its creature; the line is there to narrow the type of `c` for `c.formId`, and esbuild, which runs the tests, does not check types.
# id, file, old (exact, must occur once in the file), new, expect (substring of the test's full name), expect_file
EQUIVALENT = [
    mut("overlap-floor-dropped", F_ENGINE, "Math.max(0, Math.min(x + w / 2, top.x + top.w / 2) - left)", "Math.min(x + w / 2, top.x + top.w / 2) - left", "(none)"),
    mut("begin-creature-guard", F_GAME, 'if (!c) return;\n    if (t.game === "rhythm") t.run', 'if (t.game === "rhythm") t.run', "(none)", T_GAME),
]

MUTANTS = [
    # the data
    mut("row-lo-wide", F_DATA, "lo: 150,", "lo: 100,", D1),
    mut("row-hi-wide", F_DATA, "hi: 850,", "hi: 900,", D1),
    mut("start-w-wide", F_DATA, "startW: 300,", "startW: 400,", D1),
    mut("kid-speed-zero", F_DATA, "speed: 260,", "speed: 0,", D1),
    mut("kid-perfect-zero", F_DATA, "perfectU: 29,", "perfectU: 0,", D1),
    mut("adult-window-wide", F_DATA, "perfectU: 40,", "perfectU: 80,", D1),
    mut("young-row-is-kids", F_DATA, "young: { speed: 320, perfectU: 36, silverAt: 1000, goldAt: 1620 }", "young: { speed: 260, perfectU: 29, silverAt: 1000, goldAt: 1620 }", D2),
    mut("adult-row-is-youngs", F_DATA, "adult: { speed: 360, perfectU: 40, silverAt: 800, goldAt: 1660 }", "adult: { speed: 320, perfectU: 36, silverAt: 800, goldAt: 1660 }", D2),
    mut("window-ms-floored", F_ENGINE, "Math.round((k.rows[stage].perfectU * 1000) / k.rows[stage].speed)", "Math.floor((k.rows[stage].perfectU * 1000) / k.rows[stage].speed)", D3),
    mut("wobble-pct-zero", F_DATA, "wobblePct: 35,", "wobblePct: 0,", J6),
    mut("min-w-zero", F_DATA, "minW: 20,", "minW: 0,", J7),
    mut("grow-by-tuned", F_DATA, "growBy: 30,", "growBy: 40,", G1),
    mut("grow-from-tuned", F_DATA, "growFrom: 2,", "growFrom: 3,", G1),
    mut("perfect-points-tuned", F_DATA, "perfectPts: 20,", "perfectPts: 25,", P1),
    mut("good-points-tuned", F_DATA, "goodPts: 10,", "goodPts: 12,", P1),
    mut("combo-bonus-tuned", F_DATA, "comboPts: 5,", "comboPts: 4,", P1),
    mut("combo-max-tuned", F_DATA, "comboMax: 5,", "comboMax: 6,", P1),
    mut("stand-points-tuned", F_DATA, "standPts: 5,", "standPts: 50,", D2),
    mut("kid-silver-line-tuned", F_DATA, "kid: { speed: 260, perfectU: 29, silverAt: 1000, goldAt: 1460 }", "kid: { speed: 260, perfectU: 29, silverAt: 900, goldAt: 1460 }", BA1),
    mut("adult-silver-line-low", F_DATA, "silverAt: 800,", "silverAt: 300,", BA3),
    mut("kid-gold-line-low", F_DATA, "goldAt: 1460 }", "goldAt: 1000 }", BA5),
    mut("gap-tuned-short", F_DATA, "dropGapMs: 400,", "dropGapMs: 200,", GAP2),
    mut("frame-cap-tuned", F_TDATA, "frameCapMs: 100,", "frameCapMs: 110,", F2),
    mut("step-tuned", F_TDATA, "stepMs: 10,", "stepMs: 20,", F2),
    mut("session-length-tuned", F_TDATA, "sessionMs: 75_000,", "sessionMs: 60_000,", F4),
    # the moving block
    mut("sweep-not-rounded", F_ENGINE, "return Math.round(k.lo + range * (phase < 0.5 ? phase * 2 : 2 - phase * 2));", "return k.lo + range * (phase < 0.5 ? phase * 2 : 2 - phase * 2);", M1),
    mut("sweep-period-halved", F_ENGINE, "(2 * range * 1000) / k.rows[s.stage].speed", "(range * 1000) / k.rows[s.stage].speed", M1),
    mut("sweep-not-reflected", F_ENGINE, "(phase < 0.5 ? phase * 2 : 2 - phase * 2)", "(phase * 2)", M1),
    mut("sweep-starts-at-hi", F_ENGINE, "k.lo + range * (phase", "k.hi - range * (phase", M1),
    mut("sweep-clock-ahead", F_ENGINE, "(s.elapsedMs % period) / period", "((s.elapsedMs + 10) % period) / period", M1),
    mut("sweep-kid-speed-for-all", F_ENGINE, "k.rows[s.stage].speed", "k.rows.kid.speed", M2),
    mut("engine-draws-at-random", F_ENGINE, "  const range = k.hi - k.lo;\n  const period", "  Math.random();\n  const range = k.hi - k.lo;\n  const period", R1),
    # the landing: Perfect
    mut("perfect-boundary-strict", F_ENGINE, "Math.abs(x - top.x) <= Math.min(", "Math.abs(x - top.x) < Math.min(", J1),
    mut("perfect-window-kid-for-all", F_ENGINE, "k.rows[s.stage].perfectU", "k.rows.kid.perfectU", J1),
    mut("perfect-cap-dropped", F_ENGINE, "Math.min(k.rows[s.stage].perfectU, Math.floor(Math.min(w, top.w) / 2))", "k.rows[s.stage].perfectU", J8),
    mut("perfect-cap-uses-w-alone", F_ENGINE, "Math.floor(Math.min(w, top.w) / 2)", "Math.floor(w / 2)", J9),
    mut("perfect-cap-uses-top-alone", F_ENGINE, "Math.floor(Math.min(w, top.w) / 2)", "Math.floor(top.w / 2)", J9),
    mut("perfect-trims", F_ENGINE, "s.blocks.push({ x: top.x, w });", "s.blocks.push({ x: top.x, w: top.w });", J3),
    mut("perfect-no-snap", F_ENGINE, "s.blocks.push({ x: top.x, w });", "s.blocks.push({ x, w });", J2),
    mut("perfect-not-counted", F_ENGINE, "s.perfects += 1;", "", J2),
    mut("combo-not-counted", F_ENGINE, "    s.combo += 1;\n", "", C1),
    mut("best-not-kept", F_ENGINE, "s.best = Math.max(s.best, s.combo);", "s.best = s.combo;", C1),
    mut("perfect-points-no-combo", F_ENGINE, "k.comboPts * Math.min(s.combo - 1, k.comboMax)", "k.comboPts * Math.min(s.combo, k.comboMax)", P1),
    mut("perfect-points-uncapped", F_ENGINE, "Math.min(s.combo - 1, k.comboMax)", "(s.combo - 1)", P1),
    mut("growth-from-the-first", F_ENGINE, "if (s.combo >= k.growFrom)", "if (s.combo >= 1)", G1),
    mut("growth-from-the-third", F_ENGINE, "s.combo >= k.growFrom", "s.combo > k.growFrom", G1),
    mut("growth-uncapped", F_ENGINE, "Math.min(k.startW, w + k.growBy)", "w + k.growBy", G2),
    # the landing: Good
    mut("good-boundary-strict", F_ENGINE, "overlap * 100 >= k.wobblePct * w", "overlap * 100 > k.wobblePct * w", J6),
    mut("good-min-w-strict", F_ENGINE, "overlap >= k.minW", "overlap > k.minW", J7),
    mut("good-min-w-dropped", F_ENGINE, "overlap * 100 >= k.wobblePct * w && overlap >= k.minW", "overlap * 100 >= k.wobblePct * w", J7),
    mut("good-percent-of-top", F_ENGINE, "k.wobblePct * w", "k.wobblePct * top.w", J7),
    mut("good-keeps-width", F_ENGINE, "s.blocks.push({ x: left + width / 2, w: width });", "s.blocks.push({ x: left + width / 2, w });", J4),
    mut("good-centre-from-overlap", F_ENGINE, "x: left + width / 2", "x: left + overlap / 2", J5),
    mut("good-width-not-even", F_ENGINE, "const width = overlap - (overlap % 2);", "const width = overlap;", J5),
    mut("good-w-not-updated", F_ENGINE, "    s.w = width;\n", "", J4),
    mut("good-keeps-combo", F_ENGINE, "    s.combo = 0;\n    s.blockPoints += k.goodPts;", "    s.blockPoints += k.goodPts;", C1),
    mut("good-not-counted", F_ENGINE, "s.goods += 1;", "", J4),
    mut("good-points-not-paid", F_ENGINE, "s.blockPoints += k.goodPts;", "", P1),
    mut("overlap-left-min", F_ENGINE, "const left = Math.max(x - w / 2, top.x - top.w / 2);", "const left = Math.min(x - w / 2, top.x - top.w / 2);", J4),
    mut("overlap-right-max", F_ENGINE, "Math.min(x + w / 2, top.x + top.w / 2) - left)", "Math.max(x + w / 2, top.x + top.w / 2) - left)", J4),
    mut("overlap-right-uses-w", F_ENGINE, "top.x + top.w / 2) - left)", "top.x + w / 2) - left)", J5),
    mut("trimmed-share-floored", F_ENGINE, "Math.round((100 * (w - width)) / w)", "Math.floor((100 * (w - width)) / w)", W2),
    mut("trimmed-share-of-top", F_ENGINE, "(100 * (w - width)) / w)", "(100 * (w - width)) / top.w)", W2),
    # the landing: Bad
    mut("first-bad-not-forgiven", F_ENGINE, "if (!s.recovered) {", "if (false) {", B1),
    mut("bad-always-forgiven", F_ENGINE, "if (!s.recovered) {", "if (true) {", B2),
    mut("recovered-not-set", F_ENGINE, '    s.recovered = true;\n    say(s, "wobble");', '    say(s, "wobble");', B1),
    mut("bad-adds-a-block", F_ENGINE, '    s.recovered = true;\n    say(s, "wobble");', '    s.recovered = true;\n    s.blocks.push({ x: top.x, w: top.w });\n    say(s, "wobble");', B1),
    mut("bad-keeps-combo", F_ENGINE, "  s.combo = 0;\n  s.badDrops += 1;", "  s.badDrops += 1;", B1),
    mut("bad-not-counted", F_ENGINE, "s.badDrops += 1;", "", B1),
    mut("topple-not-over", F_ENGINE, "  s.toppled = true;\n  s.over = true;", "  s.toppled = true;", B2),
    mut("topple-not-flagged", F_ENGINE, "  s.toppled = true;\n  s.over = true;", "  s.over = true;", B2),
    mut("topple-says-wobble", F_ENGINE, 'return { judge: "topple" };', 'return { judge: "wobble" };', B2),
    # the clock and the standing time
    mut("frame-cap-dropped", F_ENGINE, "Math.min(Math.max(dtMs, 0), t.frameCapMs)", "Math.max(dtMs, 0)", F2),
    mut("negative-frame-counts", F_ENGINE, "Math.min(Math.max(dtMs, 0), t.frameCapMs)", "Math.min(dtMs, t.frameCapMs)", F3),
    mut("non-finite-frame-counts", F_ENGINE, "Number.isFinite(dtMs) ? Math.min(Math.max(dtMs, 0), t.frameCapMs) : 0", "Math.min(Math.max(dtMs, 0), t.frameCapMs)", F3),
    mut("carry-lost", F_ENGINE, "s.carryMs -= t.stepMs;", "s.carryMs = 0;", F1),
    mut("carry-not-kept", F_ENGINE, "s.carryMs += Number.isFinite(dtMs)", "s.carryMs = Number.isFinite(dtMs)", F2),
    mut("run-ends-late", F_ENGINE, "if (s.elapsedMs >= s.lengthMs) s.over = true;", "if (s.elapsedMs > s.lengthMs) s.over = true;", F4),
    mut("run-steps-past-the-end", F_ENGINE, "while (s.carryMs >= t.stepMs && !s.over) {", "while (s.carryMs >= t.stepMs) {", F5),
    mut("paused-time-passes", F_ENGINE, "if (s.over || s.paused) return false;", "if (s.over) return false;", PA1),
    mut("over-time-passes", F_ENGINE, "if (s.over || s.paused) return false;", "if (s.paused) return false;", S2),
    mut("stand-from-the-start", F_ENGINE, "if (s.blocks.length > 1) s.standMs += t.stepMs;", "s.standMs += t.stepMs;", S1),
    mut("stand-from-two-blocks", F_ENGINE, "s.blocks.length > 1", "s.blocks.length > 2", S1),
    mut("stand-wrong-unit", F_ENGINE, "s.standMs += t.stepMs;", "s.standMs += 1;", S1),
    mut("stand-floor-rounded", F_ENGINE, "Math.floor(s.standMs / 1000) * k.standPts", "Math.round(s.standMs / 1000) * k.standPts", S3),
    mut("height-counts-the-base", F_ENGINE, 'number => s.blocks.length - 1;', 'number => s.blocks.length;', S5),
    # the gap and the drop
    mut("paused-drop-counts", F_ENGINE, "if (s.over || s.paused || s.elapsedMs < s.readyAt) return null;", "if (s.over || s.elapsedMs < s.readyAt) return null;", PA1),
    mut("over-drop-counts", F_ENGINE, "if (s.over || s.paused || s.elapsedMs < s.readyAt) return null;", "if (s.paused || s.elapsedMs < s.readyAt) return null;", PA2),
    mut("gap-dropped", F_ENGINE, "if (s.over || s.paused || s.elapsedMs < s.readyAt) return null;", "if (s.over || s.paused) return null;", GAP1),
    mut("gap-edge-strict", F_ENGINE, "s.elapsedMs < s.readyAt", "s.elapsedMs <= s.readyAt", GAP1),
    mut("gap-never-set", F_ENGINE, "s.readyAt = s.elapsedMs + k.dropGapMs;", "s.readyAt = 0;", GAP1),
    mut("gap-from-zero", F_ENGINE, "s.readyAt = s.elapsedMs + k.dropGapMs;", "s.readyAt = k.dropGapMs;", GAP1),
    mut("gap-not-after-a-bad-drop", F_ENGINE, "s.readyAt = s.elapsedMs + k.dropGapMs;\n  return landAt(s, blockX(s));", 'const drop = landAt(s, blockX(s));\n  if (drop.judge !== "wobble") s.readyAt = s.elapsedMs + k.dropGapMs;\n  return drop;', GAP3),
    mut("drop-judged-a-step-late", F_ENGINE, "return landAt(s, blockX(s));", "return landAt(s, blockX({ elapsedMs: s.elapsedMs + 10, stage: s.stage }));", T1),
    mut("drop-judged-with-the-carry", F_ENGINE, "return landAt(s, blockX(s));", "return landAt(s, blockX({ elapsedMs: s.elapsedMs + s.carryMs, stage: s.stage }));", T2),
    # the band and the words
    mut("gold-line-strict", F_ENGINE, 'score >= row.goldAt ? "gold"', 'score > row.goldAt ? "gold"', BA1),
    mut("silver-line-strict", F_ENGINE, 'score >= row.silverAt ? "silver"', 'score > row.silverAt ? "silver"', BA1),
    mut("said-counter-stuck", F_ENGINE, "n: (s.said?.n ?? 0) + 1", "n: 1", W1),
    mut("said-combo-dropped", F_ENGINE, "combo: s.combo, trimmedPct }", "combo: 0, trimmedPct }", W1),
    mut("said-trimmed-default", F_ENGINE, "trimmedPct = 0): void", "trimmedPct = 1): void", W1),
    mut("words-perfect-dropped", F_ENGINE, "return `Perfect, combo ${said.combo}`;", 'return "Perfect";', W1),
    mut("words-good-dropped", F_ENGINE, "return `Good, trimmed ${said.trimmedPct} percent`;", 'return "Good";', W1),
    mut("words-wobble-short", F_ENGINE, 'return "Wobble, steadied. One more and it falls";', 'return "Wobble";', W1),
    mut("words-fell-changed", F_ENGINE, 'return "It fell";', 'return "Fell";', W1),
    # what a run pays
    mut("stack-trains-speed", F_TRAIN, 'paySession(save, c, "stack", stackBandOf(', 'paySession(save, c, "bug", stackBandOf(', PY1, T_GAME),
    mut("band-from-bug-catch-lines", F_TRAIN, "stackBandOf(score, run.stage)", "bandOf(score, run.stage)", PY2, T_GAME),
    mut("goods-are-no-blocks", F_TRAIN, "stackBandOf(score, run.stage), score, run.perfects + run.goods, nowMs)", "stackBandOf(score, run.stage), score, run.perfects, nowMs)", PY8, T_GAME),
    mut("no-block-run-pays", F_TRAIN, "if (hits === 0) return result;", "", PY5, T_GAME),
    mut("pay-guard-dropped", F_TRAIN, 'if (save.phase !== "alive" || !c || c.job) return null;\n  const score = scoreOf(run);', "if (!c) return null;\n  const score = scoreOf(run);", PY6, T_GAME),
    mut("stack-counted-with-speed", F_TDATA, 'stack: { name: "Stack & Balance", stat: "str", statName: "Strength" }', 'stack: { name: "Stack & Balance", stat: "spd", statName: "Strength" }', PY3, T_GAME),
    mut("stack-says-speed", F_TDATA, 'stack: { name: "Stack & Balance", stat: "str", statName: "Strength" }', 'stack: { name: "Stack & Balance", stat: "str", statName: "Speed" }', PY1, T_GAME),
    mut("stack-named-short", F_TDATA, 'stack: { name: "Stack & Balance",', 'stack: { name: "Stack",', PY1, T_GAME),
    mut("stand-seconds-rounded", F_TRAIN, "standSeconds: Math.floor(run.standMs / 1000)", "standSeconds: Math.round(run.standMs / 1000)", PY1, T_GAME),
    mut("log-line-names-bug-catch", F_TRAIN, "`${name}: ${band}, ${score} points,", "`Bug Catch: ${band}, ${score} points,", PY1, T_GAME),
    mut("start-line-says-speed", F_TRAIN, "const word = trainGames[game].statName;", 'const word = "Speed";', WD1, T_GAME),
    mut("result-line-says-speed", F_TRAIN, "const word = trainGames[r.game].statName;", 'const word = "Speed";', WD2, T_GAME),
    mut("height-from-catches", F_TRAIN, "const height = r.stack?.height ?? r.catches;", "const height = r.catches;", WD3, T_GAME),
    mut("one-block-is-blocks", F_TRAIN, '${height === 1 ? "block" : "blocks"} high', "blocks high", WD3, T_GAME),
    mut("one-second-is-seconds", F_TRAIN, '${r.stack.standSeconds === 1 ? "second" : "seconds"}', "seconds", WD3, T_GAME),
    mut("result-count-line-wrong", F_TRAIN, "bad drops ${r.stack.badDrops}", "bad drops ${r.stack.goods}", WD2, T_GAME),
    mut("no-block-says-bugs", F_TRAIN, 'stack: "No block landed: nothing to pay.",', 'stack: "No bugs caught: nothing to pay.",', WD5, T_GAME),
    mut("fall-says-stood-for", F_TRAIN, "r.stack.toppled ? `The stack stood ${seconds}, then fell.` : `The stack stood for ${seconds}.`", "`The stack stood for ${seconds}.`", WD3, T_GAME),
    # the picker and the session
    mut("pick-any-phase", F_GAME, 'if (!t || t.phase !== "ready" || !trainGameIds.includes(id)) return;', "if (!t || !trainGameIds.includes(id)) return;", GM1, T_GAME),
    mut("pick-any-id", F_GAME, 'if (!t || t.phase !== "ready" || !trainGameIds.includes(id)) return;', 'if (!t || t.phase !== "ready") return;', GM1, T_GAME),
    mut("pick-not-applied", F_GAME, "t.game = id;\n    this.trainPick = id;", "this.trainPick = id;", GM1, T_GAME),
    mut("pick-not-kept", F_GAME, "t.game = id;\n    this.trainPick = id;", "t.game = id;", GM1, T_GAME),
    mut("card-ignores-the-kept-pick", F_GAME, 'game: this.trainPick, phase: "ready"', 'game: "bug", phase: "ready"', GM1, T_GAME),
    mut("go-never-stack", F_GAME, 'else if (t.game === "stack") t.run = newStack(t.stage);', 'else if (false) t.run = newStack(t.stage);', GM2, T_GAME),
    mut("go-always-adult-stack", F_GAME, "newStack(t.stage)", 'newStack("adult")', GM2, T_GAME),
    mut("go-draws-at-random", F_GAME, "t.run = newStack(t.stage);", "t.run = (Math.random(), newStack(t.stage));", GM2, T_GAME),
    mut("finish-never-pays-stack", F_GAME, 'if (t.game === "stack") return payStack(', 'if (false) return payStack(', GM4, T_GAME),
    mut("second-finish-pays", F_GAME, 'if (!t || t.phase !== "playing" || !t.run || !t.run.over || t.result !== null) return;', "if (!t || !t.run || !t.run.over) return;", GM4, T_GAME),
    mut("replaced-creature-is-paid", F_GAME, "|| c.bornAt !== this.training.bornAt)) this.training = null;", ")) this.training = null;", GM6, T_GAME),
    mut("pick-writes-the-save", F_GAME, "t.game = id;\n    this.trainPick = id;", "t.game = id;\n    this.trainPick = id;\n    void writeSave(this.save);", GM3, T_GAME),
    mut("go-writes-the-save", F_GAME, 't.phase = "playing";\n    this.listeners', 't.phase = "playing";\n    void writeSave(this.save);\n    this.listeners', GM3, T_GAME),
    mut("burst-takes-the-pick", F_GAME, 'game: "bug", phase: "playing"', 'game: this.trainPick, phase: "playing"', GM7, T_GAME),
    mut("burst-resets-the-pick", F_GAME, 'game: "bug", phase: "playing"', 'game: (this.trainPick = "bug"), phase: "playing"', GM7, T_GAME),
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
    known = {f: titles_of(f) for f in (T_ENGINE, T_GAME)}
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
        rc, data = run_vitest("baseline", [T_ENGINE, T_GAME])
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
