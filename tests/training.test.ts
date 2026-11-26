// Bug Catch and the training session (src/game/training.ts, docs/adult-a3-plan.md section 10): who may train, the engine, the bands, what a run pays and the card words.
// The expected numbers are worked out by hand in the comments or written as literals, not read from the code.
import { describe, expect, it } from "vitest";
import { trainTuning } from "../src/data/training";
import type { TrainStage } from "../src/data/training";
import { bondOf } from "../src/game/bond";
import {
  bandOf,
  catchBug,
  coerceTraining,
  missTap,
  newBugCatch,
  pause,
  payTraining,
  resultLines,
  resume,
  startLine,
  step,
  tierOf,
  trainRefusal,
  trainedToday,
} from "../src/game/training";
import type { Bug, BugCatchState, TrainResult } from "../src/game/training";
import { localDay } from "../src/game/time";
import { aliveSave, at, careState, stageForm } from "./helpers";
import { playRun, scoresOf } from "./trainBot";

// Feed `ms` of time in frames of `frame` ms (the last one shorter).
function feed(s: BugCatchState, ms: number, frame = 10): void {
  for (let t = 0; t < ms; t += frame) step(s, Math.min(frame, ms - t));
}

// A bug that stays where it is (no heading), for the scoring tests.
const bug = (id: number, golden = false, x = 500, y = 500): Bug => ({ id, x, y, vx: 0, vy: 0, legMs: 999_999, ageMs: 0, golden });

// A finished run with a chosen score and number of catches.
const finished = (stage: TrainStage, score: number, catches = 10): BugCatchState => ({ ...newBugCatch(1, stage), score, catches, over: true });

// Scores that are Bronze, Silver and Gold (the lines are in data/training.ts; "the band lines" below checks each against its band): 10 and 5,000 are in the outer bands of every stage,
// and a Silver score lies between a stage's two lines, so it is a different number for each stage.
const SCORE = { bronze: 10, gold: 5000 };
const SILVER: Record<TrainStage, number> = { kid: 660, young: 800, adult: 860 };

describe("who may train", () => {
  it("lets an awake, well kid, young or adult creature train, whatever its energy and wherever it is", () => {
    for (const stage of ["kid", "young", "adult"]) expect(trainRefusal(careState(stageForm(stage), {}).creature!), stage).toBeNull();
    expect(trainRefusal(careState(stageForm("adult"), { energy: 0 }).creature!), "no energy cost, so no tired").toBeNull();
    expect(trainRefusal(careState(stageForm("adult"), { place: "land" }).creature!), "a field is not a reason").toBeNull();
  });

  it("refuses a baby, an away, asleep or sick creature, in the order away, asleep, sick, too young", () => {
    expect(trainRefusal(careState(stageForm("baby"), {}).creature!)).toBe("too-young");
    expect(trainRefusal(careState(stageForm("adult"), { away: true }).creature!)).toBe("busy");
    expect(trainRefusal(careState(stageForm("adult"), { sleep: "night" }).creature!)).toBe("asleep");
    expect(trainRefusal(careState(stageForm("adult"), { sick: true }).creature!)).toBe("sick");
    expect(trainRefusal(careState(stageForm("adult"), { away: true, sleep: "night", sick: true }).creature!)).toBe("busy");
    expect(trainRefusal(careState(stageForm("adult"), { sleep: "night", sick: true }).creature!)).toBe("asleep");
    expect(trainRefusal(careState(stageForm("baby"), { sick: true }).creature!)).toBe("sick");
  });
});

describe("the engine", () => {
  it("starts a 75 second run at time 0 with nothing on the field", () => {
    const s = newBugCatch(7, "kid");
    expect([s.lengthMs, s.elapsedMs, s.bugs.length, s.score, s.streak, s.over, s.paused]).toEqual([75_000, 0, 0, 0, 0, false, false]);
  });

  it("spawns a kid run's bugs on the hand-worked timetable (first at 400 ms, then every 1,400 ms, at most 3, a bug gone at 5,000 ms)", () => {
    // spawns: id 1 at 400, id 2 at 1,800, id 3 at 3,200; the 4th is due at 4,600 but the field is full, so it waits;
    // id 1 is 5,000 ms old at 5,400 and goes, and the waiting spawn (id 4) comes in the same step; the timer then runs 1,400 ms to 6,800, where id 2 goes and id 5 comes.
    const s = newBugCatch(7, "kid");
    const ids = (): number[] => s.bugs.map((b) => b.id);
    const at = (t: number): number[] => {
      feed(s, t - s.elapsedMs);
      return ids();
    };
    expect(at(390)).toEqual([]);
    expect(at(400)).toEqual([1]);
    expect(at(1790)).toEqual([1]);
    expect(at(1800)).toEqual([1, 2]);
    expect(at(3190)).toEqual([1, 2]);
    expect(at(3200)).toEqual([1, 2, 3]);
    expect(at(5390)).toEqual([1, 2, 3]);
    expect(at(5400)).toEqual([2, 3, 4]);
    expect(at(6790)).toEqual([2, 3, 4]);
    expect(at(6800)).toEqual([3, 4, 5]);
  });

  it("gives the same run for the same seed at any frame rate", () => {
    const end = (frame: number): string => {
      const s = newBugCatch(99, "adult");
      while (!s.over) step(s, frame);
      return JSON.stringify({ ...s, carryMs: 0 });
    };
    const reference = end(10);
    for (const frame of [8, 16, 33, 100]) expect(end(frame), `frames of ${frame} ms`).toBe(reference);
    const other = newBugCatch(100, "adult");
    while (!other.over) step(other, 10);
    expect(JSON.stringify({ ...other, carryMs: 0 })).not.toBe(reference);
  });

  it("keeps every bug inside the field and no more than the row allows, for a whole run of each stage", () => {
    const most = { kid: 3, young: 4, adult: 5 };
    for (const stage of ["kid", "young", "adult"] as const) {
      const s = newBugCatch(31, stage);
      let seen = 0;
      while (!s.over) {
        step(s, 10);
        seen = Math.max(seen, s.bugs.length);
        for (const b of s.bugs) {
          expect(b.x >= 60 && b.x <= 940 && b.y >= 60 && b.y <= 940, `${stage} bug ${b.id} at ${b.x}, ${b.y}`).toBe(true);
        }
        expect(s.bugs.length, stage).toBeLessThanOrEqual(most[stage]);
      }
      expect(seen, `${stage} fills the field now and then`).toBe(most[stage]);
    }
  });

  it("makes a golden bug faster than a plain one and lets it live as long", () => {
    const s = newBugCatch(5, "adult");
    s.spawnInMs = 999_999;
    const plain = bug(1);
    const gold = bug(2, true);
    Object.assign(plain, { ageMs: 3580 });
    Object.assign(gold, { ageMs: 3580 });
    s.bugs = [plain, gold];
    feed(s, 10);
    expect(s.bugs.map((b) => b.id), "both are 3,590 ms old: still there, the adult lifetime is 3,600").toEqual([1, 2]);
    feed(s, 10);
    expect(s.bugs, "both are 3,600 ms old now").toEqual([]);
    // speed: a spawned golden bug moves 1.5 times as far in a step (adult 280 units a second: 2.8 per step plain, 4.2 golden)
    let plainStep = 0;
    let goldStep = 0;
    for (let seed = 1; seed < 400 && (!plainStep || !goldStep); seed++) {
      const r = newBugCatch(seed, "adult");
      feed(r, 400);
      const b = r.bugs[0] as Bug;
      const speed = Math.hypot(b.vx, b.vy) * 1000;
      if (b.golden) goldStep = speed;
      else plainStep = speed;
    }
    expect(plainStep).toBeCloseTo(280, 6);
    expect(goldStep).toBeCloseTo(420, 6);
  });

  it("counts at most 100 ms of one call and none of a bad one", () => {
    const calls = [
      [99, 90, 9],
      [100, 100, 0],
      [101, 100, 0],
      [5000, 100, 0],
    ] as const;
    for (const [dt, elapsed, carry] of calls) {
      const s = newBugCatch(3, "kid");
      step(s, dt);
      expect([dt, s.elapsedMs, s.carryMs]).toEqual([dt, elapsed, carry]);
    }
    for (const dt of [-50, Number.NaN, Number.POSITIVE_INFINITY]) {
      const s = newBugCatch(3, "kid");
      step(s, dt);
      expect([dt, s.elapsedMs, s.carryMs]).toEqual([dt, 0, 0]);
    }
  });

  it("ends at exactly 75,000 ms of engine time, swept every millisecond around it", () => {
    const s = newBugCatch(11, "kid");
    let first = -1;
    for (let ms = 1; ms <= 75_010; ms++) {
      step(s, 1);
      if (ms >= 74_989 && ms <= 75_010) expect(s.over, `after ${ms} ms`).toBe(ms >= 75_000);
      if (s.over && first < 0) first = ms;
    }
    expect(first).toBe(75_000);
    expect(s.elapsedMs).toBe(75_000);
  });

  it("pays no time while paused, ignores taps while paused and goes on from the same place", () => {
    const s = newBugCatch(4, "kid");
    feed(s, 450);
    const id = (s.bugs[0] as Bug).id;
    pause(s);
    const frozen = JSON.stringify(s);
    step(s, 100);
    feed(s, 5000);
    expect(JSON.stringify(s)).toBe(frozen);
    expect(catchBug(s, id)).toBeNull();
    expect(missTap(s)).toBe(false);
    expect(JSON.stringify(s)).toBe(frozen);
    resume(s);
    step(s, 100);
    expect(s.elapsedMs).toBe(550);
    expect(catchBug(s, id)).toBe(10);
  });

  it("scores 10 a bug and 30 a golden one, doubles from the 5th catch of a streak and starts the streak again after a miss", () => {
    const s = newBugCatch(2, "adult");
    s.spawnInMs = 999_999;
    s.bugs = [1, 2, 3, 4, 5, 6, 8, 9].map((id) => bug(id)).concat([bug(7, true), bug(10, true)]);
    // streak 1 to 4: 10 each; the 5th and 6th: 20; a golden bug as the 7th: 30 x 2 = 60
    expect([1, 2, 3, 4, 5, 6, 7].map((id) => catchBug(s, id))).toEqual([10, 10, 10, 10, 20, 20, 60]);
    expect([s.score, s.catches, s.goldens, s.streak]).toEqual([140, 7, 1, 7]); // 4 x 10 + 2 x 20 + 60
    expect(missTap(s)).toBe(true);
    expect([s.score, s.streak, s.misses]).toEqual([140, 0, 1]); // a miss costs no points
    // after the miss: two plain catches at 10, then a golden bug as the 3rd catch of the new streak: 30
    expect([8, 9].map((id) => catchBug(s, id))).toEqual([10, 10]);
    expect(catchBug(s, 10)).toBe(30);
    expect(s.score).toBe(140 + 10 + 10 + 30);
  });

  it("does not catch a bug twice or one that is not there, and does not let an expired bug touch the streak or the score", () => {
    const s = newBugCatch(2, "adult");
    s.spawnInMs = 999_999;
    s.bugs = [bug(1), bug(2), bug(3), Object.assign(bug(4), { ageMs: 3590 })];
    expect(catchBug(s, 1)).toBe(10);
    expect(catchBug(s, 1)).toBeNull();
    expect(catchBug(s, 99)).toBeNull();
    expect(catchBug(s, 2)).toBe(10);
    feed(s, 10); // bug 4 is 3,600 ms old: gone, not a miss
    expect(s.bugs.map((b) => b.id)).toEqual([3]);
    expect([s.score, s.streak, s.misses, s.catches]).toEqual([20, 2, 0, 2]);
  });

  it("scores a catch when the 5th catch of a streak is the first one doubled, not the 4th and not the 6th", () => {
    const s = newBugCatch(2, "adult");
    s.spawnInMs = 999_999;
    s.bugs = [1, 2, 3, 4, 5].map((id) => bug(id));
    expect([1, 2, 3, 4, 5].map((id) => catchBug(s, id))).toEqual([10, 10, 10, 10, 20]);
  });

  it("has a tap that lands between bugs be a miss: it resets the streak and nothing else", () => {
    const s = newBugCatch(2, "kid");
    s.spawnInMs = 999_999;
    s.bugs = [bug(1), bug(2)];
    catchBug(s, 1);
    expect(missTap(s)).toBe(true);
    expect([s.streak, s.score, s.misses, s.bugs.length]).toEqual([0, 10, 1, 1]);
  });
});

describe("the band lines", () => {
  // The lines written from the stand-in's runs (tools/verify/train-bands.ts), pinned as literals: [stage, silver line, gold line].
  const LINES: Array<[TrainStage, number, number]> = [
    ["kid", 650, 690],
    ["young", 790, 840],
    ["adult", 850, 910],
  ];
  it("puts a score one under a line in the band below, on it in the band above, for every stage and both lines", () => {
    for (const [stage, silver, gold] of LINES) {
      expect(bandOf(silver - 1, stage), `${stage} silver - 1`).toBe("bronze");
      expect(bandOf(silver, stage), `${stage} silver`).toBe("silver");
      expect(bandOf(gold - 1, stage), `${stage} gold - 1`).toBe("silver");
      expect(bandOf(gold, stage), `${stage} gold`).toBe("gold");
      expect(bandOf(0, stage)).toBe("bronze");
    }
  });

  it("keeps the lines in order, the younger stage's lower, and the test scores in the band their names say", () => {
    for (const [stage, silver, gold] of LINES) {
      expect(trainTuning.rows[stage].silverAt, stage).toBe(silver);
      expect(trainTuning.rows[stage].goldAt, stage).toBe(gold);
      expect(silver).toBeLessThan(gold);
      expect([bandOf(SCORE.bronze, stage), bandOf(SILVER[stage], stage), bandOf(SCORE.gold, stage)], stage).toEqual(["bronze", "silver", "gold"]);
    }
    for (const line of ["silverAt", "goldAt"] as const) {
      expect(trainTuning.rows.kid[line], line).toBeLessThan(trainTuning.rows.young[line]);
      expect(trainTuning.rows.young[line], line).toBeLessThan(trainTuning.rows.adult[line]);
    }
    expect(trainTuning.rows.kid.speed).toBeLessThan(trainTuning.rows.young.speed);
    expect(trainTuning.rows.young.speed).toBeLessThan(trainTuning.rows.adult.speed);
    expect(trainTuning.rows.kid.most).toBeLessThan(trainTuning.rows.adult.most);
  });

  it("gives Gold to 20 to 30 percent of the stand-in player's runs in every stage (other seeds than the ones the lines were written from)", () => {
    for (const stage of ["kid", "young", "adult"] as const) {
      const scores = scoresOf(stage, 10_001, 1000);
      const share = scores.filter((x) => bandOf(x, stage) === "gold").length / scores.length;
      expect(share, `${stage}: ${(share * 100).toFixed(1)}%`).toBeGreaterThanOrEqual(0.2);
      expect(share, `${stage}: ${(share * 100).toFixed(1)}%`).toBeLessThanOrEqual(0.3);
    }
  });

  it("lets a stand-in play a run to the end, with catches that score at least 10 each (the bounds are checked above)", () => {
    const s = playRun(5, "adult");
    expect(s.over).toBe(true);
    expect(s.catches).toBeGreaterThan(0);
    expect(s.score).toBeGreaterThanOrEqual(s.catches * 10);
  });
});

describe("what a run pays", () => {
  // An adult creature on a fixed day, so nothing here depends on the real clock (the cap is 40: the stage cap does not get in the way).
  const adultSave = () => aliveSave(stageForm("adult"), at(10));
  const NOW = at(10);

  it("pays nothing and counts for nothing for a run with no catch", () => {
    const save = adultSave();
    const before = JSON.stringify(save);
    const r = payTraining(save, save.creature, finished("adult", 0, 0), NOW) as TrainResult;
    expect([r.counted, r.points, r.discipline, r.bondXp, r.level]).toEqual([false, 0, 0, 0, null]);
    expect(JSON.stringify(save)).toBe(before);
  });

  it("pays nobody when there is no living creature or it is away, and leaves the save as it was", () => {
    const dead = adultSave();
    dead.phase = "dead";
    const away = careState(stageForm("adult"), { away: true }, NOW);
    const egg = adultSave();
    egg.phase = "egg";
    egg.creature = null;
    for (const save of [dead, away, egg]) {
      const before = JSON.stringify(save);
      expect(payTraining(save, save.creature, finished("adult", SCORE.gold), NOW)).toBeNull();
      expect(JSON.stringify(save)).toBe(before);
    }
    expect(payTraining(adultSave(), null, finished("adult", SCORE.gold), NOW)).toBeNull();
  });

  it("pays Gold +2 Speed for the first 3 sessions of a day, +1 for the next 3 and none after, with the tiers named", () => {
    const save = adultSave();
    const c = save.creature!;
    const tiers: string[] = [];
    const speed: number[] = [];
    for (let i = 0; i < 8; i++) {
      const r = payTraining(save, c, finished("adult", SCORE.gold), NOW) as TrainResult;
      tiers.push(r.tier);
      speed.push(c.trained?.spd ?? 0);
    }
    expect(tiers).toEqual(["full", "full", "full", "half", "half", "half", "none", "none"]);
    expect(speed).toEqual([2, 4, 6, 7, 8, 9, 9, 9]);
    expect(c.training).toEqual({ day: localDay(NOW), sessions: { spd: 6 } });
  });

  it("pays Bronze and Silver +1 Speed for the first 3 sessions and 0 for the next 3 (half rounds down)", () => {
    for (const score of [SCORE.bronze, SILVER.adult]) {
      const save = adultSave();
      const c = save.creature!;
      const out: Array<[number, boolean]> = [];
      for (let i = 0; i < 6; i++) {
        const r = payTraining(save, c, finished("adult", score), NOW) as TrainResult;
        out.push([r.points, r.capped]);
      }
      expect(out, `score ${score}`).toEqual([[1, false], [1, false], [1, false], [0, false], [0, false], [0, false]]);
      expect(c.trained?.spd).toBe(3);
    }
  });

  it("starts the count again on a new day and keeps one count for a whole local day, across a daylight saving change", () => {
    const old = process.env.TZ;
    try {
      process.env.TZ = "America/New_York";
      const day = (h: number, m: number, d: number): number => new Date(2026, 2, d, h, m).getTime(); // 8 March 2026: the clocks go forward at 2:00
      const save = aliveSave(stageForm("adult"), day(0, 10, 8));
      const c = save.creature!;
      for (const when of [day(0, 30, 8), day(12, 0, 8), day(23, 30, 8)]) payTraining(save, c, finished("adult", SCORE.gold), when);
      expect(c.training?.sessions.spd, "three sessions on the 8th").toBe(3);
      const r = payTraining(save, c, finished("adult", SCORE.gold), day(0, 10, 9)) as TrainResult;
      expect([r.tier, c.training?.sessions.spd], "the 9th starts again").toEqual(["full", 1]);
    } finally {
      if (old === undefined) delete process.env.TZ;
      else process.env.TZ = old;
    }
  });

  it("follows the stored-day rule: a day before starts again, tomorrow keeps its counts and day and adds, two days ahead starts again", () => {
    const today = localDay(NOW);
    const run = (day: number): { r: TrainResult; c: ReturnType<typeof adultSave>["creature"] } => {
      const save = adultSave();
      save.creature!.training = { day, sessions: { spd: 3, str: 2 } };
      return { r: payTraining(save, save.creature, finished("adult", SCORE.gold), NOW) as TrainResult, c: save.creature };
    };
    let o = run(today - 1);
    expect([o.r.tier, o.c!.training]).toEqual(["full", { day: today, sessions: { spd: 1 } }]);
    o = run(today);
    expect([o.r.tier, o.c!.training]).toEqual(["half", { day: today, sessions: { spd: 4, str: 2 } }]);
    o = run(today + 1);
    expect([o.r.tier, o.c!.training]).toEqual(["half", { day: today + 1, sessions: { spd: 4, str: 2 } }]);
    o = run(today + 2);
    expect([o.r.tier, o.c!.training]).toEqual(["full", { day: today, sessions: { spd: 1 } }]);
    o = run(today + 4000);
    expect([o.r.tier, o.c!.training]).toEqual(["full", { day: today, sessions: { spd: 1 } }]);
  });

  it("reads the stored day the same way for the start card's count", () => {
    const save = adultSave();
    const c = save.creature!;
    const today = localDay(NOW);
    expect(trainedToday(c, "spd", today)).toEqual({ day: today, count: 0 });
    c.training = { day: today + 1, sessions: { spd: 4 } };
    expect(trainedToday(c, "spd", today)).toEqual({ day: today + 1, count: 4 });
    c.training = { day: today + 2, sessions: { spd: 4 } };
    expect(trainedToday(c, "spd", today)).toEqual({ day: today, count: 0 });
    c.training = { day: today - 1, sessions: { spd: 4 } };
    expect(trainedToday(c, "spd", today)).toEqual({ day: today, count: 0 });
    expect([0, 2, 3, 5, 6, 40].map(tierOf)).toEqual(["full", "full", "half", "half", "none", "none"]);
  });

  it("pays 0 points at the stage cap, says so, and still pays Bond XP and discipline and counts the session", () => {
    const save = aliveSave(stageForm("young"), NOW);
    const c = save.creature!;
    c.trained = { spd: 20 }; // the young cap
    const r = payTraining(save, c, finished("young", SCORE.gold), NOW) as TrainResult;
    expect([r.tier, r.points, r.capped, r.bondXp, r.discipline]).toEqual(["full", 0, true, 30, 2]);
    expect(resultLines(r), "the card says so").toContain("Speed is as high as it can go for now");
    expect([c.trained.spd, c.training?.sessions.spd]).toEqual([20, 1]);
    c.trained = { spd: 19 };
    const r2 = payTraining(save, c, finished("young", SCORE.gold), NOW) as TrainResult;
    expect([r2.points, r2.capped, c.trained.spd], "one point fits, so it is paid and not capped").toEqual([1, false, 20]);
  });

  it("reads the cap at the pay: a creature that grew up during the run pays with the adult cap", () => {
    const save = adultSave();
    const c = save.creature!;
    c.trained = { spd: 20 }; // would be the young cap; the creature is an adult now
    const r = payTraining(save, c, finished("young", SCORE.gold), NOW) as TrainResult; // the run was played at the young stage
    expect([r.points, c.trained.spd]).toEqual([2, 22]);
    expect(r.band, "the band is the run's, from the stage it was played at").toBe("gold");
  });

  it("pays Bond XP 10, 20 and 30 and discipline +1, +1 and +2 by band, stopping at 100 and at 15,000", () => {
    const out: number[][] = [];
    for (const score of [SCORE.bronze, SILVER.adult, SCORE.gold]) {
      const save = adultSave();
      const c = save.creature!;
      c.stats.discipline = 40;
      const r = payTraining(save, c, finished("adult", score), NOW) as TrainResult;
      out.push([r.bondXp, bondOf(c).xp, r.discipline, c.stats.discipline]);
    }
    expect(out).toEqual([
      [10, 10, 1, 41],
      [20, 20, 1, 41],
      [30, 30, 2, 42],
    ]);
    const save = adultSave();
    const c = save.creature!;
    c.stats.discipline = 99;
    c.bond = { xp: 14_995, chain: 0, at: 0 };
    const r = payTraining(save, c, finished("adult", SCORE.gold), NOW) as TrainResult;
    expect([r.discipline, c.stats.discipline, r.bondXp, bondOf(c).xp]).toEqual([1, 100, 5, 15_000]);
    const r2 = payTraining(save, c, finished("adult", SCORE.gold), NOW) as TrainResult;
    expect([r2.discipline, r2.bondXp, r2.level]).toEqual([0, 0, null]);
  });

  it("reports a Bond level once, when it is reached, and leaves the pet chain and the last pet time alone", () => {
    const save = adultSave();
    const c = save.creature!;
    c.bond = { xp: 290, chain: 3, at: 12_345 };
    const r = payTraining(save, c, finished("adult", SCORE.bronze), NOW) as TrainResult; // 290 + 10 = 300, the start of level 2
    expect([r.level, bondOf(c)]).toEqual([2, { xp: 300, chain: 3, at: 12_345 }]);
    const r2 = payTraining(save, c, finished("adult", SCORE.bronze), NOW) as TrainResult;
    expect([r2.level, bondOf(c).xp]).toEqual([null, 310]);
  });

  it("writes one dev-log line for a run that counted and none for one that did not", () => {
    const save = adultSave();
    const lines = save.log.length;
    payTraining(save, save.creature, finished("adult", SCORE.gold, 0), NOW);
    expect(save.log.length).toBe(lines);
    payTraining(save, save.creature, finished("adult", SCORE.gold), NOW);
    expect(save.log.length).toBe(lines + 1);
    expect(save.log[save.log.length - 1]?.text).toBe("Bug Catch: gold, 5000 points, 2 Speed, 30 Bond XP");
  });

  it("changes nothing else about the creature", () => {
    const save = adultSave();
    const c = save.creature!;
    const before = JSON.parse(JSON.stringify(c));
    payTraining(save, c, finished("adult", SILVER.adult), NOW);
    const after = JSON.parse(JSON.stringify(c));
    for (const key of ["trained", "training", "bond"]) delete after[key];
    after.stats.discipline = before.stats.discipline;
    expect(after).toEqual(before);
  });
});

describe("the training field read from storage", () => {
  it("keeps a whole, well-formed one and drops anything else without throwing", () => {
    const good = { day: 20_458, sessions: { spd: 3, str: 0 } };
    expect(coerceTraining(good)).toEqual(good);
    expect(coerceTraining({ ...good, extra: 1 })).toEqual(good);
    const bad: unknown[] = [
      undefined,
      null,
      "x",
      7,
      [],
      {},
      { day: 1 },
      { sessions: {} },
      { day: "1", sessions: {} },
      { day: -1, sessions: {} },
      { day: 1.5, sessions: {} },
      { day: Number.POSITIVE_INFINITY, sessions: {} },
      { day: Number.NaN, sessions: {} },
      { day: 1, sessions: [] },
      { day: 1, sessions: null },
      { day: 1, sessions: "spd" },
      { day: 1, sessions: { spd: -1 } },
      { day: 1, sessions: { spd: 1.5 } },
      { day: 1, sessions: { spd: 7 } },
      { day: 1, sessions: { spd: "3" } },
      { day: 1, sessions: { speed: 1 } },
    ];
    for (const value of bad) expect(coerceTraining(value), JSON.stringify(value)).toBeUndefined();
    expect(coerceTraining({ day: 0, sessions: { spd: 6 } })).toEqual({ day: 0, sessions: { spd: 6 } });
  });
});

describe("the words on the cards", () => {
  it("names the reward of the next session from the number already counted today", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(startLine)).toEqual([
      "Speed: full reward, 1 of 3 today",
      "Speed: full reward, 2 of 3 today",
      "Speed: full reward, 3 of 3 today",
      "Speed: half reward, 1 of 3 today",
      "Speed: half reward, 2 of 3 today",
      "Speed: half reward, 3 of 3 today",
      "Speed: Bond XP only today",
    ]);
  });

  const result = (over: Partial<TrainResult>): TrainResult => ({ counted: true, band: "silver", score: 340, catches: 21, tier: "full", points: 1, capped: false, discipline: 1, bondXp: 20, level: null, ...over });

  it("says what each kind of result paid", () => {
    expect(resultLines(result({}))).toEqual(["Silver: 340 points, 21 caught", "+1 Speed", "+1 Discipline", "+20 Bond XP"]);
    expect(resultLines(result({ band: "gold", points: 2, discipline: 2, bondXp: 30, level: 3 }))).toEqual(["Gold: 340 points, 21 caught", "+2 Speed", "+2 Discipline", "+30 Bond XP", "Bond level 3"]);
    expect(resultLines(result({ points: 0, capped: true }))[1]).toBe("Speed is as high as it can go for now");
    expect(resultLines(result({ tier: "half", points: 0 }))[1]).toBe("No Speed from this one: half rewards round down");
    expect(resultLines(result({ tier: "none", points: 0 }))[1]).toBe("Bond XP only now: today's Speed sessions are used up");
    expect(resultLines(result({ discipline: 0, bondXp: 0 }))).toEqual(["Silver: 340 points, 21 caught", "+1 Speed"]);
    expect(resultLines(result({ counted: false, catches: 0, score: 0 }))).toEqual(["No bugs caught: nothing to pay."]);
  });
});
