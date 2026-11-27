// The training session as the game holds it (src/ui/game.ts: startTraining, beginTraining, finishTraining, closeTraining), the words of a refusal, the loader for the creature's day count and the
// bug pictures (docs/adult-a3-plan.md section 10). The engine and the pay are in training.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { goldenBug, icons } from "../src/art/sprites";
import { tuning } from "../src/data/tuning";
import { retireCreature } from "../src/game/actions";
import { killCreature } from "../src/game/dev";
import { fightReason, trainReason } from "../src/game/reasons";
import { migrateSave, newSave } from "../src/game/state";
import { makeRng } from "../src/game/rng";
import { hatchIfReady, makeCreature } from "../src/game/sim";
import { HOUR, MINUTE } from "../src/game/time";
import { catchBug, missTap, pause, resume, step, trainRefusal } from "../src/game/training";
import type { BugCatchState, TrainResult } from "../src/game/training";
import { writeSave } from "../src/sync/local";
import { Game } from "../src/ui/game";
import type { StartTrainingResult } from "../src/ui/game";
import { aliveSave, at, careState, stageForm } from "./helpers";

// The write to the device is replaced (the real one needs a browser), as in game-note.test.ts.
vi.mock("../src/sync/local", () => ({ writeSave: vi.fn(() => Promise.resolve()) }));

const T0 = at(10);
let game: Game;
let told: boolean[];
let woken: number;

function start(opts: { adult?: boolean; form?: string; set?: Parameters<typeof careState>[1] } = {}): void {
  vi.setSystemTime(T0);
  const save = careState(opts.form ?? stageForm("adult"), opts.set ?? {}, T0);
  if (opts.adult !== false) save.settings.adultMode = true;
  game = new Game(save);
  told = [];
  woken = 0;
  game.onSave = (byPlayer) => told.push(byPlayer);
  game.subscribe(() => woken++);
  vi.mocked(writeSave).mockClear();
}

// Play the run to its end with one catch on the way, as the overlay would (engine functions on `game.training.run`).
function playOut(): void {
  const run = game.training!.run! as BugCatchState;
  while (run.bugs.length === 0) step(run, 10);
  catchBug(run, run.bugs[0]!.id);
  while (!run.over) step(run, 100);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", globalThis); // the game uses window.setTimeout
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("startTraining", () => {
  it("answers adult-only in Kid Mode and changes nothing", () => {
    start({ adult: false });
    const before = JSON.stringify(game.save);
    expect(game.startTraining()).toBe("adult-only");
    expect([game.training, woken, JSON.stringify(game.save)]).toEqual([null, 0, before]);
  });

  it("answers no-creature for an egg and for a dead creature", () => {
    vi.setSystemTime(T0);
    const egg = newSave(T0, 1);
    egg.settings.adultMode = true;
    game = new Game(egg);
    expect(game.startTraining()).toBe("no-creature");
    start();
    killCreature(game.save, T0);
    expect(game.startTraining()).toBe("no-creature");
    expect(game.training).toBeNull();
  });

  it("answers elsewhere during a fight, a hatch or evolve scene and Decorate mode", () => {
    // (a fight's result card is the same `game.arena` object, with its battle over: not played out here)
    start();
    expect(game.fight()).toBe("started");
    expect(game.startTraining()).toBe("elsewhere");
    start();
    game.view.moment = { kind: "hatch", time: 0 };
    expect(game.startTraining()).toBe("elsewhere");
    start();
    game.decor = { selected: null, wall: null };
    expect(game.startTraining()).toBe("elsewhere");
    expect(game.training).toBeNull();
  });

  it("answers with the creature's own reason, in the order away, asleep, sick, too young, and not for tired or a place", () => {
    const answers: Array<[Parameters<typeof careState>[1], string | undefined, StartTrainingResult]> = [
      [{ away: true, sleep: "night", sick: true }, undefined, "busy"],
      [{ sleep: "night", sick: true }, undefined, "asleep"],
      [{ sick: true }, undefined, "sick"],
      [{ sick: true }, stageForm("baby"), "sick"],
      [{}, stageForm("baby"), "too-young"],
      [{ energy: 0 }, undefined, "started"],
      [{ place: "land" }, undefined, "started"],
    ];
    for (const [set, form, expected] of answers) {
      start({ set, form });
      expect(game.startTraining(), JSON.stringify([set, form])).toBe(expected);
      expect(game.training !== null).toBe(expected === "started");
    }
  });

  it("opens the start card, wakes the screens once, and answers open to a second call", () => {
    start();
    expect(game.startTraining()).toBe("started");
    expect(woken).toBe(1);
    const t = game.training!;
    expect([t.phase, t.run, t.result, t.stage, t.bornAt]).toEqual(["ready", null, null, "adult", game.save.creature!.bornAt]);
    expect(game.startTraining()).toBe("open");
    expect([game.training, woken]).toEqual([t, 1]);
  });

  it("starts the run from Math.random, at the stage the session began at, and ignores a second Go", () => {
    start();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    game.startTraining();
    game.beginTraining();
    const run = game.training!.run! as BugCatchState;
    expect([game.training!.phase, run.rng, run.stage]).toEqual(["playing", 2 ** 31, "adult"]);
    game.beginTraining();
    expect(game.training!.run).toBe(run);
    start({ form: stageForm("young") }); // the row follows the creature's stage, not a fixed one
    game.startTraining();
    game.beginTraining();
    expect([game.training!.stage, game.training!.run!.stage]).toEqual(["young", "young"]);
  });
});

describe("a session and the save", () => {
  it("leaves the save byte-identical and writes nothing through start, Go, a catch, a miss, a pause and Quit, with no tick of the game's own", () => {
    start();
    const before = JSON.stringify(game.save);
    game.startTraining();
    game.beginTraining();
    const run = game.training!.run! as BugCatchState;
    while (run.bugs.length === 0) step(run, 10);
    catchBug(run, run.bugs[0]!.id);
    missTap(run);
    pause(run);
    resume(run);
    game.closeTraining();
    vi.advanceTimersByTime(60_000);
    expect(JSON.stringify(game.save)).toBe(before);
    expect(vi.mocked(writeSave)).not.toHaveBeenCalled();
    expect(told).toEqual([]);
    expect(game.training).toBeNull();
  });

  it("makes the finish the only player call of changed (the clock's own calls say false), and the device is told it was the player's, once", () => {
    start();
    game.startTraining();
    game.beginTraining();
    const changed = vi.spyOn(game, "changed");
    playOut();
    vi.setSystemTime(T0 + 10 * MINUTE);
    game.tick(); // the game's clock moves on by itself during the session: not the player
    expect(changed.mock.calls).toEqual([[false]]);
    game.finishTraining();
    expect(changed.mock.calls).toEqual([[false], []]); // [] is the player's call (the default argument)
    vi.advanceTimersByTime(5000);
    expect(told).toEqual([true]); // saved after the player's change (the clock-only save is folded into it)
  });

  it("pays a finished run once, stores the result for the card, wakes the screens after it is stored, and pays nothing for a second call", () => {
    start();
    game.startTraining();
    game.beginTraining();
    playOut();
    const seen: Array<unknown> = [];
    game.subscribe(() => seen.push(game.training?.result ?? null));
    game.finishTraining();
    const c = game.save.creature!;
    const t = game.training!;
    const paid = t.result as TrainResult | null; // (a session's result: a burst's is the other shape)
    expect([t.phase, paid?.counted, paid?.tier, c.training?.sessions.spd]).toEqual(["done", true, "full", 1]);
    expect(seen[seen.length - 1], "the last wake sees the stored result").toBe(t.result);
    const after = JSON.stringify(game.save);
    const changed = vi.spyOn(game, "changed");
    game.finishTraining();
    game.finishTraining();
    expect([JSON.stringify(game.save), changed.mock.calls.length]).toEqual([after, 0]);
    expect(game.save.log.filter((e) => /^Bug Catch:/.test(e.text)), "one dev-log line for the one pay").toHaveLength(1);
  });

  it("does nothing for a finish with no session, before the run is over, or while the start card is up", () => {
    start();
    const before = JSON.stringify(game.save);
    game.finishTraining();
    game.startTraining();
    game.finishTraining();
    game.beginTraining();
    game.finishTraining();
    expect([game.training!.phase, game.training!.result, JSON.stringify(game.save)]).toEqual(["playing", null, before]);
  });

  it("closes a run that is quit in the middle, with a catch made, paying nothing", () => {
    start();
    game.startTraining();
    game.beginTraining();
    const run = game.training!.run! as BugCatchState;
    while (run.bugs.length === 0) step(run, 10);
    catchBug(run, run.bugs[0]!.id);
    expect(run.over).toBe(false);
    const before = JSON.stringify(game.save);
    game.closeTraining();
    game.finishTraining();
    expect([game.training, JSON.stringify(game.save)]).toEqual([null, before]);
  });

  it("pays nobody when the creature went away in the gap before the finish, and closes with no card", () => {
    start();
    game.startTraining();
    game.beginTraining();
    playOut();
    game.save.creature!.job = careState(stageForm("adult"), { away: true }).creature!.job; // sent off to work
    const before = JSON.stringify(game.save);
    game.finishTraining();
    expect([game.training, JSON.stringify(game.save)]).toEqual([null, before]);
  });

  it("pays nobody when the creature died in the gap before the finish, and closes with no card", () => {
    start();
    game.startTraining();
    game.beginTraining();
    playOut();
    killCreature(game.save, T0); // not through changed(): the screen has not heard of it yet
    const before = JSON.stringify(game.save);
    game.finishTraining();
    expect([game.training, JSON.stringify(game.save)]).toEqual([null, before]);
    start();
    game.startTraining();
    game.beginTraining();
    playOut();
    vi.setSystemTime(T0 + 10 * 24 * HOUR); // nobody tends it: the saved creature still looks alive until the game catches up
    expect(game.save.phase).toBe("alive");
    game.finishTraining();
    expect([game.training, game.save.phase]).toEqual([null, "dead"]);
  });
});

describe("what ends a session", () => {
  it("is a death, a retire and a hatch, and a save put in from the account; an evolution does not", () => {
    start();
    game.startTraining();
    game.beginTraining();
    game.save.creature!.formId = stageForm("young"); // grows (or shrinks) to another form: it goes on
    game.changed();
    expect(game.training).not.toBeNull();
    game.save.creature!.bornAt += 1; // another creature hatched
    game.changed();
    expect(game.training).toBeNull();
    start();
    game.startTraining();
    expect(game.act((save, now) => retireCreature(save, now))).toBe("retired"); // the next egg starts
    expect(game.training).toBeNull();
    start();
    game.startTraining();
    killCreature(game.save, T0);
    game.changed();
    expect(game.training).toBeNull();
    start();
    game.startTraining();
    game.beginTraining();
    game.replaceSave(aliveSave(stageForm("adult"), T0));
    expect(game.training).toBeNull();
    const before = JSON.stringify(game.save);
    game.finishTraining(); // a finish with no session pays nothing
    expect(JSON.stringify(game.save)).toBe(before);
  });

  it("starts a new creature with no day count, though the retired one had one", () => {
    start();
    game.save.creature!.training = { day: 1, sessions: { spd: 2 } };
    expect(game.act((save, now) => retireCreature(save, now))).toBe("retired");
    expect(game.save.creature).toBeNull();
    expect(hatchIfReady(game.save, makeRng(1), T0 + (tuning.egg.minutes + 1) * MINUTE)).toBe(true);
    expect(Object.hasOwn(game.save.creature!, "training")).toBe(false);
    expect(Object.hasOwn(makeCreature(stageForm("baby"), T0), "training")).toBe(false);
  });

  it("goes on when the clock moves and when the creature evolves, keeps the stage it began at, and pays with the new stage's cap", () => {
    start();
    game.startTraining();
    game.beginTraining();
    playOut();
    vi.setSystemTime(T0 + 10 * MINUTE);
    game.tick(); // the clock moves on: the session stays
    expect(game.training).not.toBeNull();
    game.save.creature!.formId = stageForm("young");
    game.save.creature!.trained = { spd: 20 }; // the young cap, which is full
    game.finishTraining();
    expect((game.training?.result as TrainResult | null)?.capped).toBe(true);
    expect(game.training?.stage, "the difficulty row is the stage at the start").toBe("adult");
  });
});

describe("why a creature cannot train, in words", () => {
  it("says each reason the way a fight does, with train for fight", () => {
    const sick = careState(stageForm("young"), { sick: true });
    expect(trainReason(sick, sick.creature!, trainRefusal(sick.creature!)!, T0)).toBe("Sick: it needs medicine before it can train.");
    const baby = careState(stageForm("baby"), {});
    expect(trainReason(baby, baby.creature!, trainRefusal(baby.creature!)!, T0)).toBe("Too young to train: it starts at Kid (now: Baby).");
    const away = careState(stageForm("young"), { away: true });
    expect(trainReason(away, away.creature!, "busy", T0)).toBe(fightReason(away, away.creature!, "busy", T0));
    const asleep = careState(stageForm("young"), { sleep: "nap", energy: 50 });
    expect(trainReason(asleep, asleep.creature!, "asleep", T0)).toBe("Napping: wakes when rested (energy 50 of 100).");
  });
});

describe("the Arena button's question", () => {
  it("asks whyNot with the train rules: null for a healthy adult, the code and the sentence over the room for a sick one", () => {
    start();
    expect(game.whyNot(trainRefusal, trainReason)).toBeNull();
    expect(game.note).toBeNull();
    start({ set: { sick: true } });
    expect(game.whyNot(trainRefusal, trainReason)).toBe("sick");
    expect(game.note).toBe("Sick: it needs medicine before it can train.");
    start({ adult: false, set: { sick: true } });
    expect([game.whyNot(trainRefusal, trainReason), game.note]).toEqual([null, null]); // Kid Mode: nothing said
  });
});

describe("the day count in a save from storage", () => {
  const load = (training: unknown): ReturnType<typeof migrateSave> => {
    const save = aliveSave(stageForm("adult"), T0);
    const raw = JSON.parse(JSON.stringify(save));
    if (training !== undefined) raw.creature.training = training;
    return migrateSave(raw);
  };

  it("keeps a good one through a load, and leaves a save from before it without one", () => {
    const good = { day: 20_458, sessions: { spd: 4 } };
    expect(load(good)!.creature!.training).toEqual(good);
    const saved = JSON.parse(JSON.stringify(load(good))); // and out again, as the device and the cloud store it
    expect(migrateSave(saved)!.creature!.training).toEqual(good);
    expect(load(undefined)!.creature!.training).toBeUndefined();
    expect(Object.hasOwn(load(undefined)!.creature!, "training")).toBe(false);
  });

  it("drops a damaged one without throwing and keeps the rest of the creature", () => {
    for (const bad of ["x", 7, [], null, { day: -1, sessions: {} }, { day: 1, sessions: { spd: 99 } }, { day: 1, sessions: { speed: 1 } }, { day: 1 }, { day: Number.NaN, sessions: {} }]) {
      const loaded = load(bad)!;
      expect(Object.hasOwn(loaded.creature!, "training"), JSON.stringify(bad)).toBe(false);
      expect(loaded.creature!.formId).toBe(stageForm("adult"));
    }
  });
});

describe("the bug pictures", () => {
  it("is a ladybug and a golden bug that differ in shape and size, not only in colour, each square and the same on both sides", () => {
    for (const sprite of [icons.bug, goldenBug]) {
      expect(sprite.rows.every((row) => row.length === sprite.rows.length)).toBe(true);
      expect(sprite.rows.every((row) => row === [...row].reverse().join(""))).toBe(true);
    }
    expect([icons.bug.rows.length, goldenBug.rows.length]).toEqual([8, 12]);
    // a shape and not only a colour: the golden bug's wings reach the outer columns (rows 3 to 7 of its 12), the ladybug has nothing there
    const wingRows = (rows: string[]): number => rows.filter((row) => row[0] !== ".").length;
    expect(wingRows(icons.bug.rows)).toBe(0);
    expect(wingRows(goldenBug.rows)).toBeGreaterThanOrEqual(5);
    expect(goldenBug.rows.join("")).toContain("W"); // the star on its back
  });
});
