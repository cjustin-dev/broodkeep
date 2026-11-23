#!/usr/bin/env python3
# Mutation runner for the Retire unit rules (Broodkeep, adult A1.4).
#
# It works on a COPY of the repo (unit-copy/), never on the real tree. Each mutant is one exact text replace whose `old` must occur
# exactly once in its file. The whole vitest suite runs per mutant (the same rule is exercised by other test files too). A mutant is
# CAUGHT only when the test named in `expect` fails.
#
#   python3 mutate-retire-unit.py --list   checks each `old` occurs once in the real files, prints the table, runs no tests
#   python3 mutate-retire-unit.py          makes a fresh copy, runs the baseline, then every mutant, then checks the copy
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
TEST_FILE = "tests/retire.test.ts"
TIMEOUT_S = 900

F_RET = "src/game/retire.ts"
F_ACT = "src/game/actions.ts"
F_STA = "src/game/state.ts"

# id, file, old (exact, must occur once in the file), new, expect (substring of the test's full name in tests/retire.test.ts)
MUTANTS = [
    dict(id="adult-check-loosened", file=F_RET,
         old='if (formOf(c.formId)?.stage !== "adult") return "not-adult";',
         new='if (formOf(c.formId)?.stage !== "young") return "not-adult";',
         expect="gives the teaser for a living baby, kid, young or special"),
    dict(id="special-allowed", file=F_RET,
         old='if (formOf(c.formId)?.stage !== "adult") return "not-adult";',
         new='if (formOf(c.formId)?.stage !== "adult" && c.formId !== "dustpuff") return "not-adult";',
         expect="gives the teaser for a living baby, kid, young or special"),
    dict(id="away-check-removed", file=F_RET,
         old='if (c.job) return "away";',
         new='if (c.job && false) return "away";',
         expect="an adult that is away at a spot is refused as away"),
    dict(id="phase-check-removed", file=F_RET,
         old='if (save.phase !== "alive" || !c) return "unavailable";',
         new='if (!c) return "unavailable";',
         expect="a dead creature, of any stage, is refused as unavailable"),
    dict(id="refusal-order-swapped", file=F_RET,
         old='  if (formOf(c.formId)?.stage !== "adult") return "not-adult";\n  if (c.job) return "away";',
         new='  if (c.job) return "away";\n  if (formOf(c.formId)?.stage !== "adult") return "not-adult";',
         expect="a young or special creature that is also away is refused as not grown up"),
    dict(id="formOf-plain-lookup", file=F_RET,
         old='(Object.prototype.hasOwnProperty.call(forms, formId) ? forms[formId] : undefined)',
         new='forms[formId]',
         expect="a form this version does not know is not offered"),
    dict(id="fight-ignored", file=F_RET,
         old='return fighting ? { kind: "fighting", name } : { kind: "ready", name };',
         new='return { kind: "ready", name };',
         expect="an adult at home during a fight is told to finish the fight"),
    dict(id="away-spot-shows-id", file=F_RET,
         old='spot: c.job ? spots[c.job.spot].name : ""',
         new='spot: c.job ? c.job.spot : ""',
         expect="names an adult that is out as away, with the spot's name"),
    dict(id="month-name-changed", file=F_RET,
         old='"Sep", "Oct"',
         new='"Sept", "Oct"',
         expect="name every month by its three letters"),
    dict(id="unknown-name-fallback-changed", file=F_RET,
         old='?? "A creature";',
         new='?? "";',
         expect="a form this version does not know is not offered"),
    dict(id="banned-word-added", file=F_RET,
         old='keep: "Keep playing",',
         new='keep: "Keep playing, lose nothing",',
         expect="none of the strings, for any adult's name or any spot, holds a word of loss"),
    dict(id="log-text-changed", file=F_ACT,
         old='`${getForm(c.formId).name} retired`',
         new='`${getForm(c.formId).name} left`',
         expect="adds one record with the creature's own form"),
    dict(id="catch-up-removed", file=F_ACT,
         old='export function retireCreature(save: Save, nowMs: number): RetireResult {\n  simulateTo(save, nowMs);\n',
         new='export function retireCreature(save: Save, nowMs: number): RetireResult {\n',
         expect="catches the game up first"),
    dict(id="retiredAt-clamp-removed", file=F_ACT,
         old='retiredAt: Math.max(nowMs, c.bornAt) });',
         new='retiredAt: nowMs });',
         expect="a clock set back never makes the record run backwards"),
    dict(id="record-fields-swapped", file=F_ACT,
         old='bornAt: c.bornAt, retiredAt: Math.max(nowMs, c.bornAt) });',
         new='bornAt: Math.max(nowMs, c.bornAt), retiredAt: c.bornAt });',
         expect="adds one record with the creature's own form"),
    dict(id="record-form-wrong", file=F_ACT,
         old='save.retired.push({ formId: c.formId,',
         new='save.retired.push({ formId: "blip",',
         expect="adds one record with the creature's own form"),
    dict(id="egg-step-not-drawn", file=F_ACT,
         old='  save.egg = newEgg(nowMs, rng.pick(eggPatterns));\n  save.rngState = rng.state();',
         new='  save.egg = newEgg(nowMs, rng.pick(eggPatterns));',
         expect="draws the new egg exactly as startNewEgg does"),
    dict(id="coins-reset", file=F_ACT,
         old='  putInNewEgg(save, nowMs);\n  return "retired";',
         new='  save.coins = 0;\n  putInNewEgg(save, nowMs);\n  return "retired";',
         expect="leaves the Book, coins, bag"),
    dict(id="book-reset", file=F_ACT,
         old='  putInNewEgg(save, nowMs);\n  return "retired";',
         new='  save.book = [];\n  putInNewEgg(save, nowMs);\n  return "retired";',
         expect="leaves the Book, coins, bag"),
    dict(id="record-order-unshift", file=F_ACT,
         old='save.retired.push({',
         new='save.retired.unshift({',
         expect="keeps every earlier record and adds the new one last"),
    dict(id="cap-at-100", file=F_ACT,
         old='save.retired.push({ formId: c.formId, bornAt: c.bornAt, retiredAt: Math.max(nowMs, c.bornAt) });',
         new='save.retired.push({ formId: c.formId, bornAt: c.bornAt, retiredAt: Math.max(nowMs, c.bornAt) }); if (save.retired.length > 100) save.retired.splice(0, save.retired.length - 100);',
         expect="keeps every earlier record and adds the new one last"),
    dict(id="death-not-cleared", file=F_ACT,
         old='  save.death = null;\n  save.phase = "egg";',
         new='  save.phase = "egg";',
         expect_file="tests/actions.test.ts", expect="starts a new egg, and only when dead"),
    dict(id="phase-not-egg", file=F_ACT,
         old='  save.death = null;\n  save.phase = "egg";',
         new='  save.death = null;\n  save.phase = "alive";',
         expect="puts a new egg in the creature's place"),
    dict(id="migrate-default-removed", file=F_STA,
         old='})) : [];',
         new='})) : value.retired;',
         expect="a save from before Retire gets an empty list"),
    dict(id="migrate-shape-filter-removed", file=F_STA,
         old='value.retired.filter(isRetiredLife).map(',
         new='value.retired.map(',
         expect="keeps good records as plain three-field records"),
    dict(id="migrate-backwards-clamp-removed", file=F_STA,
         old='retiredAt: Math.max(retiredAt, bornAt) })) : [];',
         new='retiredAt })) : [];',
         expect="keeps a record that runs backwards"),
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
