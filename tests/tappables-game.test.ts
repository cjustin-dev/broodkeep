// Field tappables as the game holds them (src/ui/game.ts: stepTappables, tapTappable, startBurst, the clears), docs/adult-a3-plan.md section 17. The rules of one tappable are in tappables.test.ts.
// Time here is the real clock under fake timers: one `run(1)` is one `tick()` a second later. A test starts the creature at home, sets the hooks (`tapRand`, `tapRng`) and then takes it to a field,
// because `new Game(save)` ticks in its constructor and a creature saved in a field would start its visit before a hook could be set (plan decision 3).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { goTo, retireCreature } from "../src/game/actions";
import { bondOf } from "../src/game/bond";
import { killCreature, setStat } from "../src/game/dev";
import type { Rng } from "../src/game/rng";
import { newSave } from "../src/game/state";
import type { FieldId } from "../src/game/types";
import { HOUR } from "../src/game/time";
import { writeSave } from "../src/sync/local";
import { Game } from "../src/ui/game";
import { at, careState, stageForm } from "./helpers";

// The write to the device is replaced (the real one needs a browser), as in initiative-game.test.ts.
vi.mock("../src/sync/local", () => ({ writeSave: vi.fn(() => Promise.resolve()) }));

const T0 = at(10);
let game: Game;
let told: boolean[];
let woken: number;
let seeds: number[];

// `next` gives these numbers in turn, then the last for ever; `int`, `chance` and `pick` are the real generator's own formulas on top of it.
function rngOf(...values: number[]): Rng {
  const next = (): number => (values.length > 1 ? (values.shift() as number) : (values[0] as number));
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (items) => items[Math.floor(next() * items.length)] as (typeof items)[number],
    state: () => 0,
  };
}
const drawFor = (n: number, min: number, max: number): number => (n - min + 0.5) / (max - min + 1);
const xDraw = (x: number): number => drawFor(x, 12, 108);
const yDraw = (y: number): number => drawFor(y, 96, 109);

// A generator for the tests that make many: every wait is `waits` in turn (then the last), every kind draw is `kind`, and every spot is on the top ground row (y 96), one of five places in turn
// (x 12, 24, 80, 92, 104): clear of the creature's widened box (x 32 to 80 for the creature `start` stands at x 40) and 4 pixels from each other, so the first try of every spawn is taken. A sixth spawn
// comes back to the first place, 100 s or more after that one began (its life is 90 s).
function scatter(kind: number, ...waits: number[]): Rng {
  let spot = 0;
  const next = (): number => kind;
  return {
    next,
    int: (min, max) => {
      if (min === 20_000) return waits.length > 1 ? (waits.shift() as number) : (waits[0] ?? 20_000);
      if (max - min > 50) return [12, 24, 80, 92, 104][spot % 5] as number;
      spot++;
      return 96;
    },
    chance: (p) => next() < p,
    pick: (items) => items[Math.floor(next() * items.length)] as (typeof items)[number],
    state: () => 0,
  };
}

// The draw order of a visit: the first wait, then for each spawn its kind, x and y and the wait after it. Kinds, when every kind is possible: sparkle 0.1, rustle 0.4, bug 0.7, pickup 0.9.
const SPARKLE = 0.1;
const RUSTLE = 0.4;
const BUG = 0.7;
const PICKUP = 0.9;

function goField(field: FieldId): void {
  game.act((save, now) => goTo(save, field, now));
}

function start(opts: { adult?: boolean; set?: Parameters<typeof careState>[1]; t?: number; rng?: Rng; field?: FieldId | null } = {}): Game {
  const t = opts.t ?? T0;
  vi.setSystemTime(t);
  const save = careState(stageForm("adult"), opts.set ?? {}, t);
  if (opts.adult !== false) save.settings.adultMode = true;
  game = new Game(save);
  told = [];
  woken = 0;
  seeds = [];
  game.onSave = (byPlayer) => told.push(byPlayer);
  game.subscribe(() => woken++);
  Object.assign(game.view, { x: 40, y: 112, size: 32 }); // standing in the middle of the one-line picture (the Stage does this every frame)
  game.tapRand = () => 0.5;
  game.tapRng = (seed) => {
    seeds.push(seed);
    return opts.rng ?? scatter(SPARKLE, 20_000);
  };
  if (opts.field !== null) goField(opts.field ?? "land");
  void game.saveNow(); // (taking it to the field was a player's action: its save is due in 600 ms, so put it through now)
  told = [];
  woken = 0;
  vi.mocked(writeSave).mockClear();
  return game;
}

// `seconds` one-second ticks on a game.
function run(seconds: number, g: Game = game): void {
  for (let k = 0; k < seconds; k++) {
    vi.advanceTimersByTime(1000);
    g.tick();
  }
}

const ids = (): number[] => game.tappables.map((p) => p.id);
const kinds = (): string[] => game.tappables.map((p) => p.kind);

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", globalThis); // the game uses window.setTimeout
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("a visit and its first spawn", () => {
  it("starts at the first step in the field (the seed read once, from tapRand: 0.5 of 2^32) and makes the first tappable at 20 s of field time (19 none)", () => {
    start({ rng: rngOf(0, SPARKLE, xDraw(80), yDraw(100), 0) });
    expect(seeds).toEqual([]); // (a visit starts at a step, not when the creature is taken there)
    run(19);
    expect([seeds, game.tappables]).toEqual([[2 ** 31], []]);
    expect(game.view.tappables).toEqual([]);
    run(1);
    expect(game.tappables).toEqual([{ id: 1, kind: "sparkle", x: 80, y: 100, born: 20_000 }]);
    expect(game.view.tappables).toEqual([{ id: 1, kind: "sparkle", x: 80, y: 100 }]);
    run(100);
    expect(seeds).toEqual([2 ** 31]); // (not read again while the visit goes on)
  });

  it("keeps the picture off the creature: a first try at x 50 (under the creature standing at x 40) is refused, the second, x 100, is taken", () => {
    start({ rng: rngOf(0, SPARKLE, xDraw(50), yDraw(100), xDraw(100), yDraw(100), 0) });
    run(20);
    expect(game.tappables).toEqual([{ id: 1, kind: "sparkle", x: 100, y: 100, born: 20_000 }]);
  });

  it("waits 40 s when the draw is at the top of the range (39 none)", () => {
    start({ rng: rngOf(0.999999, SPARKLE, xDraw(80), yDraw(100), 0) });
    run(39);
    expect(game.tappables).toEqual([]);
    run(1);
    expect(ids()).toEqual([1]);
  });

  it("counts the next wait from the start of the one before (the second 20 s after the first, not after the first one is gone)", () => {
    start({ rng: rngOf(0, SPARKLE, xDraw(80), yDraw(100), 0, SPARKLE, xDraw(95), yDraw(105), 0) });
    run(39);
    expect(ids()).toEqual([1]);
    run(1);
    expect(ids()).toEqual([1, 2]);
  });

  it("wakes the screens when one is made and when it fades, and at no other step (direct steps: no clock simulation to wake them)", () => {
    start({ rng: scatter(SPARKLE, 20_000, 40_000) });
    for (let k = 0; k < 9; k++) game.stepTappables(2000);
    expect(woken).toBe(0);
    game.stepTappables(2000); // 20,000 ms: made
    expect([ids(), woken]).toEqual([[1], 1]);
    const wakes: number[] = []; // each step from 22,000 to 108,000 ms: did it change the ground, and how many times did it wake the screens
    const changes: number[] = [];
    for (let k = 0; k < 44; k++) {
      const was = ids().join();
      const w = woken;
      game.stepTappables(2000);
      changes.push(ids().join() === was ? 0 : 1);
      wakes.push(woken - w);
    }
    expect(wakes).toEqual(changes);
    expect(changes.reduce((sum, c) => sum + c, 0)).toBe(2); // (the next ones, at 60,000 and 100,000 ms)
    game.stepTappables(1999);
    expect(ids()).toContain(1);
    const before = woken;
    game.stepTappables(1); // 90,000 ms old: gone
    expect([ids().includes(1), woken]).toEqual([false, before + 1]);
  });
});

describe("the clock", () => {
  it("counts a step of 100,000 ms as 2,000, at the cap's own resolution (a cap of 1,999 or 2,500 is wrong)", () => {
    start({ rng: rngOf(0.999999, SPARKLE, xDraw(80), yDraw(100), 0.999999) });
    game.stepTappables(100_000); // the visit starts: a wait of 40,000, 2,000 of it counted
    for (let k = 0; k < 18; k++) game.stepTappables(2000);
    game.stepTappables(1999); // 2,000 + 36,000 + 1,999 = 39,999 ms
    expect(game.tappables).toEqual([]);
    game.stepTappables(1); // 40,000 ms exactly
    expect(ids()).toEqual([1]);
  });

  it("ages a tappable that is out by 2,000 ms on a step of 100,000, as it counts the wait (the life is on the same capped clock)", () => {
    start({ rng: scatter(SPARKLE, 20_000, 40_000) });
    for (let k = 0; k < 10; k++) game.stepTappables(2000); // made at 20,000: born 20,000
    expect(ids()).toEqual([1]);
    game.stepTappables(100_000); // the device slept: 2,000 ms counted, so it is 2,000 old, not 100,000
    expect(ids()).toEqual([1]);
    for (let k = 0; k < 34; k++) game.stepTappables(2000); // 70,000 old
    game.stepTappables(18_000); // (capped to 2,000: 72,000)
    expect(ids()).toContain(1); // (the second one, made at 60,000, is out too)
  });

  it("counts a step backwards (the system clock set back) as nothing", () => {
    start({ rng: rngOf(0, SPARKLE, xDraw(80), yDraw(100), 0) });
    game.stepTappables(-5000);
    for (let k = 0; k < 9; k++) game.stepTappables(2000);
    game.stepTappables(1999);
    expect(game.tappables).toEqual([]); // (18,000 + 1,999 counted, not 15,000 + ...)
    game.stepTappables(1);
    expect(ids()).toEqual([1]);
  });

  it("is not moved by the dev speed (a clock ten times as fast makes its first at tick 20, not 2)", () => {
    start({ rng: rngOf(0, SPARKLE, xDraw(80), yDraw(100), 0) });
    game.devSpeed = 10;
    run(19);
    expect(game.tappables).toEqual([]);
    run(1);
    expect(ids()).toEqual([1]);
  });

  it("fades a tappable at 90,000 ms of unblocked time (89,999 still there, 90,000 gone, at 1 ms)", () => {
    start({ rng: scatter(SPARKLE, 20_000, 40_000) });
    for (let k = 0; k < 10; k++) game.stepTappables(2000); // made at 20,000: born 20,000
    for (let k = 0; k < 44; k++) game.stepTappables(2000); // 88,000 old
    game.stepTappables(1999);
    expect(ids()).toContain(1);
    game.stepTappables(1);
    expect(ids()).not.toContain(1);
  });
});

describe("what holds a visit (it goes on, and nothing shows)", () => {
  type Row = { on: (g: Game) => void; off: (g: Game) => void };
  const rows: Record<string, Row> = {
    "the habitat screen": { on: (g) => g.setScreen("habitat"), off: (g) => g.setScreen("room") },
    "the arena screen": { on: (g) => g.setScreen("arena"), off: (g) => g.setScreen("room") },
    "a fight": { on: (g) => expect(g.fight()).toBe("started"), off: (g) => (g.arena = null) },
    "a training session": { on: (g) => expect(g.startTraining()).toBe("started"), off: (g) => g.closeTraining() },
    "Decorate mode": { on: (g) => (g.decor = { selected: null, wall: null }), off: (g) => (g.decor = null) },
    "a hatch or evolve scene": { on: (g) => (g.view.moment = { kind: "evolve", time: 0 }), off: (g) => (g.view.moment = null) },
    "a haul card waiting": {
      on: (g) => g.save.hauls.push({ spot: "meadow", at: T0, coins: 3, material: "fiber", amount: 1 }),
      off: (g) => (g.save.hauls = []),
    },
    "an open panel": { on: (g) => (g.menuOpen = true), off: (g) => (g.menuOpen = false) },
    "a meal in progress": { on: (g) => (g.view.snack = { food: "pellet", x: 0, y: 0 }), off: (g) => (g.view.snack = null) },
  };

  for (const [name, row] of Object.entries(rows)) {
    it(`${name}: no spawn for 120 s, the tappable stays but is not shown, the wait is held (10 clear, 120 blocked, 9 clear: none; the 10th: made), and it is shown again at the next step`, () => {
      start({ rng: scatter(SPARKLE, 20_000) });
      run(30); // one made at 20 s, 10 s into the next wait
      expect(ids()).toEqual([1]);
      row.on(game);
      run(120);
      expect(ids()).toEqual([1]);
      expect(game.view.tappables).toEqual([]);
      row.off(game);
      run(9);
      expect(ids()).toEqual([1]);
      run(1);
      expect(ids()).toEqual([1, 2]);
      expect(game.view.tappables.map((p) => p.id)).toEqual([1, 2]);
    });
  }

  it("a panel open for ten minutes removes nothing: the life is counted in unblocked time", () => {
    start({ rng: scatter(SPARKLE, 20_000, 40_000) });
    run(20);
    expect(ids()).toEqual([1]);
    game.menuOpen = true;
    run(600);
    game.menuOpen = false;
    run(1);
    expect(ids()).toContain(1);
    expect(game.view.tappables.map((p) => p.id)).toContain(1);
  });

  it("a call is not a block: tappables go on being made and shown while the creature asks for food", () => {
    start({ rng: scatter(SPARKLE, 20_000) });
    run(20);
    setStat(game.save, "hunger", 5);
    game.save.creature!.call = "hungry";
    run(20);
    expect(ids()).toEqual([1, 2]);
    expect(game.view.tappables.map((p) => p.id)).toEqual([1, 2]);
  });
});

describe("who gets a visit", () => {
  it("makes none for 10 minutes in Kid Mode, at home, with no creature, with a dead one, and reads no seed", () => {
    start({ adult: false });
    run(600);
    expect([game.tappables, game.view.tappables, seeds]).toEqual([[], [], []]);
    start({ field: null });
    run(600);
    expect([game.tappables, game.view.tappables, seeds]).toEqual([[], [], []]);
    vi.setSystemTime(T0);
    const egg = newSave(T0, 1);
    egg.settings.adultMode = true;
    game = new Game(egg);
    seeds = [];
    game.tapRand = () => 0.5;
    game.tapRng = (seed) => (seeds.push(seed), scatter(SPARKLE, 20_000));
    run(600);
    expect([game.tappables, seeds]).toEqual([[], []]);
    start();
    killCreature(game.save, T0);
    game.changed(false);
    run(600);
    expect([game.tappables, seeds]).toEqual([[], []]);
  });

  it("goes when the creature leaves: home, another field, sleep, a job, death, another hatching, Adult Mode off, a retire, a new game", () => {
    const withOne = (): void => {
      start({ rng: scatter(SPARKLE, 20_000) });
      run(20);
      expect(ids()).toEqual([1]);
    };
    withOne();
    goField("water" as FieldId);
    expect([ids(), game.view.tappables]).toEqual([[], []]); // another field: at once, with no tick
    run(1);
    expect(seeds.length).toBe(2); // ...and the next step starts a new visit with a seed of its own
    withOne();
    game.act((save, now) => goTo(save, "home", now));
    expect([ids(), game.view.tappables]).toEqual([[], []]);
    withOne();
    game.save.creature!.sleep = "night";
    run(1);
    expect([ids(), game.view.tappables]).toEqual([[], []]);
    withOne();
    game.save.creature!.job = { spot: "meadow", startedAt: T0, endsAt: T0 + 24 * HOUR };
    run(1);
    expect([ids(), game.view.tappables]).toEqual([[], []]);
    withOne();
    killCreature(game.save, T0);
    game.changed(false); // (at once, with no tick)
    expect(ids()).toEqual([]);
    withOne();
    game.save.creature!.bornAt += 1;
    game.changed(false);
    expect(ids()).toEqual([]);
    withOne();
    game.save.settings.adultMode = false;
    game.changed(false);
    expect([ids(), game.view.tappables]).toEqual([[], []]);
    withOne();
    game.act((save, now) => retireCreature(save, now));
    expect(ids()).toEqual([]);
    withOne();
    game.replaceSave(careState(stageForm("adult"), {}, T0));
    expect([ids(), game.view.tappables]).toEqual([[], []]);
  });

  it("goes when a game is put in with the same creature in the same field (an account's save): a new visit, with a seed of its own, starts at the next step", () => {
    start({ rng: scatter(SPARKLE, 20_000) });
    run(20);
    expect(ids()).toEqual([1]);
    const same = careState(stageForm("adult"), {}, T0);
    same.settings.adultMode = true;
    goTo(same, "land", T0); // (adult, awake, in the field: still eligible, so only the replace can end the old visit)
    game.replaceSave(same);
    expect([ids(), game.view.tappables]).toEqual([[], []]);
    run(1);
    expect(seeds.length).toBe(2);
  });

  it("a visit's pickup is the new field's after a move: Land's acorn pays Wood, Sky's crystal Stone", () => {
    start({ rng: rngOf(0, PICKUP, xDraw(80), yDraw(100), 0.999999) });
    run(20);
    goField("sky");
    game.tapRng = () => rngOf(0, PICKUP, xDraw(80), yDraw(100), 0.999999); // (a new visit: a new generator)
    run(20);
    expect(kinds()).toEqual(["pickup"]);
    expect(game.tapTappable(1)?.kind).toBe("pickup");
    expect([game.save.inventory, game.note]).toEqual([{ stone: 1 }, "Found a crystal."]);
  });
});

describe("how many, and which", () => {
  it("shows at most four at once: the fifth comes when the first is gone (at 110 s, with the first made at 20 s)", () => {
    start({ rng: scatter(SPARKLE, 20_000) });
    run(80);
    expect(ids()).toEqual([1, 2, 3, 4]);
    run(29); // 109 s: nothing is room yet
    expect(ids()).toEqual([1, 2, 3, 4]);
    run(1); // 110 s: the first is 90 s old and gone, and the fifth is made in the same step
    expect(ids()).toEqual([2, 3, 4, 5]);
  });

  it("makes a second bug only when the first is gone: with a bug out the draw has no bug in it (a rustle), and at 110 s, when the first has faded, the next one is a bug again", () => {
    start({ rng: scatter(BUG, 20_000) });
    run(60);
    expect(kinds()).toEqual(["bug", "rustle", "rustle"]); // (0.7 of 12 is a bug; of 9, with no bug in it, a rustle)
    run(49); // 109 s: the fourth (at 80 s) is a rustle, the fifth (at 100 s) found four showing and waits
    expect(kinds()).toEqual(["bug", "rustle", "rustle", "rustle"]);
    run(1); // 110 s: the first is 90 s old and gone; the fifth is made at once, with no bug out
    expect(kinds()).toEqual(["rustle", "rustle", "rustle", "bug"]);
  });

  it("makes the pickup once a visit: over ten minutes of draws at the top of the range one pickup is ever made", () => {
    start({ rng: scatter(0.95, 20_000) });
    const seen: string[] = [];
    const known = new Set<number>();
    for (let k = 0; k < 600; k++) {
      run(1);
      for (const p of game.tappables) if (!known.has(p.id)) (known.add(p.id), seen.push(p.kind));
    }
    expect(seen.filter((kind) => kind === "pickup")).toEqual(["pickup"]);
    expect(seen.length).toBeGreaterThan(10);
  });

  it("makes no bug for a creature that cannot train (sick), and drops a bug that is out when it turns sick, at the next step", () => {
    start({ rng: scatter(BUG, 20_000) });
    run(20);
    expect(kinds()).toEqual(["bug"]);
    game.save.creature!.sick = true;
    run(1);
    expect(kinds()).toEqual([]);
    run(60);
    expect(kinds().includes("bug")).toBe(false); // (a draw of 0.7 is a rustle now: 0.7 of 9)
  });
});

describe("a tap", () => {
  it("on a sparkle pays 1 coin (or 1 material in half the draws), once, with a note, a hop and sparkles on the spot, and a second tap finds nothing", () => {
    start({ rng: rngOf(0, SPARKLE, xDraw(80), yDraw(100), 0.999999, 0.9) });
    run(20);
    const result = game.tapTappable(1);
    expect(result).toEqual({ kind: "sparkle", levelUp: null });
    expect([game.save.coins, game.save.inventory, game.note]).toEqual([1, {}, "Found 1 coin."]);
    expect(ids()).toEqual([]);
    expect(game.view.pose).toBe("hop");
    expect(game.view.effects.map((fx) => [fx.kind, fx.x, fx.y])).toEqual([["sparkle", 84, 104], ["sparkle", 80, 101], ["sparkle", 88, 100]]); // (round the spot's middle: 80 + 4, 100 + 4)
    expect(game.tapTappable(1)).toBeNull();
    expect(game.save.coins).toBe(1);
  });

  it("on a sparkle can pay a material: 0.1 of the chance draw, then the third of the five (wood)", () => {
    start({ rng: rngOf(0, SPARKLE, xDraw(80), yDraw(100), 0.999999, 0.1, 0.5) });
    run(20);
    game.tapTappable(1);
    expect([game.save.coins, game.save.inventory, game.note]).toEqual([0, { wood: 1 }, "Found some wood."]);
  });

  it("on a rustle is a moment together (Bond XP 3, a heart, a startle) or a found gift (sparkles on the spot), and says a new Bond level", () => {
    start({ rng: rngOf(0, RUSTLE, xDraw(100), yDraw(100), 0.999999, 0.5) });
    run(20);
    const xp0 = bondOf(game.save.creature!).xp;
    expect(game.tapTappable(1)).toEqual({ kind: "rustle", levelUp: null });
    expect(bondOf(game.save.creature!).xp - xp0).toBe(3);
    expect([game.note, game.view.pose, game.view.effects.map((fx) => fx.kind)]).toEqual(["A moment together: +3 Bond XP.", "startle", ["heart"]]);

    start({ rng: rngOf(0, RUSTLE, xDraw(100), yDraw(100), 0.999999, 0.49, 0.1) });
    run(20);
    game.tapTappable(1);
    expect([game.save.coins, game.note, game.view.effects.map((fx) => fx.kind)]).toEqual([2, "Found 2 coins.", ["sparkle", "sparkle", "sparkle"]]);

    start({ rng: rngOf(0, RUSTLE, xDraw(100), yDraw(100), 0.999999, 0.5) });
    run(20);
    game.save.creature!.bond = { xp: 298, chain: 0, at: 0 };
    expect(game.tapTappable(1)?.levelUp).toBe(2);
  });

  it("on a pickup pays its field's material with its name: Land's acorn is 1 Wood", () => {
    start({ rng: rngOf(0, PICKUP, xDraw(80), yDraw(100), 0.999999) });
    run(20);
    expect(game.tapTappable(1)).toEqual({ kind: "pickup", levelUp: null });
    expect([game.save.inventory, game.note, game.view.pose]).toEqual([{ wood: 1 }, "Found an acorn.", "happy"]);
  });

  it("turns the creature toward the spot, after the pose (a startle turns it the other way first): left of it and right of it", () => {
    for (const [x, facing] of [[12, -1], [100, 1]] as const) {
      start({ rng: rngOf(0, RUSTLE, xDraw(x), yDraw(100), 0.999999, 0.5) }); // the creature is at 40 to 72, its middle 56
      run(20);
      game.view.facing = 1;
      game.tapTappable(1);
      expect([x, game.view.facing]).toEqual([x, facing]);
      start({ rng: rngOf(0, SPARKLE, xDraw(x), yDraw(100), 0.999999, 0.9) });
      run(20);
      game.view.facing = -1;
      game.tapTappable(1);
      expect([x, game.view.facing]).toEqual([x, facing]);
    }
  });

  it("takes the one nearest its middle only when asked by id: a wrong id pays nothing", () => {
    start({ rng: rngOf(0, SPARKLE, xDraw(80), yDraw(100), 0.999999, 0.9) });
    run(20);
    expect(game.tapTappable(2)).toBeNull();
    expect([game.save.coins, ids()]).toEqual([0, [1]]);
  });

  it("is an ordinary player action: it is saved and sent on, while spawning and fading never are (the passive device: the same told and the same writes as a Kid Mode game with no tappables)", () => {
    const record = (adult: boolean): { told: boolean[]; writes: number } => {
      start({ adult, rng: scatter(SPARKLE, 20_000, 40_000) });
      run(120);
      vi.advanceTimersByTime(10_000);
      return { told: told.slice(), writes: vi.mocked(writeSave).mock.calls.length };
    };
    const real = record(true);
    expect(game.tappables.length).toBeGreaterThan(0); // (this game made and faded tappables)
    const afterTap = (): boolean[] => {
      game.tapTappable(game.tappables[0]!.id);
      vi.advanceTimersByTime(10_000);
      return told;
    };
    const tapped = afterTap();
    const control = record(false);
    expect(game.tappables).toEqual([]);
    expect(real).toEqual(control);
    expect(real.told.includes(true)).toBe(false);
    expect(tapped.includes(true)).toBe(true);
  });

  it("that arrives after a block began and before the next step pays nothing, removes nothing, reacts to nothing and empties the picture's list", () => {
    start({ rng: rngOf(0, SPARKLE, xDraw(80), yDraw(100), 0.999999, 0.9) });
    run(20);
    const pose = game.view.pose;
    game.menuOpen = true; // (no tick: the list is up to a tick stale)
    expect(game.view.tappables.length).toBe(1);
    expect(game.tapTappable(1)).toBeNull();
    expect([game.save.coins, ids(), game.view.tappables, game.view.pose, game.view.effects, game.note]).toEqual([0, [1], [], pose, [], null]);
  });

  it("that arrives after the creature fell asleep (no tick yet) ends the visit and pays nothing", () => {
    start({ rng: rngOf(0, SPARKLE, xDraw(80), yDraw(100), 0.999999, 0.9) });
    run(20);
    game.save.creature!.sleep = "night";
    expect(game.tapTappable(1)).toBeNull();
    expect([game.save.coins, ids(), game.view.tappables]).toEqual([0, [], []]);
  });

  it("on a bug that turned sick since the last step finds the bug gone and starts nothing", () => {
    start({ rng: rngOf(0, BUG, xDraw(80), yDraw(100), 0.999999) });
    run(20);
    game.save.creature!.sick = true;
    expect(game.tapTappable(1)).toBeNull();
    expect([game.training, ids()]).toEqual([null, []]);
  });
});

describe("a bug's burst", () => {
  it("opens the overlay at once in `playing`, 10,000 ms long, for this field, and the other tappables wait under it (not shown) and come back after", () => {
    start({ rng: rngOf(0, BUG, xDraw(80), yDraw(100), 0, SPARKLE, xDraw(95), yDraw(105), 0.999999) });
    run(40);
    expect(kinds()).toEqual(["bug", "sparkle"]);
    expect(game.tapTappable(1)).toEqual({ kind: "bug", levelUp: null });
    const t = game.training!;
    expect([t.phase, t.burst, t.stage, t.run!.lengthMs, t.result]).toEqual(["playing", "land", "adult", 10_000, null]);
    expect([ids(), game.view.tappables, game.view.pose]).toEqual([[2], [], "startle"]);
    game.closeTraining();
    run(1);
    expect(game.view.tappables.map((p) => p.id)).toEqual([2]);
  });

  it("is paid as a burst: Bond XP for each bug (3), the field's material for a golden one (1 Wood), no Speed, no Discipline and no day count", () => {
    start({ rng: rngOf(0, BUG, xDraw(80), yDraw(100), 0.999999) });
    run(20);
    game.tapTappable(1);
    const c = game.save.creature!;
    const before = JSON.stringify([c.stats, c.trained, c.training]);
    const run1 = game.training!.run!;
    Object.assign(run1, { catches: 3, goldens: 1, over: true });
    game.finishTraining();
    expect(game.training!.phase).toBe("done");
    expect(game.training!.result).toEqual({ burst: true, catches: 3, bondXp: 3, level: null, material: "wood" });
    expect(game.save.inventory).toEqual({ wood: 1 });
    expect(JSON.stringify([c.stats, c.trained, c.training])).toBe(before);
  });

  it("is refused for the same reasons as a session: open, elsewhere (a fight, a scene, Decorate mode), sick, adult-only, no creature", () => {
    start({ rng: rngOf(0, BUG, xDraw(80), yDraw(100), 0.999999) });
    run(20);
    expect(game.startBurst()).toBe("started");
    expect(game.startBurst()).toBe("open");
    game.closeTraining();
    expect(game.fight()).toBe("started");
    expect(game.startBurst()).toBe("elsewhere");
    game.arena = null;
    game.view.moment = { kind: "evolve", time: 0 };
    expect(game.startBurst()).toBe("elsewhere");
    game.view.moment = null;
    game.decor = { selected: null, wall: null };
    expect(game.startBurst()).toBe("elsewhere");
    game.decor = null;
    game.save.creature!.sick = true;
    expect(game.startBurst()).toBe("sick");
    game.save.creature!.sick = false;
    game.save.settings.adultMode = false;
    expect(game.startBurst()).toBe("adult-only");
    game.save.settings.adultMode = true;
    killCreature(game.save, T0);
    expect(game.startBurst()).toBe("no-creature");
  });

  it("pays nothing for a finish while the run is not over (the card is not paid by a second call or an early one)", () => {
    start({ rng: rngOf(0, BUG, xDraw(80), yDraw(100), 0.999999) });
    run(20);
    game.tapTappable(1);
    const xp = bondOf(game.save.creature!).xp;
    Object.assign(game.training!.run!, { catches: 4, goldens: 1, over: false });
    game.finishTraining();
    expect([game.training!.phase, game.training!.result, bondOf(game.save.creature!).xp, game.save.inventory]).toEqual(["playing", null, xp, {}]);
  });

  it("is not what a session is paid as: a session finished in a field pays Speed and its day count, not Bond XP only", () => {
    start({ rng: scatter(SPARKLE, 20_000) });
    expect(game.startTraining()).toBe("started");
    game.beginTraining();
    Object.assign(game.training!.run!, { catches: 6, goldens: 0, over: true });
    game.finishTraining();
    const c = game.save.creature!;
    const paid = game.training!.result as { burst?: true; counted?: boolean };
    expect([paid.burst, paid.counted, c.training?.sessions.spd]).toEqual([undefined, true, 1]);
  });

  it("pays nothing when it is quit or closed before it is paid (no result, no Bond XP)", () => {
    start({ rng: rngOf(0, BUG, xDraw(80), yDraw(100), 0.999999) });
    run(20);
    game.tapTappable(1);
    const xp = bondOf(game.save.creature!).xp;
    game.closeTraining();
    expect([game.training, bondOf(game.save.creature!).xp, game.save.inventory]).toEqual([null, xp, {}]);
  });
});

describe("the one random draw of a visit", () => {
  it("never reads the global Math.random (the per-frame draws read it, so a check's queue must not be used up by a visit)", () => {
    start({ rng: scatter(SPARKLE, 20_000) });
    const spy = vi.spyOn(Math, "random");
    run(120);
    expect(spy).not.toHaveBeenCalled();
  });

  it("never reads `game.rand`, the initiatives' generator: over 50 s and a tap it is not called at all (the initiatives' own first draws come after 60 s), and the sparkle's pay is the visit's (its scripted generator's)", () => {
    start({ rng: rngOf(0, SPARKLE, xDraw(80), yDraw(100), 0.999999, 0.9) }); // the chance draw 0.9 is a coin
    const draws = vi.fn(() => 0.1); // (a draw of 0.1 from `rand` would be a material)
    game.rand = draws;
    run(50);
    game.tapTappable(game.tappables[0]!.id);
    expect([game.save.coins, game.save.inventory]).toEqual([1, {}]);
    expect(draws.mock.calls.length).toBe(0); // (measured: the initiatives' own two draws come at about 61 s; nothing of the visit's ever)
  });
});

describe("the cadence at the longest gaps", () => {
  it("makes the fourth tappable at exactly 160,000 ms of unblocked field time (the first, made at 40,000, has faded at 130,000)", () => {
    start({ rng: scatter(SPARKLE, 40_000) });
    for (let k = 0; k < 79; k++) game.stepTappables(2000); // 158,000
    game.stepTappables(1999); // 159,999
    expect(ids()).toEqual([2, 3]);
    game.stepTappables(1);
    expect(ids()).toEqual([2, 3, 4]);
  });
});
