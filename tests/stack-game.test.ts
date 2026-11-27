// Stack & Balance in the game: what a run pays, the words on the cards and the session on `Game` (src/game/training.ts, src/ui/game.ts, docs/adult-a4-plan.md section 6, edge cases 17 to 21).
// The expected numbers are worked out by hand in the comments or written as literals, not read from the code.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { blockX, dropStack, newStack, stepStack } from "../src/game/stack";
import type { StackState } from "../src/game/stack";
import { catchBug, newBugCatch, payRhythm, payStack, payTraining, pause, resultLines, resume, startLine, step } from "../src/game/training";
import type { BugCatchState, TrainResult } from "../src/game/training";
import { newRhythm } from "../src/game/rhythm";
import { localDay } from "../src/game/time";
import { writeSave } from "../src/sync/local";
import { Game } from "../src/ui/game";
import { aliveSave, at, careState, stageForm } from "./helpers";
import { firstPerfectStep } from "./stackBot";

vi.mock("../src/sync/local", () => ({ writeSave: vi.fn(() => Promise.resolve()) }));

const NOW = at(10);

type Stage = "kid" | "young" | "adult";

// A finished run of `stage` with chosen counts. The score is blockPoints plus 5 for each whole second of standMs. The counts are picked to land on a band line or a word, not reached by play (the Gold
// run below has more block points than 29 Perfects and 4 Goods can score, even in one unbroken streak): `payStack` reads only the score and the counts, so a state the engine cannot reach is a fair input to it.
function finished(stage: Stage, o: { perfects?: number; goods?: number; bad?: number; blockPoints?: number; standMs?: number; height?: number; best?: number; toppled?: boolean }): StackState {
  const s = newStack(stage);
  s.blocks = [{ x: 500, w: 300 }, ...Array.from({ length: o.height ?? (o.perfects ?? 0) + (o.goods ?? 0) }, () => ({ x: 500, w: 300 }))];
  Object.assign(s, {
    perfects: o.perfects ?? 0,
    goods: o.goods ?? 0,
    badDrops: o.bad ?? 0,
    blockPoints: o.blockPoints ?? 0,
    standMs: o.standMs ?? 0,
    best: o.best ?? 0,
    toppled: o.toppled ?? false,
    over: true,
  });
  return s;
}

// Adult Gold is 1,660: 1,300 block points and 72 whole seconds (360, the 600 ms over are not scored) reach it exactly.
const gold = (): StackState => finished("adult", { perfects: 29, goods: 4, blockPoints: 1300, standMs: 72_600, best: 12 });
// Adult Bronze: 70 block points and 65 seconds (325) make 395, under Silver (800).
const bronze = (): StackState => finished("adult", { perfects: 2, goods: 1, blockPoints: 70, standMs: 65_000, best: 2 });
// Adult Silver: 450 block points and 70 seconds (350) make 800, on the Silver line.
const silver = (): StackState => finished("adult", { perfects: 12, goods: 2, blockPoints: 450, standMs: 70_000, best: 6 });

const bugRun = (stage: Stage, score: number, catches: number): BugCatchState => ({ ...newBugCatch(1, stage), score, catches, over: true });

describe("what a Stack & Balance run pays (edge case 17)", () => {
  const adultSave = () => aliveSave(stageForm("adult"), NOW);

  it("pays a Gold run +2 Strength, +2 Discipline and 30 Bond XP, counts it for Strength alone, and writes one log line", () => {
    const save = adultSave();
    const c = save.creature!;
    const logBefore = save.log.length;
    const discipline = c.stats.discipline;
    const r = payStack(save, c, gold(), NOW) as TrainResult;
    expect([r.game, r.stat, r.counted, r.band, r.score, r.catches, r.tier, r.points, r.capped, r.discipline, r.bondXp]).toEqual(["stack", "str", true, "gold", 1660, 33, "full", 2, false, 2, 30]);
    expect(r.stack).toEqual({ height: 33, perfects: 29, goods: 4, badDrops: 0, toppled: false, standSeconds: 72, best: 12 });
    expect(c.trained?.str).toBe(2);
    expect([c.trained?.spd, c.trained?.spi]).toEqual([undefined, undefined]);
    expect(c.training).toEqual({ day: localDay(NOW), sessions: { str: 1 } });
    expect(c.stats.discipline).toBe(discipline + 2);
    expect(save.log.length).toBe(logBefore + 1);
    expect(save.log.at(-1)?.text).toBe("Stack & Balance: gold, 1660 points, 2 Strength, 30 Bond XP");
  });

  it("pays Bronze and Silver +1 Strength in a full session and nothing in a half one, then Bond XP only", () => {
    const save = adultSave();
    const c = save.creature!;
    const points: number[] = [];
    const tiers: string[] = [];
    const bondXp: number[] = [];
    for (let i = 0; i < 7; i++) {
      const isBronze = i % 2 === 0;
      const r = payStack(save, c, isBronze ? bronze() : silver(), NOW) as TrainResult;
      expect([r.band, r.score]).toEqual(isBronze ? ["bronze", 395] : ["silver", 800]);
      points.push(r.points);
      tiers.push(r.tier);
      bondXp.push(r.bondXp);
    }
    expect(points).toEqual([1, 1, 1, 0, 0, 0, 0]);
    expect(bondXp, "Bond XP 10 for Bronze and 20 for Silver, at every tier").toEqual([10, 20, 10, 20, 10, 20, 10]);
    expect(tiers).toEqual(["full", "full", "full", "half", "half", "half", "none"]);
    expect(c.trained?.str).toBe(3);
    expect(c.training?.sessions).toEqual({ str: 6 });
  });

  it("keeps Strength's count apart from Speed's and Spirit's: three of each leave Stack & Balance's first one full", () => {
    const save = adultSave();
    const c = save.creature!;
    for (let i = 0; i < 3; i++) {
      payTraining(save, c, bugRun("adult", 5000, 20), NOW);
      payRhythm(save, c, { ...newRhythm("land", "adult"), perfects: 144, score: 14_400, over: true }, NOW);
    }
    expect(c.training?.sessions).toEqual({ spd: 3, spi: 3 });
    const r = payStack(save, c, gold(), NOW) as TrainResult;
    expect([r.tier, r.points]).toEqual(["full", 2]);
    expect(c.training?.sessions).toEqual({ spd: 3, spi: 3, str: 1 });
    expect(payTraining(save, c, bugRun("adult", 5000, 20), NOW)!.tier, "Speed's fourth is a half session").toBe("half");
  });

  it("stops at the stage cap: a kid at 12 Strength gets nothing and is told", () => {
    const save = aliveSave(stageForm("kid"), NOW);
    const c = save.creature!;
    c.trained = { str: 12 };
    const r = payStack(save, c, finished("kid", { perfects: 20, goods: 2, blockPoints: 900, standMs: 60_000 }), NOW) as TrainResult;
    expect([r.points, r.capped, r.tier]).toEqual([0, true, "full"]);
    expect(c.trained.str).toBe(12);
    expect(resultLines(r)[3]).toBe("Strength is as high as it can go for now");
  });

  it("counts a Good as a landed block: a run of Goods alone is paid", () => {
    const save = adultSave();
    const r = payStack(save, save.creature, finished("adult", { goods: 3, blockPoints: 30, standMs: 10_000 }), NOW) as TrainResult;
    expect([r.counted, r.band, r.score, r.catches, r.points, r.stack?.goods, r.stack?.perfects]).toEqual([true, "bronze", 80, 3, 1, 3, 0]);
  });

  it("pays nothing and counts for nothing for a run where no Perfect or Good landed, even with a bad drop and a topple, and says so", () => {
    const save = adultSave();
    const before = JSON.stringify(save);
    const r = payStack(save, save.creature, finished("adult", { bad: 2, toppled: true }), NOW) as TrainResult;
    expect([r.counted, r.points, r.discipline, r.bondXp, r.level, r.score]).toEqual([false, 0, 0, 0, null, 0]);
    expect(JSON.stringify(save)).toBe(before);
    expect(resultLines(r)).toEqual(["No block landed: nothing to pay."]);
  });

  it("pays a run that fell after blocks had landed for the blocks and the seconds it stood, and says it fell", () => {
    // 2 Perfects in a row (20 and 25) and a Good (10) make 55 block points, and the stack stood 3.9 seconds, 3 whole (15): 70, Bronze, a full session's +1 Strength
    const save = adultSave();
    const c = save.creature!;
    const r = payStack(save, c, finished("adult", { perfects: 2, goods: 1, bad: 2, blockPoints: 55, standMs: 3_900, best: 2, toppled: true }), NOW) as TrainResult;
    expect([r.counted, r.band, r.score, r.catches, r.points, r.stack?.toppled, r.stack?.badDrops, r.stack?.standSeconds]).toEqual([true, "bronze", 70, 3, 1, true, 2, 3]);
    expect(c.trained?.str).toBe(1);
    expect(c.training).toEqual({ day: localDay(NOW), sessions: { str: 1 } });
    expect(resultLines(r).slice(0, 3)).toEqual(["Bronze: 70 points, 3 blocks high", "Perfect 2, Good 1, bad drops 2, best combo 2", "The stack stood 3 seconds, then fell."]);
  });

  it("pays nobody when there is no creature, it is dead, or it is away", () => {
    const away = adultSave();
    away.creature!.job = { kind: "wood", startedAt: NOW, endsAt: NOW + 60_000 } as never;
    expect(payStack(away, away.creature, gold(), NOW)).toBeNull();
    expect(payStack(adultSave(), null, gold(), NOW)).toBeNull();
    const dead = adultSave();
    dead.phase = "dead";
    expect(payStack(dead, dead.creature, gold(), NOW)).toBeNull();
  });

  it("reads a stat missing from the day's sessions as 0", () => {
    const save = adultSave();
    const c = save.creature!;
    c.training = { day: localDay(NOW), sessions: { spd: 6 } };
    const r = payStack(save, c, gold(), NOW) as TrainResult;
    expect([r.tier, c.training.sessions]).toEqual(["full", { spd: 6, str: 1 }]);
  });
});

describe("the words (edge case 21)", () => {
  it("names the reward of the next session for each tier from the number already counted today", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((n) => startLine("stack", n))).toEqual([
      "Strength: full reward, 1 of 3 today",
      "Strength: full reward, 2 of 3 today",
      "Strength: full reward, 3 of 3 today",
      "Strength: half reward, 1 of 3 today",
      "Strength: half reward, 2 of 3 today",
      "Strength: half reward, 3 of 3 today",
      "Strength: Bond XP only today",
    ]);
    expect([startLine("bug", 0), startLine("rhythm", 0)]).toEqual(["Speed: full reward, 1 of 3 today", "Spirit: full reward, 1 of 3 today"]);
  });

  const result = (over: Partial<TrainResult>, stack: Partial<NonNullable<TrainResult["stack"]>> = {}): TrainResult => ({
    game: "stack",
    stat: "str",
    counted: true,
    band: "gold",
    score: 1234,
    catches: 31,
    tier: "full",
    points: 2,
    capped: false,
    discipline: 2,
    bondXp: 30,
    level: null,
    stack: { height: 31, perfects: 20, goods: 11, badDrops: 1, toppled: false, standSeconds: 74, best: 9, ...stack },
    ...over,
  });

  it("says what each kind of result paid, with the blocks, the count line and how long it stood", () => {
    expect(resultLines(result({}))).toEqual([
      "Gold: 1234 points, 31 blocks high",
      "Perfect 20, Good 11, bad drops 1, best combo 9",
      "The stack stood for 74 seconds.",
      "+2 Strength",
      "+2 Discipline",
      "+30 Bond XP",
    ]);
    expect(resultLines(result({ band: "silver" }))[0]).toBe("Silver: 1234 points, 31 blocks high");
    expect(resultLines(result({ band: "bronze" }))[0]).toBe("Bronze: 1234 points, 31 blocks high");
  });

  it("says one block, one second, and a fall", () => {
    const lines = resultLines(result({ band: "bronze", score: 395 }, { height: 1, standSeconds: 1 }));
    expect([lines[0], lines[2]]).toEqual(["Bronze: 395 points, 1 block high", "The stack stood for 1 second."]);
    expect(resultLines(result({}, { toppled: true, standSeconds: 43, badDrops: 2 }))[2]).toBe("The stack stood 43 seconds, then fell.");
    expect(resultLines(result({}, { toppled: true, standSeconds: 1, badDrops: 2 }))[2]).toBe("The stack stood 1 second, then fell.");
  });

  it("says why no Strength was paid, and the Bond level when one was reached", () => {
    expect(resultLines(result({ tier: "half", points: 0 }))[3]).toBe("No Strength from this one: half rewards round down");
    expect(resultLines(result({ tier: "none", points: 0 }))[3]).toBe("Bond XP only now: today's Strength sessions are used up");
    expect(resultLines(result({ capped: true, points: 0 }))[3]).toBe("Strength is as high as it can go for now");
    expect(resultLines(result({ level: 3 })).at(-1)).toBe("Bond level 3");
  });

  it("says when no block landed, and leaves the other two games' lines as they were", () => {
    expect(resultLines(result({ counted: false, band: "bronze", score: 0, catches: 0, stack: undefined }))).toEqual(["No block landed: nothing to pay."]);
    const bug: TrainResult = { game: "bug", stat: "spd", counted: true, band: "silver", score: 6100, catches: 71, tier: "full", points: 1, capped: false, discipline: 1, bondXp: 20, level: null };
    expect(resultLines(bug)).toEqual(["Silver: 6100 points, 71 caught", "+1 Speed", "+1 Discipline", "+20 Bond XP"]);
  });
});

describe("a Stack & Balance session on the game (edge cases 18 to 20)", () => {
  let game: Game;

  function start(form = stageForm("adult"), set: Parameters<typeof careState>[1] = {}): void {
    vi.setSystemTime(NOW);
    const save = careState(form, set, NOW);
    save.settings.adultMode = true;
    game = new Game(save);
    vi.mocked(writeSave).mockClear();
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", globalThis);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const run = (): StackState => game.training!.run as StackState;

  it("takes the pick only while the card shows, ignores a game that does not exist, and keeps the pick for the next card of the visit", () => {
    start();
    game.pickTrainGame("stack");
    expect([game.training, game.trainPick], "no card open").toEqual([null, "bug"]);
    game.startTraining();
    expect([game.training!.game, game.trainPick]).toEqual(["bug", "bug"]);
    game.pickTrainGame("stack");
    expect([game.training!.game, game.trainPick]).toEqual(["stack", "stack"]);
    game.pickTrainGame("sky" as never);
    expect(game.training!.game).toBe("stack");
    game.beginTraining();
    game.pickTrainGame("bug");
    expect([game.training!.game, game.training!.phase, game.trainPick], "no change once the run has begun").toEqual(["stack", "playing", "stack"]);
    game.closeTraining();
    game.startTraining();
    expect(game.training!.game).toBe("stack");
  });

  it("begins at the creature's own stage with no random draw, and the block moves at that stage's speed", () => {
    for (const [stage, x] of [["kid", 410], ["young", 470], ["adult", 510]] as const) {
      start(stageForm(stage));
      game.startTraining();
      game.pickTrainGame("stack");
      const random = vi.spyOn(Math, "random").mockImplementation(() => {
        throw new Error("Math.random was called");
      });
      game.beginTraining();
      random.mockRestore();
      expect([stage, run().stage, game.training!.stage, run().blocks, run().w]).toEqual([stage, stage, stage, [{ x: 500, w: 300 }], 300]);
      while (run().elapsedMs < 1000) stepStack(run(), 100);
      expect([stage, blockX(run())], "kid 410, young 470, adult 510 at one second").toEqual([stage, x]);
    }
  });

  it("leaves the save byte-identical and writes nothing through start, a pick, Go, a Perfect, a drop in the gap, a pause and Quit, with no tick of the game's own", () => {
    start();
    const before = JSON.stringify(game.save);
    game.startTraining();
    game.pickTrainGame("stack");
    game.beginTraining();
    while (run().elapsedMs < (firstPerfectStep("adult") as number)) stepStack(run(), 10);
    expect(dropStack(run())).toEqual({ judge: "perfect" });
    expect(dropStack(run()), "a drop in the gap does nothing").toBeNull();
    pause(run());
    resume(run());
    game.closeTraining();
    vi.advanceTimersByTime(60_000);
    expect(JSON.stringify(game.save)).toBe(before);
    expect(vi.mocked(writeSave)).not.toHaveBeenCalled();
    expect(game.training).toBeNull();
  });

  it("pays a played run as Strength, once, and saves it as a player action", () => {
    start();
    game.startTraining();
    game.pickTrainGame("stack");
    game.beginTraining();
    // one Perfect at adult's first whole step in the window (860 ms), then wait: 20 + 74 * 5 = 390, Bronze
    while (run().elapsedMs < 860) stepStack(run(), 10);
    expect(dropStack(run())).toEqual({ judge: "perfect" });
    while (!run().over) stepStack(run(), 100);
    expect([run().blockPoints, run().standMs]).toEqual([20, 74_140]);
    const told: boolean[] = [];
    game.onSave = (byPlayer) => told.push(byPlayer);
    game.finishTraining();
    const t = game.training!;
    const r = t.result as TrainResult;
    expect([t.phase, r.game, r.stat, r.band, r.score, r.points, r.discipline, r.bondXp]).toEqual(["done", "stack", "str", "bronze", 390, 1, 1, 10]);
    expect(game.save.creature!.trained?.str).toBe(1);
    expect(game.save.creature!.training?.sessions).toEqual({ str: 1 });
    vi.advanceTimersByTime(5000);
    expect(told, "saved once, as the player's change").toEqual([true]);
    game.finishTraining();
    vi.advanceTimersByTime(5000);
    expect(game.save.creature!.trained?.str, "a second finish pays nothing more").toBe(1);
    expect(game.save.creature!.training?.sessions).toEqual({ str: 1 });
    expect(told).toEqual([true]);
  });

  it("pays nothing for a run that fell before any block landed: two bad drops, no Strength, no session counted", () => {
    start();
    game.startTraining();
    game.pickTrainGame("stack");
    game.beginTraining();
    dropStack(run()); // at 0 ms the block's centre is at 150 and spans 0 to 300, no overlap with the base (350 to 650): a wobble
    while (run().elapsedMs < 410) stepStack(run(), 10);
    dropStack(run()); // adult at 410 ms: centre 298, spans 148 to 448, overlap 98 of 300 is under 35 percent: a second bad drop
    expect([run().toppled, run().over]).toEqual([true, true]);
    game.finishTraining();
    const r = game.training!.result as TrainResult;
    expect([r.counted, r.points, r.stack?.toppled, r.stack?.badDrops]).toEqual([false, 0, true, 2]);
    expect(game.save.creature!.trained?.str).toBeUndefined();
    expect(game.save.creature!.training).toBeUndefined();
  });

  it("pays nobody when the creature is replaced before the run is paid", () => {
    start();
    game.startTraining();
    game.pickTrainGame("stack");
    game.beginTraining();
    while (run().elapsedMs < 860) stepStack(run(), 10);
    dropStack(run());
    while (!run().over) stepStack(run(), 100);
    game.save.creature!.bornAt += 1;
    game.changed();
    expect(game.training).toBeNull();
    game.finishTraining();
    expect(game.save.creature!.trained?.str).toBeUndefined();
  });

  it("starts a burst as Bug Catch whatever the pick, and leaves the pick alone", () => {
    start(stageForm("adult"), { place: "land" });
    game.trainPick = "stack";
    expect(game.startBurst()).toBe("started");
    const t = game.training!;
    expect([t.game, t.burst, game.trainPick]).toEqual(["bug", "land", "stack"]);
    const bugs = t.run as BugCatchState;
    while (bugs.bugs.length === 0) step(bugs, 10);
    catchBug(bugs, bugs.bugs[0]!.id);
    while (!bugs.over) step(bugs, 100);
    game.finishTraining();
    expect((t.result as { burst?: true }).burst).toBe(true);
    expect(game.save.creature!.trained?.str).toBeUndefined();
  });
});
