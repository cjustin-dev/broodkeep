#!/usr/bin/env python3
# Mutation runner for the request board's rules (Broodkeep, adult A2.3, docs/adult-a2-plan.md section 11, "Mutation targets").
#
# It works on a COPY of the repo (board-unit-copy/), never on the real tree. Each mutant is one exact text replace whose `old` must occur
# exactly once in its file. The whole vitest suite runs per mutant (the same rule is exercised by other test files too). A mutant is
# CAUGHT only when the test named in `expect` (a substring of its full name, in `expect_file` when given) fails.
#
#   python3 mutate-board-unit.py --list   checks each `old` occurs once in the real files, prints the table, runs no tests
#   python3 mutate-board-unit.py          makes a fresh copy, runs the baseline, then every mutant, then checks the copy
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
COPY = os.path.join(VERIFY_OUT, "board-unit-copy")
ORIG = os.path.join(VERIFY_OUT, "board-unit-orig")
OUT = os.path.join(VERIFY_OUT, "board-unit-out")
VITEST = ["npx", "vitest", "run", "--cache=false", "--fsModuleCache=false", "--reporter=json"]
TEST_FILE = "tests/requests.test.ts"
NOTE_FILE = "tests/game-note.test.ts"
TIMEOUT_S = 900

F_REQ = "src/game/requests.ts"
F_BOARD = "src/game/board.ts"
F_ACT = "src/game/actions.ts"
F_JOBS = "src/game/habitat/jobs.ts"
F_FIGHT = "src/game/combat/fight.ts"
F_SIM = "src/game/sim.ts"
F_GAME = "src/ui/game.ts"

# Titles (substrings of the full test names in tests/requests.test.ts and tests/game-note.test.ts)
DEAL = "deals 3 requests at the first whole minute"
NOT_KID = "deals nothing in Kid Mode, to an egg, or to a dead creature"
NO_RNG = "reads the simulation's generator without advancing it"
OWN_SEED = "each draw has a seed of its own"
FROM_DRAW = "counts from the moment it is drawn"
UNTOUCHED7 = "seven days of a creature that is looked after but never uses the board lose nothing"
FITS = "only draws what the creature can do"
STAGE_POOL = "draws everything the stage allows and nothing else"
NODUP = "never names the same type and target twice"
TWO_LEFT = "with two items left to own, a reward is never the item a buy request names"
RHYTHM = "carries an item on draws 3, 7, 11"
SPLIT = "the same save and time give the same board however the minutes are split"
REFILL = "draws a waiting slot again exactly 15 minutes"
FEED_COUNT = "counts a meal of the named food, pays on the second"
REFUSED = "counts nothing for a refused meal, another food"
DISH = "a dish meal counts as a meal of the food it is a meal of"
FIELD_MIN = "counts an awake minute at the named field and pays at the 20th"
FIELD_NOT = "counts nothing at home, in another field, asleep or on a job"
JOB = "counts a finished job at the named spot"
JOB_NOT = "counts nothing for a call back, or a job at another spot"
FIGHT = "counts a won fight and pays"
BUY_AFTER = "a purchase counts at the first minute after the 10 second undo window"
BUY_UNDO = "buy, undo, repeated, pays nothing"
BUY_LATER = "a later purchase makes the earlier one permanent"
BUY_FUTURE = "a purchase from the future does not count"
BUY_WINDOW = "purchaseCounted: the window is 10 seconds"
OFF = "with Adult Mode off nothing counts or is drawn"
PAYS = "pays its coins and its item, leaves a wait"
ITEM_OWNED = "pays only the coins for an item that is owned by then"
WALL = "a paid wallpaper is owned and not hung"
STALE = "the oldest open request pays a quarter more after exactly 3 days"
STALE_ONLY = "only the oldest gets the bonus"
TWO = "pays every request that finishes in one minute"
CLAMP = "brings a time after now back to now"
FIT_AFTER = "after a retire the board waits for the next creature"
FIT_DROPS = "a request is dropped for a field food the creature has not got"
FIT_EVO = "an ordinary evolution drops nothing"
MIG_BAD = "drops a request with an unknown type"
MIG_CLAMP = "clamps progress to what the type needs"
MIG_WAIT = "drops a wait with a bad time"
MIG_CAP = "keeps at most 3 slots together"
MIG_DUP = "drops a second open request for the same type and target"
MIG_DRAWN = "raises a bad or low draw count above the highest id"
NO_AMOUNT = "states no amount for a payment whose wait is already gone"

# Not mutated, because no mutant of them can change what the code does (a reviewer showed each): the phase check in `stepRequests` (its only caller steps
# a creature that is alive), counting past the need (a request leaves the board the moment it reaches its need), a field minute for "home" (never the
# target of a field request), and a fit check that runs for a retired creature (retire leaves no creature, and nothing steps then).
# id, file, old (exact, must occur once in the file), new, expect (substring of the test's full name), expect_file (default TEST_FILE)
MUTANTS = [
    # the Adult Mode check (edges 1, 12)
    dict(id="adult-missing-from-counting", file=F_REQ, old="  if (!adultOn(save)) return;\n  const target = event.kind", new="  const target = event.kind", expect=OFF),
    dict(id="adult-missing-from-step", file=F_REQ, old='if (!adultOn(save) || save.phase !== "alive" || !c) return;', new='if (save.phase !== "alive" || !c) return;', expect=NOT_KID),
    dict(id="adult-not-exactly-true", file=F_REQ, old="save.settings.adultMode === true;", new="Boolean(save.settings.adultMode);", expect=NOT_KID),
    # the draw's generator (edges 1, 5)
    dict(id="draw-seeded-from-saved-state", file=F_REQ, old="makeRng((live ^ Math.imul(board.drawn + 1, 0x9e3779b1)) >>> 0)", new="makeRng((save.rngState ^ Math.imul(board.drawn + 1, 0x9e3779b1)) >>> 0)", expect=NO_RNG),
    dict(id="draw-seeded-from-saved-state-split", file=F_REQ, old="makeRng((live ^ Math.imul(board.drawn + 1, 0x9e3779b1)) >>> 0)", new="makeRng((save.rngState ^ Math.imul(board.drawn + 1, 0x9e3779b1)) >>> 0)", expect=SPLIT),
    dict(id="draw-advances-generator", file=F_REQ, old="if (!deal(save, c, rng.state(), t)) break;", new="if (!deal(save, c, (rng.next(), rng.state()), t)) break;", expect=NO_RNG),
    dict(id="draw-ignores-draw-count", file=F_REQ, old="makeRng((live ^ Math.imul(board.drawn + 1, 0x9e3779b1)) >>> 0)", new="makeRng(live >>> 0)", expect=OWN_SEED),
    # what may be drawn (edges 2, 3, 4)
    dict(id="feed-ignores-menu", file=F_REQ, old='pool = menuOf(c).filter((food) => food !== "treat");', new='pool = (Object.keys(foods) as FoodId[]).filter((food) => food !== "treat");', expect=FITS),
    dict(id="feed-allows-treat", file=F_REQ, old='pool = menuOf(c).filter((food) => food !== "treat");', new="pool = menuOf(c);", expect=FITS),
    dict(id="job-ignores-stage", file=F_REQ, old="pool = spotIds.filter((id) => opensAt(c, spots[id].minStage));", new="pool = [...spotIds];", expect=STAGE_POOL),
    dict(id="fight-for-baby", file=F_REQ, old="pool = opensAt(c, combatTuning.minStage) ? [null] : [];", new="pool = [null];", expect=STAGE_POOL),
    dict(id="buy-unpayable-allowed", file=F_REQ, old="!save.owned.includes(id) && !carried.has(id) && payable(save, c, id));", new="!save.owned.includes(id) && !carried.has(id));", expect=STAGE_POOL),
    dict(id="duplicate-type-target-allowed", file=F_REQ, old="  return pool.filter((target) => !named.has(target));", new="  return pool;", expect=NODUP),
    dict(id="buy-names-owned-item", file=F_REQ, old="!save.owned.includes(id) && !carried.has(id) && payable(save, c, id));", new="!carried.has(id) && payable(save, c, id));", expect=NODUP),
    dict(id="buy-names-reward-item", file=F_REQ, old="!save.owned.includes(id) && !carried.has(id) && payable(save, c, id));", new="!save.owned.includes(id) && payable(save, c, id));", expect=TWO_LEFT),
    dict(id="reward-item-may-be-owned", file=F_REQ, old="const pool = itemIds.filter((id) => items[id].kind !== \"room\" && !save.owned.includes(id) && !named.has(id));", new="const pool = itemIds.filter((id) => items[id].kind !== \"room\" && !named.has(id));", expect=NODUP),
    dict(id="reward-item-may-be-a-buy-target", file=F_REQ, old="const pool = itemIds.filter((id) => items[id].kind !== \"room\" && !save.owned.includes(id) && !named.has(id));", new="const pool = itemIds.filter((id) => items[id].kind !== \"room\" && !save.owned.includes(id));", expect=TWO_LEFT),
    dict(id="rhythm-off-by-one", file=F_REQ, old="board.drawn % requestTuning.itemEvery === requestTuning.itemEvery - 1", new="board.drawn % requestTuning.itemEvery === requestTuning.itemEvery - 2", expect=RHYTHM),
    dict(id="item-never-drawn", file=F_REQ, old="if (pool.length > 0) item = rng.pick(pool);", new="if (pool.length > 0) item = null;", expect=RHYTHM),
    # the refill (edge 6)
    dict(id="refill-one-minute-early", file=F_REQ, old="t < w.doneAt + requestTuning.refillMinutes * MINUTE", new="t < w.doneAt + (requestTuning.refillMinutes - 1) * MINUTE", expect=REFILL),
    dict(id="refill-one-minute-late", file=F_REQ, old="t < w.doneAt + requestTuning.refillMinutes * MINUTE", new="t < w.doneAt + (requestTuning.refillMinutes + 1) * MINUTE", expect=REFILL),
    # counting (edges 7 to 10)
    dict(id="meal-not-counted", file=F_ACT, old='  noteRequest(save, { kind: "feed", food: foodId }, nowMs); // a dish meal is a meal of its food\n', new="", expect=FEED_COUNT),
    dict(id="dish-meal-not-counted", file=F_ACT, old='noteRequest(save, { kind: "feed", food: foodId }, nowMs);', new='noteRequest(save, { kind: "feed", food: dish !== undefined ? "none" : foodId }, nowMs);', expect=DISH),
    dict(id="meal-counted-on-a-refusal", file=F_ACT, old="if (refusal) return feedWord[refusal];", new='if (refusal) {\n    noteRequest(save, { kind: "feed", food: foodId }, nowMs);\n    return feedWord[refusal];\n  }', expect=REFUSED),
    dict(id="meal-counted-before-the-draw", file=F_REQ, old="board.open.push({ id: board.drawn, type, target, have: 0, item, drewAt: t });", new='board.open.push({ id: board.drawn, type, target, have: type === "feed" ? Math.min(1, c.counters.servings[target as FoodId] ?? 0) : 0, item, drewAt: t });', expect=FROM_DRAW),
    dict(id="other-food-counted", file=F_REQ, old="if (r.type !== event.kind || r.target !== target) continue;", new="if (r.type !== event.kind) continue;", expect=REFUSED),
    dict(id="field-counted-asleep", file=F_REQ, old='if (c.place !== "home" && c.sleep === null && !c.job) noteRequest', new='if (c.place !== "home" && !c.job) noteRequest', expect=FIELD_NOT),
    dict(id="field-counted-on-a-job", file=F_REQ, old='if (c.place !== "home" && c.sleep === null && !c.job) noteRequest', new='if (c.place !== "home" && c.sleep === null) noteRequest', expect=FIELD_NOT),
    dict(id="field-counted-for-the-wrong-field", file=F_REQ, old='{ kind: "field", field: c.place }', new='{ kind: "field", field: "land" }', expect=FIELD_NOT),
    dict(id="job-not-counted", file=F_JOBS, old='  noteRequest(save, { kind: "job", spot: job.spot }, t); // a finished job only: a call back does not come through here\n', new="", expect=JOB),
    dict(id="call-back-counted-as-job", file=F_JOBS, old="  c.job = null;\n  if (coins + amount > 0) {", new='  c.job = null;\n  noteRequest(save, { kind: "job", spot: job.spot }, nowMs);\n  if (coins + amount > 0) {', expect=JOB_NOT),
    dict(id="fight-not-counted", file=F_FIGHT, old='  noteRequest(save, { kind: "fight" }, nowMs);\n', new="", expect=FIGHT),
    dict(id="loss-counted-as-win", file=F_FIGHT, old="  if (!won) {\n    c.hp", new='  if (!won) {\n    noteRequest(save, { kind: "fight" }, nowMs);\n    c.hp', expect=FIGHT),
    # a purchase (edge 11)
    dict(id="buy-counted-at-the-purchase", file=F_REQ, old="return last === null || last.item !== id || t - last.at > tuning.shop.undoSeconds * 1000;", new="return true;", expect=BUY_AFTER),
    dict(id="unowned-purchase-counted", file=F_REQ, old="  if (!save.owned.includes(id)) return false;\n  const last = save.lastBuy;", new="  const last = save.lastBuy;", expect=BUY_WINDOW),
    dict(id="future-purchase-counted", file=F_REQ, old="t - last.at > tuning.shop.undoSeconds * 1000;", new="Math.abs(t - last.at) > tuning.shop.undoSeconds * 1000;", expect=BUY_FUTURE),
    dict(id="window-includes-10s", file=F_REQ, old="t - last.at > tuning.shop.undoSeconds * 1000;", new="t - last.at >= tuning.shop.undoSeconds * 1000;", expect=BUY_WINDOW),
    dict(id="earlier-purchase-stays-undoable", file=F_REQ, old="last === null || last.item !== id || t - last.at", new="last === null || t - last.at", expect=BUY_LATER),
    # paying (edges 13 to 15)
    dict(id="stale-after-a-minute-less", file=F_REQ, old="t - oldest.drewAt >= requestTuning.staleDays * DAY", new="t - oldest.drewAt >= requestTuning.staleDays * DAY - MINUTE", expect=STALE),
    dict(id="stale-not-at-exactly-3-days", file=F_REQ, old="t - oldest.drewAt >= requestTuning.staleDays * DAY", new="t - oldest.drewAt > requestTuning.staleDays * DAY", expect=STALE),
    dict(id="stale-rounded-down", file=F_REQ, old="Math.ceil(base * (1 + requestTuning.staleBonus))", new="Math.floor(base * (1 + requestTuning.staleBonus))", expect=STALE),
    dict(id="stale-on-every-request", file=F_REQ, old="return staleRequest(board, t) === r ?", new="return staleRequest(board, t) !== null ?", expect=STALE_ONLY),
    dict(id="stale-goes-to-the-newest", file=F_REQ, old="a.drewAt - b.drewAt || a.id - b.id", new="b.drewAt - a.drewAt || a.id - b.id", expect=STALE_ONLY),
    dict(id="stale-tie-goes-to-the-higher-id", file=F_REQ, old="a.drewAt - b.drewAt || a.id - b.id", new="a.drewAt - b.drewAt || b.id - a.id", expect=STALE_ONLY),
    dict(id="item-paid-twice", file=F_REQ, old="if (r.item !== null && !save.owned.includes(r.item)) {", new="if (r.item !== null) {", expect=ITEM_OWNED),
    dict(id="one-completion-a-minute", file=F_REQ, old='for (const r of [...board.open]) if (r.type === "buy" && purchaseCounted(save, r.target as string, t)) complete(save, r, t);', new='const first = board.open.find((r) => r.type === "buy" && purchaseCounted(save, r.target as string, t));\n  if (first) complete(save, first, t);', expect=TWO),
    dict(id="reward-wallpaper-hung", file=F_REQ, old="save.owned.push(r.item); // (owned, not hung", new='save.owned.push(r.item);\n    if (r.item.startsWith("wall-")) save.wall = r.item; // (owned, not hung', expect=WALL),
    dict(id="no-coins-paid", file=F_REQ, old="  save.coins += coins;\n", new="", expect=PAYS),
    # the clamps and the fit check (edges 16, 18)
    dict(id="drewat-clamp-removed", file=F_REQ, old="for (const r of board.open) r.drewAt = Math.min(r.drewAt, t);", new="", expect=CLAMP),
    dict(id="doneat-clamp-removed", file=F_REQ, old="for (const w of board.waits) w.doneAt = Math.min(w.doneAt, t);", new="", expect=CLAMP),
    dict(id="fit-missing-for-feed", file=F_REQ, old="return menuOf(c).includes(r.target as FoodId);", new="return true;", expect=FIT_DROPS),
    dict(id="fit-missing-for-job", file=F_REQ, old="return opensAt(c, spots[r.target as SpotId].minStage);", new="return true;", expect=FIT_DROPS),
    dict(id="fit-missing-for-fight", file=F_REQ, old="return opensAt(c, combatTuning.minStage);", new="return true;", expect=FIT_DROPS),
    dict(id="fit-missing-for-buy", file=F_REQ, old="return save.owned.includes(r.target as string) || payable(save, c, r.target as ItemId);", new="return true;", expect=FIT_DROPS),
    dict(id="request-lost-after-3-days", file=F_REQ, old="board.open = board.open.filter((r) => fits(save, c, r));", new="board.open = board.open.filter((r) => fits(save, c, r) && t - r.drewAt < 3 * DAY);", expect=UNTOUCHED7),
    dict(id="fit-drops-everything", file=F_REQ, old="board.open = board.open.filter((r) => fits(save, c, r));", new="board.open = [];", expect=FIT_EVO),
    # a saved board (edge 19)
    dict(id="migrate-keeps-a-bad-target", file=F_BOARD, old="if (!isWhole(v.id) || !targetOk(type, v.target) || !isItemOrNone(v.item)) return null;", new="if (!isWhole(v.id) || !isItemOrNone(v.item)) return null;", expect=MIG_BAD),
    dict(id="migrate-trusts-inherited-keys", file=F_BOARD, old="Object.hasOwn(foods, target)", new="target in foods", expect=MIG_BAD),
    dict(id="migrate-keeps-nan", file=F_BOARD, old='typeof v.have !== "number" || !Number.isFinite(v.have) ||', new='typeof v.have !== "number" ||', expect=MIG_BAD),
    dict(id="migrate-keeps-stored-coins", file=F_BOARD, old="return { id: v.id, type, target:", new="return { ...(v as object), id: v.id, type, target:", expect=MIG_CLAMP),
    dict(id="migrate-have-unclamped", file=F_BOARD, old="have: Math.min(requestTuning.need[type], Math.max(0, v.have))", new="have: v.have", expect=MIG_CLAMP),
    dict(id="migrate-coins-unclamped", file=F_BOARD, old="coins: Math.min(requestTuning.paidMax, Math.max(0, Math.round(v.coins)))", new="coins: v.coins", expect=MIG_WAIT),
    dict(id="migrate-no-open-cap", file=F_BOARD, old="    .slice(0, requestTuning.slots);", new="", expect=MIG_CAP),
    dict(id="migrate-no-wait-cap", file=F_BOARD, old=".slice(0, requestTuning.slots - open.length);", new=";", expect=MIG_CAP),
    dict(id="migrate-keeps-duplicate-ids", file=F_BOARD, old="if (ids.has(r.id) || asked.has(key)) return false;", new="if (asked.has(key)) return false;", expect=MIG_DUP),
    dict(id="migrate-keeps-duplicate-targets", file=F_BOARD, old="if (ids.has(r.id) || asked.has(key)) return false;", new="if (ids.has(r.id)) return false;", expect=MIG_DUP),
    dict(id="migrate-drawn-not-raised", file=F_BOARD, old="Math.max(isWhole(v.drawn) ? v.drawn : 0, ...open.map((r) => r.id + 1))", new="isWhole(v.drawn) ? v.drawn : 0", expect=MIG_DRAWN),
    # the note over the room (decision 9)
    dict(id="note-states-an-amount-it-lost", file=F_REQ, old="if (waits.length < count) return head;", new="if (false) return head;", expect=NO_AMOUNT),
    dict(id="note-never-said", file=F_GAME, old="if (done > this.seenDone) this.say(paidNote(waits, done - this.seenDone));", new="if (done > this.seenDone && false) this.say(paidNote(waits, done - this.seenDone));", expect="says it over the room when the player's meal finishes the request", expect_file=NOTE_FILE),
    dict(id="note-for-a-game-put-in", file=F_GAME, old="this.seenDone = save.board.done; // a game put in from the account is not announced", new="this.seenDone = 0; // a game put in from the account is not announced", expect="nothing for a game put in with payments already in it", expect_file=NOTE_FILE),
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
