#!/usr/bin/env python3
# Mutation runner for the rules of Rhythm Grove (Broodkeep, adult slice A4.1, docs/adult-a4-plan.md section 2, "Mutation targets"): the song and the judging (game/rhythm.ts, data/rhythm.ts), what a run
# pays (game/training.ts paySession and payRhythm, data/training.ts trainGames) and the picker and the session's life in `Game` (ui/game.ts). The screen side (the overlay, the touch, the layout) is the
# UI runner's: mutate-rhythm-ui.py.
#
# It works on a COPY of the repo (rhythm-unit-copy/), never on the real tree. Each mutant is one exact text replace whose `old` must occur exactly once in its file. Only the test file named in
# `expect_file` runs per mutant (tests/rhythm.test.ts or tests/rhythm-game.test.ts): a mutant counts only when ITS named test fails, so the rest of the suite cannot change the verdict.
# A mutant is CAUGHT only when the test named in `expect` (a substring of its full name, in `expect_file`) fails.
#
#   python3 mutate-rhythm-unit.py --list   checks each `old` occurs once in the real files (the EQUIVALENT ones too), prints the table, runs no tests
#   python3 mutate-rhythm-unit.py          makes a fresh copy, runs the baseline (both test files), then every mutant, then checks the copy
#   python3 mutate-rhythm-unit.py --only id1,id2   the same, for these mutants only
#   python3 mutate-rhythm-unit.py --equivalents    runs the EQUIVALENT list (the mutants argued to change nothing) instead: exit 0 only when every one of them leaves every test passing
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
COPY = os.path.join(VERIFY_OUT, "rhythm-unit-copy")
ORIG = os.path.join(VERIFY_OUT, "rhythm-unit-orig")
OUT = os.path.join(VERIFY_OUT, "rhythm-unit-out")
T_ENGINE = "tests/rhythm.test.ts"
T_GAME = "tests/rhythm-game.test.ts"
VITEST_ARGS = ["--cache=false", "--fsModuleCache=false", "--reporter=json"]
TEST_FILE = T_ENGINE
TIMEOUT_S = 600
EQUIV_MODE = False

F_ENGINE = "src/game/rhythm.ts"
F_DATA = "src/data/rhythm.ts"
F_TRAIN = "src/game/training.ts"
F_TDATA = "src/data/training.ts"
F_GAME = "src/ui/game.ts"


def mut(id, file, old, new, expect, test=T_ENGINE):
    return dict(id=id, file=file, old=old, new=new, expect=expect, expect_file=test)


# Test titles (substrings of the full test names)
# tests/rhythm.test.ts
SONGSHAPE = "writes each pattern as 16 marks that start with a note, and gives each field its own tempo and pattern"
STARTS = "starts every song at 2000 ms, rises strictly in whole milliseconds, and ends by 74,000 ms"
GAPS = "keeps the notes at least 550 ms apart for kid and young and 250 ms for adult"
LANDKID = "gives Land's kid song the notes the pattern says"
COUNTS = "counts the notes of every song at every stage"
MAXKID = "scores at most 100 a note"
APPEAR = "is shown 1600 ms before its time: the first at 400 ms"
WIN80 = "calls a tap 80 ms from a note Perfect, early or late, and 81 ms Good"
WIN160 = "calls a tap 160 ms from a note Good and 161 ms a stray"
MISS = "settles a note nobody tapped as a Miss at the first step more than 160 ms after it"
STRAY = "breaks the streak, takes 30 points and settles nothing for a stray"
FLOOR = "never lets the score fall below 0"
CLOSEST = "gives the tap to the closest of two notes"
SETTLE = "settles a judged note: it leaves the track"
POINTS = "scores 100 for a Perfect and 60 for a Good"
PAUSE = "does nothing while paused, and goes on where it was"
OVERTAP = "counts no tap and no time once over"
ENDRUN = "ends a run with no tap at 75,000 ms"
SAID = "remembers the last thing said and numbers each one"
PINS = "pins the windows, the points, the stray cost, the times and the lines"
FRAMES = "reaches the same time and the same notes on the track at any frame length"
CAP = "counts at most 100 ms of one call"
CARRY = "carries a time shorter than one step to the next call"
BANDLINES = "puts a score one under a line in the band below"
GOLDSHARE = "gives Gold to 20 to 30 percent of the stand-in player's runs in every stage"
STEADY = "scores under the Silver line for every tap interval"
WORDS = "says each judgment in words, with the offset"
# tests/rhythm-game.test.ts
GOLDPAY = "pays a Gold run +2 Spirit, +2 Discipline and 30 Bond XP, counts it for Spirit alone, and writes one log line"
HALFPAY = "pays Bronze and Silver +1 Spirit in a full session and nothing in a half one, then Bond XP only"
APART = "keeps Spirit's count apart from Speed's"
NOHIT = "pays nothing and counts for nothing for a run that hit no note"
NOBODY = "pays nobody when there is no creature, it is dead, or it is away"
STARTWORDS = "names the reward of the next session for each game"
RESULTWORDS = "says what each kind of result paid, with the count line"
OPENPICK = "opens on Bug Catch, takes a pick only while the card shows, and ignores a game that does not exist"
KEEPPICK = "does nothing for a pick when no card is open, and keeps the pick for the next card of the visit"
UNTOUCHED = "leaves the save byte-identical and writes nothing through start, a pick, Go, a Perfect and a stray made on the run itself, a pause and Quit"
BEGIN = "begins the song of the creature's own field with no random draw"
PLAYED = "pays a played run as Spirit, once, and saves it as a player action"
BURST = "starts a burst as Bug Catch whatever the pick, and leaves the pick alone"

# Not mutated (each argued from the code; `--equivalents` applies each one and exits 0 only when every test still passes, which is the proof that the argument holds):
#  - dropping `if (!c) return;` in beginTraining: the session is cleared by a death, a retire and a hatch (tests/training-game.test.ts, "is a death, a retire and a hatch"), so a start card never outlives
#    its creature; the line is there to narrow the type of `c` for `c.formId`, and esbuild, which runs the tests, does not check types.
# id, file, old (exact, must occur once in the file), new, expect (substring of the test's full name), expect_file
EQUIVALENT = [
    mut("begin-creature-guard", F_GAME, "if (!c) return;\n    t.run = t.game", "t.run = t.game", "(none)", T_GAME),
]

MUTANTS = [
    # judging
    mut("perfect-window-strict", F_ENGINE, 'nearest <= w.perfectMs ? "perfect" : "good"', 'nearest < w.perfectMs ? "perfect" : "good"', WIN80),
    mut("good-window-strict", F_ENGINE, "if (gap <= w.goodMs &&", "if (gap < w.goodMs &&", WIN160),
    mut("good-window-wide", F_ENGINE, "gap <= w.goodMs && gap", "gap <= w.goodMs + 10 && gap", WIN160),
    mut("tie-goes-to-the-later", F_ENGINE, "&& gap < nearest) {", "&& gap <= nearest) {", CLOSEST),
    mut("first-note-not-closest", F_ENGINE, "&& gap < nearest) {", "&& nearest === Infinity) {", CLOSEST),
    mut("miss-window-short", F_ENGINE, "if (s.elapsedMs - n.t <= w.goodMs) return true;", "if (s.elapsedMs - n.t < w.goodMs) return true;", MISS),
    mut("miss-window-long", F_ENGINE, "if (s.elapsedMs - n.t <= w.goodMs) return true;", "if (s.elapsedMs - n.t <= w.goodMs + 10) return true;", MISS),
    mut("miss-keeps-streak", F_ENGINE, 's.misses += 1;\n      s.streak = 0;\n      say(s, "miss", 0);', 's.misses += 1;\n      say(s, "miss", 0);', SETTLE),
    mut("miss-not-counted", F_ENGINE, "s.misses += 1;", "", ENDRUN),
    mut("miss-not-said", F_ENGINE, '      say(s, "miss", 0);\n', "", MISS),
    mut("stray-costs-nothing", F_ENGINE, "r.strayCost * s.strays", "0 * s.strays", STRAY),
    mut("stray-cost-tuned", F_DATA, "strayCost: 30,", "strayCost: 20,", STRAY),
    mut("stray-keeps-streak", F_ENGINE, "s.strays += 1;\n    s.streak = 0;", "s.strays += 1;", STRAY),
    mut("stray-not-counted", F_ENGINE, "s.strays += 1;\n    s.streak = 0;", "s.streak = 0;", STRAY),
    mut("floor-dropped", F_ENGINE, "s.score = Math.max(0, r.perfectPoints * s.perfects + r.goodPoints * s.goods - r.strayCost * s.strays);", "s.score = r.perfectPoints * s.perfects + r.goodPoints * s.goods - r.strayCost * s.strays;", FLOOR),
    mut("good-points-tuned", F_DATA, "goodPoints: 60,", "goodPoints: 50,", POINTS),
    mut("perfect-points-tuned", F_DATA, "perfectPoints: 100,", "perfectPoints: 90,", POINTS),
    mut("judged-note-stays", F_ENGINE, "s.notes.splice(at, 1);", "", SETTLE),
    mut("hit-keeps-no-streak", F_ENGINE, "s.streak += 1;\n  s.best", "s.best", SETTLE),
    mut("best-not-kept", F_ENGINE, "s.best = Math.max(s.best, s.streak);", "s.best = s.streak;", SETTLE),
    mut("good-counts-as-perfect", F_ENGINE, 'if (judge === "perfect") s.perfects += 1;\n  else s.goods += 1;', "s.perfects += 1;", POINTS),
    # the clock
    mut("paused-tap-counts", F_ENGINE, "if (s.over || s.paused) return null;", "if (s.over) return null;", PAUSE),
    mut("over-tap-counts", F_ENGINE, "if (s.over || s.paused) return null;", "if (s.paused) return null;", OVERTAP),
    mut("paused-time-passes", F_ENGINE, "if (s.over || s.paused) return false;", "if (s.over) return false;", PAUSE),
    mut("over-time-passes", F_ENGINE, "if (s.over || s.paused) return false;", "if (s.paused) return false;", OVERTAP),
    mut("frame-cap-dropped", F_ENGINE, "Math.min(Math.max(dtMs, 0), t.frameCapMs)", "Math.max(dtMs, 0)", CAP),
    mut("negative-time-counts", F_ENGINE, "Math.min(Math.max(dtMs, 0), t.frameCapMs)", "Math.min(dtMs, t.frameCapMs)", CAP),
    mut("non-finite-time-counts", F_ENGINE, "Number.isFinite(dtMs) ? Math.min(Math.max(dtMs, 0), t.frameCapMs) : 0", "Math.min(Math.max(dtMs, 0), t.frameCapMs)", CAP),
    mut("carry-lost-in-a-call", F_ENGINE, "s.carryMs -= t.stepMs;", "s.carryMs = 0;", FRAMES),
    mut("carry-not-kept", F_ENGINE, "s.carryMs += Number.isFinite(dtMs)", "s.carryMs = Number.isFinite(dtMs)", CARRY),
    mut("note-comes-on-late", F_ENGINE, "- s.elapsedMs <= r.approachMs) {", "- s.elapsedMs < r.approachMs) {", APPEAR),
    mut("note-comes-on-early", F_ENGINE, "- s.elapsedMs <= r.approachMs) {", "- s.elapsedMs <= r.approachMs + 10) {", APPEAR),
    mut("note-on-not-flagged", F_ENGINE, "s.next += 1;\n      changed = true;", "s.next += 1;", APPEAR),
    mut("run-ends-late", F_ENGINE, "if (s.elapsedMs >= s.lengthMs) s.over = true;", "if (s.elapsedMs > s.lengthMs) s.over = true;", ENDRUN),
    mut("miss-not-flagged", F_ENGINE, "if (s.notes.length !== before) changed = true;", "", MISS),
    mut("end-not-flagged", F_ENGINE, "return changed || s.over;", "return changed;", ENDRUN),
    mut("run-steps-past-the-end", F_ENGINE, "while (s.carryMs >= t.stepMs && !s.over) {", "while (s.carryMs >= t.stepMs) {", ENDRUN),
    mut("said-counter-stuck", F_ENGINE, "n: (s.said?.n ?? 0) + 1", "n: 1", SAID),
    mut("said-offset-dropped", F_ENGINE, "s.said = { n: (s.said?.n ?? 0) + 1, judge, deltaMs };", "s.said = { n: (s.said?.n ?? 0) + 1, judge, deltaMs: 0 };", SAID),
    mut("perfect-window-tuned", F_DATA, "perfectMs: 80,", "perfectMs: 90,", WIN80),
    mut("good-window-tuned", F_DATA, "goodMs: 160 }", "goodMs: 170 }", WIN160),
    mut("approach-tuned", F_DATA, "approachMs: 1600,", "approachMs: 1500,", APPEAR),
    mut("tail-tuned", F_DATA, "tailMs: 1000,", "tailMs: 500,", STARTS),
    mut("kid-silver-line-tuned", F_DATA, "kid: { level: 1, silverPct: 75, goldPct: 93 }", "kid: { level: 1, silverPct: 70, goldPct: 93 }", PINS),
    mut("young-gold-line-tuned", F_DATA, "young: { level: 2, silverPct: 75, goldPct: 89 }", "young: { level: 2, silverPct: 75, goldPct: 90 }", PINS),
    mut("land-kid-notes-too-close", F_DATA, 'pattern: "1.1.1.231.1.2.33"', 'pattern: "11..1.231.1.2.33"', GAPS),
    # the songs
    mut("song-tail-dropped", F_ENGINE, "if (time <= last) times.push(time);", "times.push(time);", STARTS),
    mut("song-runs-to-the-end", F_ENGINE, "const last = lengthMs - r.tailMs;", "const last = lengthMs;", STARTS),
    mut("song-level-off-by-one", F_ENGINE, "Number(mark) > level", "Number(mark) >= level", COUNTS),
    mut("song-rests-play", F_ENGINE, 'if (mark === "." || Number(mark) > level) continue;', "if (Number(mark) > level) continue;", LANDKID),
    mut("song-not-rounded", F_ENGINE, "const time = Math.round(r.leadInMs + loop * loopMs + i * eighthMs);", "const time = r.leadInMs + loop * loopMs + i * eighthMs;", STARTS),
    mut("song-eighth-doubled", F_ENGINE, "30000 / song.bpm", "60000 / song.bpm", LANDKID),
    mut("lead-in-tuned", F_DATA, "leadInMs: 2000,", "leadInMs: 1000,", STARTS),
    mut("land-tempo-tuned", F_DATA, "bpm: 96,", "bpm: 100,", LANDKID),
    # the band
    mut("gold-line-strict", F_ENGINE, "s.score * 100 >= top * row.goldPct ?", "s.score * 100 > top * row.goldPct ?", BANDLINES),
    mut("silver-line-strict", F_ENGINE, ": s.score * 100 >= top * row.silverPct", ": s.score * 100 > top * row.silverPct", BANDLINES),
    mut("max-score-wrong", F_ENGINE, "r.perfectPoints * s.times.length", "r.goodPoints * s.times.length", MAXKID),
    mut("silver-line-too-low", F_DATA, "adult: { level: 3, silverPct: 75, goldPct: 85 }", "adult: { level: 3, silverPct: 65, goldPct: 85 }", STEADY),
    mut("gold-line-too-low", F_DATA, "kid: { level: 1, silverPct: 75, goldPct: 93 }", "kid: { level: 1, silverPct: 75, goldPct: 80 }", GOLDSHARE),
    # the words
    mut("words-early-late-swapped", F_ENGINE, 'said.deltaMs < 0 ? "early" : "late"', 'said.deltaMs > 0 ? "early" : "late"', WORDS),
    mut("words-on-the-beat-dropped", F_ENGINE, "if (said.deltaMs === 0) return `${word}, on the beat`;\n", "", WORDS),
    mut("words-sign-shown", F_ENGINE, "${Math.abs(said.deltaMs)}", "${said.deltaMs}", WORDS),
    mut("words-stray-dropped", F_ENGINE, 'if (said.judge === "stray") return `No note, -${r.strayCost}`;\n', "", WORDS),
    mut("words-miss-dropped", F_ENGINE, 'if (said.judge === "miss") return "Miss";\n', "", WORDS),
    # what a run pays
    mut("rhythm-trains-speed", F_TRAIN, 'paySession(save, c, "rhythm", rhythmBandOf(run)', 'paySession(save, c, "bug", rhythmBandOf(run)', GOLDPAY, T_GAME),
    mut("band-from-bug-catch-lines", F_TRAIN, 'paySession(save, c, "rhythm", rhythmBandOf(run), run.score', 'paySession(save, c, "rhythm", bandOf(run.score, run.stage), run.score', HALFPAY, T_GAME),
    mut("one-note-is-notes", F_TRAIN, '${r.catches === 1 ? "note" : "notes"} hit', "notes hit", RESULTWORDS, T_GAME),
    mut("goods-are-no-hits", F_TRAIN, "run.perfects + run.goods, nowMs)", "run.perfects, nowMs)", HALFPAY, T_GAME),
    mut("no-hit-run-pays", F_TRAIN, "if (hits === 0) return result;", "", NOHIT, T_GAME),
    mut("pay-guard-dropped", F_TRAIN, 'if (save.phase !== "alive" || !c || c.job) return null;\n  const result = paySession', "if (!c) return null;\n  const result = paySession", NOBODY, T_GAME),
    mut("rhythm-counted-with-speed", F_TDATA, 'rhythm: { name: "Rhythm Grove", stat: "spi", statName: "Spirit" }', 'rhythm: { name: "Rhythm Grove", stat: "spd", statName: "Spirit" }', APART, T_GAME),
    mut("log-line-names-bug-catch", F_TRAIN, "`${name}: ${band}, ${score} points,", "`Bug Catch: ${band}, ${score} points,", GOLDPAY, T_GAME),
    mut("start-line-says-speed", F_TRAIN, "const word = trainGames[game].statName;", 'const word = "Speed";', STARTWORDS, T_GAME),
    mut("result-line-says-speed", F_TRAIN, "const word = trainGames[r.game].statName;", 'const word = "Speed";', RESULTWORDS, T_GAME),
    mut("result-count-line-wrong", F_TRAIN, "missed ${r.rhythm.missed}", "missed ${r.rhythm.strays}", RESULTWORDS, T_GAME),
    mut("no-notes-says-bugs", F_TRAIN, '"No notes hit: nothing to pay."', '"No bugs caught: nothing to pay."', NOHIT, T_GAME),
    # the picker and the session
    mut("pick-any-phase", F_GAME, 'if (!t || t.phase !== "ready" || !trainGameIds.includes(id)) return;', "if (!t || !trainGameIds.includes(id)) return;", OPENPICK, T_GAME),
    mut("pick-any-id", F_GAME, 'if (!t || t.phase !== "ready" || !trainGameIds.includes(id)) return;', 'if (!t || t.phase !== "ready") return;', OPENPICK, T_GAME),
    mut("pick-not-applied", F_GAME, "t.game = id;\n    this.trainPick = id;", "this.trainPick = id;", OPENPICK, T_GAME),
    mut("pick-not-kept", F_GAME, "t.game = id;\n    this.trainPick = id;", "t.game = id;", KEEPPICK, T_GAME),
    mut("card-ignores-the-kept-pick", F_GAME, "game: this.trainPick, phase: \"ready\"", 'game: "bug", phase: "ready"', KEEPPICK, T_GAME),
    mut("go-always-bug-catch", F_GAME, 't.run = t.game === "rhythm" ? newRhythm(', 't.run = false ? newRhythm(', BEGIN, T_GAME),
    mut("go-always-adult-song", F_GAME, 'newRhythm(fieldOfForm(c.formId) ?? "land", t.stage)', 'newRhythm(fieldOfForm(c.formId) ?? "land", "adult")', BEGIN, T_GAME),
    mut("go-always-land", F_GAME, 'fieldOfForm(c.formId) ?? "land"', '"land"', BEGIN, T_GAME),
    mut("finish-always-bug-catch", F_GAME, 'return t.game === "rhythm" ? payRhythm(', "return false ? payRhythm(", PLAYED, T_GAME),
    mut("pick-writes-the-save", F_GAME, "t.game = id;\n    this.trainPick = id;", "t.game = id;\n    this.trainPick = id;\n    void writeSave(this.save);", UNTOUCHED, T_GAME),
    mut("go-writes-the-save", F_GAME, 't.phase = "playing";\n    this.listeners', 't.phase = "playing";\n    void writeSave(this.save);\n    this.listeners', UNTOUCHED, T_GAME),
    mut("burst-takes-the-pick", F_GAME, 'game: "bug", phase: "playing"', 'game: this.trainPick, phase: "playing"', BURST, T_GAME),
    mut("burst-resets-the-pick", F_GAME, 'game: "bug", phase: "playing"', 'game: (this.trainPick = "bug"), phase: "playing"', BURST, T_GAME),
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
