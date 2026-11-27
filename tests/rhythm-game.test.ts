// Rhythm Grove in the game: what a run pays, the words on the cards and the session on `Game` (src/game/training.ts, src/ui/game.ts, docs/adult-a4-plan.md section 2, edge cases 15 to 19).
// The expected numbers are worked out by hand in the comments or written as literals, not read from the code.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newRhythm, stepRhythm, tapRhythm } from "../src/game/rhythm";
import type { RhythmState } from "../src/game/rhythm";
import { catchBug, newBugCatch, pause, payRhythm, payTraining, resultLines, resume, startLine, step } from "../src/game/training";
import type { BugCatchState, TrainResult } from "../src/game/training";
import { localDay } from "../src/game/time";
import { writeSave } from "../src/sync/local";
import { Game } from "../src/ui/game";
import { aliveSave, at, careState, stageForm } from "./helpers";

vi.mock("../src/sync/local", () => ({ writeSave: vi.fn(() => Promise.resolve()) }));

const NOW = at(10);

// A finished Land run of `stage` with chosen counts (the score is worked out from them: 100 a Perfect, 60 a Good, 30 off for each stray).
function finished(stage: "kid" | "young" | "adult", perfects: number, goods: number, strays = 0, misses = 0, best = 0): RhythmState {
  const score = Math.max(0, 100 * perfects + 60 * goods - 30 * strays);
  return { ...newRhythm("land", stage), perfects, goods, strays, misses, best, score, over: true };
}

const bugRun = (stage: "kid" | "young" | "adult", score: number, catches: number): BugCatchState => ({ ...newBugCatch(1, stage), score, catches, over: true });

describe("what a Rhythm Grove run pays (edge case 15)", () => {
  const adultSave = () => aliveSave(stageForm("adult"), NOW);

  it("pays a Gold run +2 Spirit, +2 Discipline and 30 Bond XP, counts it for Spirit alone, and writes one log line", () => {
    const save = adultSave();
    const c = save.creature!;
    const logBefore = save.log.length;
    const discipline = c.stats.discipline;
    // all 144 notes of Land's adult song Perfect: 14,400 points, 100 percent
    const r = payRhythm(save, c, finished("adult", 144, 0, 0, 0, 144), NOW) as TrainResult;
    expect([r.game, r.stat, r.counted, r.band, r.score, r.catches, r.tier, r.points, r.capped, r.discipline, r.bondXp]).toEqual(["rhythm", "spi", true, "gold", 14_400, 144, "full", 2, false, 2, 30]);
    expect(r.rhythm).toEqual({ perfects: 144, goods: 0, missed: 0, strays: 0, best: 144 });
    expect(c.trained?.spi).toBe(2);
    expect(c.trained?.spd).toBeUndefined();
    expect(c.training).toEqual({ day: localDay(NOW), sessions: { spi: 1 } });
    expect(c.stats.discipline).toBe(discipline + 2);
    expect(save.log.length).toBe(logBefore + 1);
    expect(save.log.at(-1)?.text).toBe("Rhythm Grove: gold, 14400 points, 2 Spirit, 30 Bond XP");
  });

  it("pays Bronze and Silver +1 Spirit in a full session and nothing in a half one, then Bond XP only", () => {
    const save = adultSave();
    const c = save.creature!;
    const points: number[] = [];
    const tiers: string[] = [];
    const bondXp: number[] = [];
    // 100 Goods in 144 notes and 44 missed: 6,000 points, 41.7 percent: Bronze. 120 Perfects and 24 missed: 12,000 points, 83.3 percent (Silver from 75, Gold from 85): Silver.
    for (let i = 0; i < 7; i++) {
      const bronze = i % 2 === 0;
      const r = payRhythm(save, c, bronze ? finished("adult", 0, 100, 0, 44) : finished("adult", 120, 0, 0, 24), NOW) as TrainResult;
      expect(r.band).toBe(bronze ? "bronze" : "silver");
      points.push(r.points);
      tiers.push(r.tier);
      bondXp.push(r.bondXp);
    }
    expect(points).toEqual([1, 1, 1, 0, 0, 0, 0]);
    expect(bondXp, "Bond XP 10 for Bronze and 20 for Silver, at every tier").toEqual([10, 20, 10, 20, 10, 20, 10]);
    expect(tiers).toEqual(["full", "full", "full", "half", "half", "half", "none"]);
    expect(c.trained?.spi).toBe(3);
    expect(c.training?.sessions).toEqual({ spi: 6 });
  });

  it("keeps Spirit's count apart from Speed's: three Bug Catch sessions leave Rhythm Grove's first one full", () => {
    const save = adultSave();
    const c = save.creature!;
    for (let i = 0; i < 3; i++) payTraining(save, c, bugRun("adult", 5000, 20), NOW);
    expect(c.training?.sessions).toEqual({ spd: 3 });
    const r = payRhythm(save, c, finished("adult", 144, 0), NOW) as TrainResult;
    expect(r.tier).toBe("full");
    expect(c.training?.sessions).toEqual({ spd: 3, spi: 1 });
    const bug = payTraining(save, c, bugRun("adult", 5000, 20), NOW) as TrainResult;
    expect(bug.tier, "Speed's fourth is a half session").toBe("half");
  });

  it("stops at the stage cap: a kid at 12 Spirit gets nothing and is told", () => {
    const save = aliveSave(stageForm("kid"), NOW);
    const c = save.creature!;
    c.trained = { spi: 12 };
    const r = payRhythm(save, c, finished("kid", 73, 0), NOW) as TrainResult;
    expect([r.points, r.capped, r.tier]).toEqual([0, true, "full"]);
    expect(c.trained.spi).toBe(12);
    expect(resultLines(r)[2]).toBe("Spirit is as high as it can go for now");
  });

  it("pays nothing and counts for nothing for a run that hit no note, even with strays, and says so in words", () => {
    const save = adultSave();
    const before = JSON.stringify(save);
    const r = payRhythm(save, save.creature, finished("adult", 0, 0, 5, 144), NOW) as TrainResult;
    expect([r.counted, r.points, r.discipline, r.bondXp, r.level, r.score]).toEqual([false, 0, 0, 0, null, 0]);
    expect(JSON.stringify(save)).toBe(before);
    expect(resultLines(r)).toEqual(["No notes hit: nothing to pay."]);
  });

  it("pays nobody when there is no creature, it is dead, or it is away", () => {
    const away = adultSave();
    away.creature!.job = { kind: "wood", startedAt: NOW, endsAt: NOW + 60_000 } as never;
    expect(payRhythm(away, away.creature, finished("adult", 144, 0), NOW)).toBeNull();
    expect(payRhythm(adultSave(), null, finished("adult", 144, 0), NOW)).toBeNull();
    const dead = adultSave();
    dead.phase = "dead";
    expect(payRhythm(dead, dead.creature, finished("adult", 144, 0), NOW)).toBeNull();
  });

  it("reads a stat missing from the day's sessions as 0", () => {
    const save = adultSave();
    const c = save.creature!;
    c.training = { day: localDay(NOW), sessions: { spd: 6 } };
    const r = payRhythm(save, c, finished("adult", 144, 0), NOW) as TrainResult;
    expect([r.tier, c.training.sessions]).toEqual(["full", { spd: 6, spi: 1 }]);
  });
});

describe("the words (edge case 19)", () => {
  it("names the reward of the next session for each game from the number already counted today", () => {
    const words = (game: "bug" | "rhythm") => [0, 1, 2, 3, 4, 5, 6].map((n) => startLine(game, n));
    expect(words("rhythm")).toEqual([
      "Spirit: full reward, 1 of 3 today",
      "Spirit: full reward, 2 of 3 today",
      "Spirit: full reward, 3 of 3 today",
      "Spirit: half reward, 1 of 3 today",
      "Spirit: half reward, 2 of 3 today",
      "Spirit: half reward, 3 of 3 today",
      "Spirit: Bond XP only today",
    ]);
    expect(words("bug")[0]).toBe("Speed: full reward, 1 of 3 today");
    expect(words("bug")[6]).toBe("Speed: Bond XP only today");
  });

  const result = (over: Partial<TrainResult>): TrainResult => ({
    game: "rhythm",
    stat: "spi",
    counted: true,
    band: "silver",
    score: 6100,
    catches: 71,
    tier: "full",
    points: 1,
    capped: false,
    discipline: 1,
    bondXp: 20,
    level: null,
    rhythm: { perfects: 52, goods: 19, missed: 10, strays: 3, best: 23 },
    ...over,
  });

  it("says what each kind of result paid, with the count line", () => {
    expect(resultLines(result({}))).toEqual([
      "Silver: 6100 points, 71 notes hit",
      "Perfect 52, Good 19, missed 10, no note 3, best streak 23",
      "+1 Spirit",
      "+1 Discipline",
      "+20 Bond XP",
    ]);
    expect(resultLines(result({ catches: 1 }))[0]).toBe("Silver: 6100 points, 1 note hit");
    expect(resultLines(result({ tier: "half", points: 0 }))[2]).toBe("No Spirit from this one: half rewards round down");
    expect(resultLines(result({ tier: "none", points: 0 }))[2]).toBe("Bond XP only now: today's Spirit sessions are used up");
    expect(resultLines(result({ rhythm: undefined, game: "bug", stat: "spd" }))[0]).toBe("Silver: 6100 points, 71 caught");
  });
});

describe("a Rhythm Grove session on the game (edge cases 16 to 18)", () => {
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

  // Play the run to its end tapping every note on the beat, as the overlay's frame loop would (the engine's functions on `game.training.run`).
  function playPerfect(): void {
    const run = game.training!.run as RhythmState;
    while (!run.over) {
      stepRhythm(run, 10);
      if (run.notes.some((n) => n.t >= run.elapsedMs && n.t < run.elapsedMs + 10)) tapRhythm(run); // the step the note falls in
    }
  }

  it("opens on Bug Catch, takes a pick only while the card shows, and ignores a game that does not exist", () => {
    start();
    game.startTraining();
    expect([game.training!.game, game.trainPick]).toEqual(["bug", "bug"]);
    game.pickTrainGame("rhythm");
    expect([game.training!.game, game.trainPick]).toEqual(["rhythm", "rhythm"]);
    game.pickTrainGame("stack" as never);
    expect(game.training!.game).toBe("rhythm");
    game.beginTraining();
    game.pickTrainGame("bug");
    expect([game.training!.game, game.training!.phase, game.trainPick], "no change once the run has begun").toEqual(["rhythm", "playing", "rhythm"]);
  });

  it("does nothing for a pick when no card is open, and keeps the pick for the next card of the visit", () => {
    start();
    game.pickTrainGame("rhythm");
    expect([game.training, game.trainPick]).toEqual([null, "bug"]);
    game.startTraining();
    game.pickTrainGame("rhythm");
    game.closeTraining();
    game.startTraining();
    expect(game.training!.game).toBe("rhythm");
  });

  it("leaves the save byte-identical and writes nothing through start, a pick, Go, a Perfect and a stray made on the run itself, a pause and Quit, with no tick of the game's own", () => {
    start();
    const before = JSON.stringify(game.save);
    game.startTraining();
    game.pickTrainGame("rhythm");
    game.beginTraining();
    const run = game.training!.run as RhythmState;
    while (run.elapsedMs < 2030) stepRhythm(run, 10);
    expect(tapRhythm(run)).toEqual({ judge: "perfect", deltaMs: 30 }); // the first note, due at 2000 ms
    expect(tapRhythm(run)).toEqual({ judge: "stray", deltaMs: 0 }); // nothing else is near
    pause(run);
    resume(run);
    game.closeTraining();
    vi.advanceTimersByTime(60_000);
    expect(JSON.stringify(game.save)).toBe(before);
    expect(vi.mocked(writeSave)).not.toHaveBeenCalled();
    expect(game.training).toBeNull();
  });

  it("begins the song of the creature's own field with no random draw, Land's for a form that has no field", () => {
    for (const [form, field] of [["gravelhorn", "land"], ["murkfang", "water"], ["ashwing", "sky"], ["pebblin", "land"], ["dustpuff", "land"]] as const) {
      start(form);
      game.startTraining();
      game.pickTrainGame("rhythm");
      const random = vi.spyOn(Math, "random");
      game.beginTraining();
      expect(random, `${form} draws nothing`).not.toHaveBeenCalled();
      random.mockRestore();
      const run = game.training!.run as RhythmState;
      expect([form, run.field, run.stage, run.times[0]], form).toEqual([form, field, game.training!.stage, 2000]);
    }
    start("ashwing");
    game.startTraining();
    game.pickTrainGame("rhythm");
    game.beginTraining();
    expect((game.training!.run as RhythmState).times.length, "Sky's adult song").toBe(131);
  });

  it("pays a played run as Spirit, once, and saves it as a player action", () => {
    start("gravelhorn");
    game.startTraining();
    game.pickTrainGame("rhythm");
    game.beginTraining();
    playPerfect();
    const run = game.training!.run as RhythmState;
    expect([run.perfects, run.score]).toEqual([144, 14_400]);
    const told: boolean[] = [];
    game.onSave = (byPlayer) => told.push(byPlayer);
    game.finishTraining();
    const t = game.training!;
    expect([t.phase, (t.result as TrainResult).stat, (t.result as TrainResult).band, (t.result as TrainResult).points]).toEqual(["done", "spi", "gold", 2]);
    expect(game.save.creature!.trained?.spi).toBe(2);
    expect(game.save.creature!.training?.sessions).toEqual({ spi: 1 });
    vi.advanceTimersByTime(5000);
    expect(told, "saved once, as the player's change").toEqual([true]);
    game.finishTraining();
    vi.advanceTimersByTime(5000);
    expect(game.save.creature!.trained?.spi, "a second finish pays nothing more").toBe(2);
    expect(told).toEqual([true]);
  });

  it("pays nobody when the creature is replaced before the run is paid", () => {
    start("gravelhorn");
    game.startTraining();
    game.pickTrainGame("rhythm");
    game.beginTraining();
    playPerfect();
    game.save.creature!.bornAt += 1;
    game.changed();
    expect(game.training).toBeNull();
    game.finishTraining();
    expect(game.save.creature!.trained?.spi).toBeUndefined();
  });

  it("starts a burst as Bug Catch whatever the pick, and leaves the pick alone", () => {
    start("gravelhorn", { place: "land" });
    game.trainPick = "rhythm";
    expect(game.startBurst()).toBe("started");
    const t = game.training!;
    expect([t.game, t.burst, game.trainPick]).toEqual(["bug", "land", "rhythm"]);
    const run = t.run as BugCatchState;
    while (run.bugs.length === 0) step(run, 10);
    catchBug(run, run.bugs[0]!.id);
    while (!run.over) step(run, 100);
    game.finishTraining();
    expect((t.result as { burst?: true }).burst).toBe(true);
    expect(game.save.creature!.trained?.spi).toBeUndefined();
  });
});
