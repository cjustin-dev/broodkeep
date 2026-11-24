#!/usr/bin/env python3
# Mutation runner for the call back rules and the cards' words (Broodkeep, adult A2.1).
#
# It works on a COPY of the repo (unit-copy/), never on the real tree. Each mutant is one exact text replace whose `old` must occur
# exactly once in its file. The whole vitest suite runs per mutant (the same rule is exercised by other test files too). A mutant is
# CAUGHT only when the test named in `expect` fails.
#
#   python3 mutate-habitat-unit.py --list   checks each `old` occurs once in the real files, prints the table, runs no tests
#   python3 mutate-habitat-unit.py          makes a fresh copy, runs the baseline, then every mutant, then checks the copy
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
COPY = os.path.join(VERIFY_OUT, "unit-copy")
ORIG = os.path.join(VERIFY_OUT, "unit-orig")
OUT = os.path.join(VERIFY_OUT, "unit-out")
VITEST = ["npx", "vitest", "run", "--cache=false", "--fsModuleCache=false", "--reporter=json"]
TEST_FILE = "tests/callback.test.ts"
TIMEOUT_S = 900

F_JOB = "src/game/habitat/jobs.ts"
F_ACT = "src/game/actions.ts"
F_CARD = "src/game/habitat/cards.ts"

# id, file, old (exact, must occur once in the file), new, expect (substring of the test's full name in tests/callback.test.ts)
LITERAL = "the literal numbers at 0, 25, 33, 50, 99 and 100 percent"
MUTANTS = [
    dict(id="rounds-to-nearest", file=F_JOB,
         old='Math.floor(((range[0] + range[1]) * done) / (2 * total))',
         new='Math.round(((range[0] + range[1]) * done) / (2 * total))',
         expect=LITERAL),
    dict(id="rounds-up", file=F_JOB,
         old='Math.floor(((range[0] + range[1]) * done) / (2 * total))',
         new='Math.ceil(((range[0] + range[1]) * done) / (2 * total))',
         expect=LITERAL),
    dict(id="low-end-not-middle", file=F_JOB,
         old='((range[0] + range[1]) * done) / (2 * total)',
         new='(range[0] * 2 * done) / (2 * total)',
         expect=LITERAL),
    dict(id="coins-and-material-swapped", file=F_JOB,
         old='return { coins: share(spot.coins), amount: share(spot.amount) };',
         new='return { coins: share(spot.amount), amount: share(spot.coins) };',
         expect=LITERAL),
    dict(id="share-not-capped-at-whole", file=F_JOB,
         old='done: Math.min(total, Math.max(0, nowMs - job.startedAt))',
         new='done: Math.max(0, nowMs - job.startedAt)',
         expect="never pays below nothing or above the middle of the range"),
    dict(id="share-not-floored-at-zero", file=F_JOB,
         old='done: Math.min(total, Math.max(0, nowMs - job.startedAt))',
         new='done: Math.min(total, nowMs - job.startedAt)',
         expect="never pays below nothing or above the middle of the range"),
    dict(id="zero-length-gives-nan", file=F_JOB,
         old='if (total === 0) return { coins: 0, amount: 0 };',
         new='if (false) return { coins: 0, amount: 0 };',
         expect="pays nothing, and never NaN, for a job with no length"),
    dict(id="backwards-job-not-guarded", file=F_JOB,
         old='if (!(total > 0)) return { done: 0, total: 0 };',
         new='if (total === 0) return { done: 0, total: 0 };',
         expect="pays nothing, and never NaN, for a job with no length"),
    dict(id="progress-halved", file=F_JOB,
         old='return total === 0 ? 0 : done / total;',
         new='return total === 0 ? 0 : done / total / 2;',
         expect="jobProgress runs from 0 to 1 and is clamped"),
    dict(id="empty-haul-pushed", file=F_JOB,
         old='if (coins + amount > 0) {',
         new='if (true) {',
         expect="leaves no haul, and no card, when it earned nothing"),
    dict(id="energy-given-back", file=F_JOB,
         old='  c.job = null;\n  if (coins + amount > 0) {',
         new='  c.job = null;\n  c.stats.energy = Math.min(100, c.stats.energy + spot.energyCost);\n  if (coins + amount > 0) {',
         expect="does not give the energy back, and does not count as a chore"),
    dict(id="counted-as-a-chore", file=F_JOB,
         old='  c.job = null;\n  if (coins + amount > 0) {',
         new='  c.job = null;\n  c.counters.chores = (c.counters.chores ?? 0) + 1;\n  if (coins + amount > 0) {',
         expect="does not give the energy back, and does not count as a chore"),
    dict(id="whole-haul-paid-early", file=F_JOB,
         old='const { coins, amount } = callBackHaul(job, nowMs);\n  c.job = null;',
         new='const { coins, amount } = callBackHaul(job, job.endsAt);\n  c.job = null;',
         expect="adds what the time earned to the bag and pushes it as a haul"),
    dict(id="coins-not-banked", file=F_JOB,
         old='  save.coins += coins;\n  save.inventory[material]',
         new='  save.inventory[material]',
         expect="adds what the time earned to the bag and pushes it as a haul"),
    dict(id="haul-list-not-limited", file=F_JOB,
         old='if (save.hauls.length > habitatTuning.unseenHaulsMax) save.hauls.splice(0, save.hauls.length - habitatTuning.unseenHaulsMax);',
         new='',
         expect="keeps the welcome-back list to its limit"),
    dict(id="call-back-brings-nothing-again", file=F_ACT,
         old='  endJobEarly(save, c, nowMs);\n  return "called";',
         new='  c.job = null;\n  return "called";',
         expect="adds what the time earned to the bag and pushes it as a haul"),
    dict(id="call-back-says-nothing-after-paying", file=F_ACT,
         old='  endJobEarly(save, c, nowMs);\n  return "called";',
         new='  endJobEarly(save, c, nowMs);\n  return "nothing";',
         expect="adds what the time earned to the bag and pushes it as a haul"),
    dict(id="label-one-second-ahead", file=F_CARD,
         old='const { coins, amount } = callBackHaul(job, nowMs);',
         new='const { coins, amount } = callBackHaul(job, nowMs + 1000);',
         expect="the button's words state exactly what the tap adds"),
    dict(id="label-names-wrong-material", file=F_CARD,
         old='materialText(spots[job.spot].material, amount)',
         new='materialText("fish", amount)',
         expect="the button's words are these literals at known moments"),
    dict(id="coin-always-plural", file=F_CARD,
         old='`${n} ${n === 1 ? "coin" : "coins"}`',
         new='`${n} coins`',
         expect="counts are singular for one"),
    dict(id="herb-plural-for-one", file=F_CARD,
         old='{ herb: "Herb" }',
         new='{}',
         expect="counts are singular for one"),
    dict(id="equal-range-written-as-range", file=F_CARD,
         old='range[0] === range[1] ? text(range[0])',
         new='false ? text(range[0])',
         expect="a range of one number is written as that number"),
    dict(id="haul-line-from-wrong-spot", file=F_CARD,
         old='    const s = spots[spot];\n    return `Haul:',
         new='    const s = spots.pond;\n    return `Haul:',
         expect="the card's lines are these literal words"),
    dict(id="cost-numbers-swapped", file=F_CARD,
         old='`${spots[spot].minutes} min, ${spots[spot].energyCost} energy`',
         new='`${spots[spot].energyCost} min, ${spots[spot].minutes} energy`',
         expect="the card's lines are these literal words"),
    dict(id="word-of-loss-in-the-energy-line", file=F_CARD,
         old='which does not come back.',
         new='which is lost.',
         expect="no string holds a word of loss"),
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
