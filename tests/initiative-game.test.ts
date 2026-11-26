// Creature initiatives as the game holds them (src/ui/game.ts: stepInitiative, answerInitiative, feed, dropInitiative, and the clears), the bubble's place (art/scene.ts bubbleBox) and the picture of
// each offer (docs/adult-a3-plan.md section 14). The rules of one initiative are in initiatives.test.ts. Time here is the real clock under fake timers: one `run(1)` is one `tick()` a second later.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createView, poseOffsets, triggerPose } from "../src/art/idle";
import type { Pose } from "../src/art/idle";
import { bubbleBox } from "../src/art/scene";
import { materialIds } from "../src/data/habitat";
import { items } from "../src/data/shop";
import { tuning } from "../src/data/tuning";
import { feed, retireCreature, touch } from "../src/game/actions";
import { bondOf } from "../src/game/bond";
import { killCreature, setStat } from "../src/game/dev";
import { dishIds, dishMeal } from "../src/game/dishes";
import { cravingFoods } from "../src/game/initiatives";
import type { Initiative } from "../src/game/initiatives";
import { menuOf } from "../src/game/growth";
import { newSave } from "../src/game/state";
import { HOUR } from "../src/game/time";
import { writeSave } from "../src/sync/local";
import { Game } from "../src/ui/game";
import { at, careState, stageForm } from "./helpers";

// The write to the device is replaced (the real one needs a browser), as in training-game.test.ts.
vi.mock("../src/sync/local", () => ({ writeSave: vi.fn(() => Promise.resolve()) }));

const T0 = at(10);
let game: Game;
let told: boolean[];
let woken: number;

function start(opts: { adult?: boolean; set?: Parameters<typeof careState>[1]; form?: string; t?: number } = {}): Game {
  const t = opts.t ?? T0;
  vi.setSystemTime(t);
  const save = careState(opts.form ?? stageForm("adult"), opts.set ?? {}, t);
  if (opts.adult !== false) save.settings.adultMode = true;
  game = new Game(save);
  told = [];
  woken = 0;
  game.onSave = (byPlayer) => told.push(byPlayer);
  game.subscribe(() => woken++);
  game.rand = () => 0; // (the wait is 60,000 ms and the first kind with weight is drawn: a play)
  Object.assign(game, { initiativeWait: null }); // (the catch-up tick of the constructor drew a wait from the real random source: draw it again from this one)
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

// Tick until the next initiative is made; says how many seconds that took (0 when none came within `limit`).
function untilMade(limit: number, g: Game = game): number {
  const before = g.initiative;
  for (let k = 1; k <= limit; k++) {
    run(1, g);
    if (g.initiative && g.initiative !== before) return k;
  }
  return 0;
}

// An initiative put straight on the game, for the tests of an answer (the drawing of one is tested above).
function offer(kind: Initiative["kind"], extra: Partial<Initiative> = {}): Initiative {
  const i: Initiative = { kind, bornAt: game.save.creature!.bornAt, at: 0, food: null, gift: null, tosses: 0, playFrom: null, ...extra };
  game.initiative = i;
  return i;
}

const xpOf = (): number => bondOf(game.save.creature!).xp;

// `rand` gives these numbers in turn, then the last for ever.
const seq =
  (...values: number[]) =>
  (): number =>
    values.length > 1 ? (values.shift() as number) : (values[0] as number);

// Gravelhorn at Bond level 1 weighs play 5, craving 4, gift 4 (literals, pinned in initiatives.test.ts), so of the draw 0 to 5/13 is a play, to 9/13 a craving, the rest a gift: 0.5385 is the middle
// of the craving's slice and 0.8462 of the gift's.
const CRAVING_DRAW = 0.5385;
const GIFT_DRAW = 0.8462;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", globalThis); // the game uses window.setTimeout
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("making an initiative", () => {
  it("makes the first after exactly 60 seconds of clear time (59 none), a play at rand 0, with the ball in the view", () => {
    start();
    run(59);
    expect([game.initiative, game.view.invite]).toEqual([null, null]);
    run(1);
    expect(game.initiative?.kind).toBe("play");
    expect(game.view.invite).toBe("ball");
    expect(told.includes(true)).toBe(false); // (a made initiative is not the player's doing and is not saved)
  });

  it("waits 90 seconds when the draw is at the top of the range (89 none)", () => {
    start();
    game.rand = () => 0.999999;
    run(89);
    expect(game.initiative).toBeNull();
    run(1);
    expect(game.initiative).not.toBeNull();
  });

  it("wakes the screens when one is made and when it fades, and not at any other step (direct steps: no clock simulation to wake them)", () => {
    start();
    for (let k = 0; k < 29; k++) game.stepInitiative(2000);
    expect(woken).toBe(0);
    game.stepInitiative(2000); // 60,000 ms
    expect([game.initiative?.kind, woken]).toEqual(["play", 1]);
    for (let k = 0; k < 14; k++) game.stepInitiative(2000);
    expect(woken).toBe(1);
    game.stepInitiative(2000); // 30,000 ms after it was made
    expect([game.initiative, woken]).toEqual([null, 2]);
  });

  it("fades 30 seconds after it was made (29 still there, 30 gone), and the next comes 60 seconds after the start of this one", () => {
    start();
    run(60);
    const first = game.initiative;
    run(29);
    expect(game.initiative).toBe(first);
    run(1);
    expect(game.initiative).toBeNull();
    run(29);
    expect(game.initiative).toBeNull();
    run(1); // 60 s after the first start
    expect(game.initiative).not.toBeNull();
    expect(game.initiative).not.toBe(first);
  });

  it("counts a tick of 100,000 ms as 2,000 (the direct step too)", () => {
    start();
    game.stepInitiative(100_000);
    for (let k = 0; k < 28; k++) game.stepInitiative(2000);
    expect(game.initiative).toBeNull(); // 58,000 ms so far
    game.stepInitiative(2000);
    expect(game.initiative).not.toBeNull(); // 60,000 ms
  });

  it("counts a step backwards (the system clock set back) as nothing, not as time to wait again", () => {
    start();
    game.stepInitiative(-5000);
    for (let k = 0; k < 29; k++) game.stepInitiative(2000);
    expect(game.initiative).toBeNull(); // 58,000 ms
    game.stepInitiative(2000);
    expect(game.initiative).not.toBeNull(); // 60,000 ms
  });

  it("makes only one at a time, even when the countdown has run out under the one that shows (set by hand: through the clock it cannot)", () => {
    start();
    run(60);
    const first = game.initiative;
    expect(first).not.toBeNull();
    Object.assign(game, { initiativeWait: 0 });
    game.stepInitiative(1000);
    expect(game.initiative).toBe(first);
  });

  it("makes 3 in 300 seconds at the longest wait, 4 at 72 s and 5 at the shortest (the fifth exactly at 300 s), none overlapping", () => {
    const starts = (rand: number): number => {
      start();
      game.rand = () => rand;
      let count = 0;
      let last: Initiative | null = null;
      for (let s = 0; s < 300; s++) {
        run(1);
        if (game.initiative && game.initiative !== last) count++;
        if (game.initiative) last = game.initiative;
      }
      return count;
    };
    expect(starts(0.999999)).toBe(3); // 90, 180, 270
    expect(starts(0.4)).toBe(4); // 72, 144, 216, 288
    expect(starts(0)).toBe(5); // 60, 120, 180, 240, 300
  });

  it("draws a craving, a coin gift and a material gift with their own picture in the bubble", () => {
    start({ form: "gravelhorn" });
    const c = game.save.creature!;

    game.rand = seq(0, CRAVING_DRAW, 0, 0); // a delay of 60 s, a craving, the first food, then the delay
    run(60);
    expect(game.initiative?.kind).toBe("craving");
    expect(game.view.invite).toBe(game.initiative?.food);
    expect(cravingFoods(c)).toContain(game.initiative?.food);

    start({ form: "gravelhorn" });
    game.rand = seq(0, GIFT_DRAW, 0.1, 0); // a gift, a coin (0.1 is under a third)
    run(60);
    expect([game.initiative?.kind, game.initiative?.gift, game.view.invite]).toEqual(["gift", { kind: "coins", amount: 2 }, "coin"]);

    start({ form: "gravelhorn" });
    game.rand = seq(0, GIFT_DRAW, 0.5, 0.5, 0); // a gift, a material (the middle one of the five)
    run(60);
    const middle = materialIds[2];
    expect([game.initiative?.gift, game.view.invite]).toEqual([{ kind: "material", id: middle }, middle]);
  });

  it("shows the item it pays: each of the six gifts has its own icon, and a tap pays that item and says so (a table of literals)", () => {
    // the coin draw 0.1 is a coin gift; 0.5 is not, and the next draw is the material's place in the five (fiber, herb, wood, fish, stone: 0.1, 0.3, 0.5, 0.7, 0.9)
    const six = [
      { draws: [0.1], icon: "coin", note: "Found 2 coins.", coins: 2, item: null },
      { draws: [0.5, 0.1], icon: "fiber", note: "Found some fiber.", coins: 0, item: "fiber" },
      { draws: [0.5, 0.3], icon: "herb", note: "Found some herbs.", coins: 0, item: "herb" },
      { draws: [0.5, 0.5], icon: "wood", note: "Found some wood.", coins: 0, item: "wood" },
      { draws: [0.5, 0.7], icon: "fish", note: "Found some fish.", coins: 0, item: "fish" },
      { draws: [0.5, 0.9], icon: "stone", note: "Found some stone.", coins: 0, item: "stone" },
    ];
    for (const gift of six) {
      start({ form: "gravelhorn" });
      game.rand = seq(0, GIFT_DRAW, ...gift.draws, 0);
      run(60);
      expect(game.view.invite, gift.note).toBe(gift.icon);
      expect(game.answerInitiative(), gift.note).toEqual({ kind: "gift", levelUp: null, over: true });
      expect([game.note, game.save.coins, game.save.inventory], gift.note).toEqual([gift.note, gift.coins, gift.item ? { [gift.item]: 1 } : {}]);
    }
  });
});

describe("what blocks an initiative", () => {
  // Games that cannot be unblocked (a different kind of game): only "none is made" is asked of them.
  const fixed: Record<string, () => Game> = {
    "Kid Mode": () => start({ adult: false }),
    "no creature (an egg)": () => {
      vi.setSystemTime(T0);
      const egg = newSave(T0, 1);
      egg.settings.adultMode = true;
      game = new Game(egg);
      game.rand = () => 0;
      return game;
    },
    "a dead creature": () => {
      start();
      killCreature(game.save, T0);
      return game;
    },
    "asleep": () => start({ t: at(23), set: { sleep: "night" } }), // (at night: by day the clock wakes it)
  };

  // The rest are one condition each, so that only that row blocks: the screen rows change the screen, a fight and a training session start the real thing on the room screen, the others set their field.
  type Row = { on: (g: Game) => void; off: (g: Game) => void };
  const rows: Record<string, Row> = {
    "away on a job": {
      on: (g) => (g.save.creature!.job = { spot: "meadow", startedAt: T0, endsAt: T0 + 24 * HOUR }),
      off: (g) => (g.save.creature!.job = null),
    },
    "a call": {
      on: (g) => {
        setStat(g.save, "hunger", 5);
        g.save.creature!.call = "hungry";
      },
      off: (g) => {
        setStat(g.save, "hunger", 70);
        g.save.creature!.call = null;
      },
    },
    "the habitat screen": { on: (g) => g.setScreen("habitat"), off: (g) => g.setScreen("room") },
    "the arena screen": { on: (g) => g.setScreen("arena"), off: (g) => g.setScreen("room") },
    "a fight": { on: (g) => expect(g.fight()).toBe("started"), off: (g) => (g.arena = null) }, // (the fight is `game.arena` on the room screen: the Arena screen is its own row)
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

  for (const [name, make] of Object.entries(fixed)) {
    it(`makes none while ${name} (120 seconds)`, () => {
      make();
      run(120);
      expect(game.initiative).toBeNull();
      expect(game.view.invite).toBeNull();
    });
  }

  for (const [name, row] of Object.entries(rows)) {
    it(`${name}: makes none for 120 seconds, holds the countdown (40 clear, 30 blocked, 19 clear: none; the 20th: made), and drops an active one at the next step`, () => {
      start();
      row.on(game);
      run(120);
      expect([game.initiative, game.view.invite]).toEqual([null, null]);
      row.off(game);

      start();
      run(40);
      row.on(game);
      run(30);
      expect(game.initiative).toBeNull();
      row.off(game);
      run(19);
      expect(game.initiative).toBeNull();
      run(1);
      expect(game.initiative).not.toBeNull();

      start();
      run(60);
      expect(game.initiative).not.toBeNull();
      row.on(game);
      game.stepInitiative(1000);
      expect([game.initiative, game.view.invite]).toEqual([null, null]);
    });
  }

  it("is not stopped by a creature out in a field (a clear game makes one at 60 s); the feed tray and a held finger are checked in the browser (init-craving, with a mutant for each)", () => {
    start({ set: { place: "land" } });
    expect(untilMade(75)).toBe(60);
  });

  it("wakes the screens when a blocker drops an active initiative, once", () => {
    start();
    run(60);
    game.menuOpen = true;
    const before = woken;
    game.stepInitiative(1000);
    expect([game.initiative, game.view.invite, woken - before]).toEqual([null, null, 1]);
    game.stepInitiative(1000);
    expect(woken - before).toBe(1); // (nothing left to drop: no second wake)
  });

  it("holds the countdown while the creature is out of view, keeps an active one, and lets it fade on time", () => {
    start();
    game.view.inView = false;
    run(120);
    expect(game.initiative).toBeNull();
    game.view.inView = true;
    run(59);
    expect(game.initiative).toBeNull();
    run(1);
    const shown = game.initiative;
    expect(shown).not.toBeNull();
    game.view.inView = false;
    run(29);
    expect(game.initiative).toBe(shown); // (not dropped by being unseen)
    run(1);
    expect(game.initiative).toBeNull(); // (the fade runs on the clock, seen or not)
  });

  it("counts only 2 seconds for a tab that was hidden for 10 minutes (one tick after the gap)", () => {
    start();
    vi.advanceTimersByTime(600_000);
    game.tick();
    run(57); // 2 s + 57 s = 59 s counted
    expect(game.initiative).toBeNull();
    run(1);
    expect(game.initiative).not.toBeNull();
  });

  it("drops a craving at the next step when its food is no longer accepted, and keeps one that still is", () => {
    start();
    const food = cravingFoods(game.save.creature!)[0]!;
    offer("craving", { food });
    run(1);
    expect(game.initiative).not.toBeNull();
    setStat(game.save, "hunger", 100); // full: a meal is refused now
    run(1);
    expect(game.initiative).toBeNull();
  });
});

describe("answering a gift or a play", () => {
  it("takes a coin gift once: 2 coins, one note, one log line, one save; a second tap finds nothing", () => {
    start();
    offer("gift", { gift: { kind: "coins", amount: 2 } });
    const coins = game.save.coins;
    const logged = game.save.log.length;
    expect(game.answerInitiative()).toEqual({ kind: "gift", levelUp: null, over: true });
    expect([game.save.coins - coins, game.note, game.initiative]).toEqual([2, "Found 2 coins.", null]);
    expect(game.save.log.length - logged).toBe(1);
    vi.advanceTimersByTime(1000); // (the save is written 600 ms after a change)
    expect(told.filter((byPlayer) => byPlayer)).toEqual([true]);
    expect(game.answerInitiative()).toBeNull();
    expect(game.save.coins - coins).toBe(2);
  });

  it("takes a material gift once: 1 of that material, the note names it", () => {
    start();
    offer("gift", { gift: { kind: "material", id: "herb" } });
    const had = game.save.inventory.herb ?? 0;
    game.answerInitiative();
    expect([(game.save.inventory.herb ?? 0) - had, game.note]).toEqual([1, "Found some herbs."]);
    expect(game.answerInitiative()).toBeNull();
    expect((game.save.inventory.herb ?? 0) - had).toBe(1);
  });

  it("pays 2 Bond XP a toss, six tosses in all (12), and the sixth ends the play; a seventh pays nothing", () => {
    start();
    offer("play");
    const first = xpOf();
    for (let toss = 1; toss <= 5; toss++) {
      expect(game.answerInitiative()).toEqual({ kind: "play", levelUp: null, over: false });
      expect(xpOf() - first).toBe(2 * toss);
    }
    expect(game.answerInitiative()).toEqual({ kind: "play", levelUp: null, over: true });
    expect([xpOf() - first, game.initiative]).toEqual([12, null]);
    expect(game.answerInitiative()).toBeNull();
    expect(xpOf() - first).toBe(12);
  });

  it("ends a play 15 seconds after the first toss (14 s: a toss still pays; 15 s: gone), and pays the tosses made", () => {
    start();
    offer("play");
    const first = xpOf();
    game.answerInitiative();
    run(14);
    expect(game.initiative).not.toBeNull();
    expect(game.answerInitiative()).toEqual({ kind: "play", levelUp: null, over: false });
    expect(xpOf() - first).toBe(4);
    run(1);
    expect(game.initiative).toBeNull();
    expect(game.answerInitiative()).toBeNull();
    expect(xpOf() - first).toBe(4);
  });

  it("reports the Bond level a toss reaches, once, and logs it as a pet does", () => {
    start();
    offer("play");
    const c = game.save.creature!;
    c.bond = { xp: tuning.bond.levelAt[1]! - 2, chain: 0, at: 0 }; // 2 XP under level 2
    expect(game.answerInitiative()).toEqual({ kind: "play", levelUp: 2, over: false });
    expect(game.answerInitiative()).toEqual({ kind: "play", levelUp: null, over: false });
    expect(game.save.log.filter((line) => line.text === "Bond level 2").length).toBe(1);
  });

  it("does nothing for a craving, for no initiative, in Kid Mode, for another creature's offer, or while blocked (and a blocked tap clears it)", () => {
    start();
    expect(game.answerInitiative()).toBeNull();
    offer("craving", { food: "pellet" });
    expect(game.answerInitiative()).toBeNull();
    expect(game.initiative).not.toBeNull(); // (a tap on a craving does nothing: it is answered by feeding)

    offer("gift", { gift: { kind: "coins", amount: 2 } });
    const coins = game.save.coins;
    game.menuOpen = true; // a panel opened since the last tick
    expect(game.answerInitiative()).toBeNull();
    expect([game.save.coins, game.initiative]).toEqual([coins, null]);

    game.menuOpen = false;
    offer("gift", { gift: { kind: "coins", amount: 2 }, bornAt: game.save.creature!.bornAt + 1 });
    expect(game.answerInitiative()).toBeNull();
    expect([game.save.coins, game.initiative]).toEqual([coins, null]);

    start({ adult: false });
    offer("gift", { gift: { kind: "coins", amount: 2 } });
    expect(game.answerInitiative()).toBeNull();
    expect(game.save.coins).toBe(0);
  });

  it("still answers while the creature counts as out of view (the answer tests the blockers, not unseen: a half-hidden creature's bubble can be on screen)", () => {
    start();
    offer("gift", { gift: { kind: "coins", amount: 2 } });
    game.view.inView = false;
    expect(game.answerInitiative()).not.toBeNull();
    expect(game.save.coins).toBe(2);
  });
});

describe("feeding and a craving", () => {
  it("pays 8 Bond XP once for a meal of the food asked for, and ends the craving", () => {
    start();
    const c = game.save.creature!;
    const food = cravingFoods(c)[0]!;
    offer("craving", { food });
    const first = xpOf();
    expect(game.feed(food)).toEqual({ result: "ate", levelUp: null });
    expect([xpOf() - first, game.initiative]).toEqual([8, null]);
    setStat(game.save, "hunger", 10);
    game.feed(food);
    expect(xpOf() - first).toBe(8); // (no craving: the second meal pays no Bond XP)
  });

  it("reports the level a craving reaches", () => {
    start();
    const food = cravingFoods(game.save.creature!)[0]!;
    offer("craving", { food });
    game.save.creature!.bond = { xp: tuning.bond.levelAt[1]! - 8, chain: 0, at: 0 };
    expect(game.feed(food)).toEqual({ result: "ate", levelUp: 2 });
  });

  it("pays nothing for a meal of the food asked for while the game is blocked (a panel open)", () => {
    start();
    const food = cravingFoods(game.save.creature!)[0]!;
    offer("craving", { food });
    game.menuOpen = true;
    const first = xpOf();
    expect(game.feed(food)).toEqual({ result: "ate", levelUp: null });
    expect(xpOf() - first).toBe(0);
  });

  it("pays nothing for another food and leaves the craving", () => {
    start();
    const c = game.save.creature!;
    const food = cravingFoods(c)[0]!;
    const other = menuOf(c).find((f) => f !== food && f !== "treat")!;
    offer("craving", { food });
    const first = xpOf();
    expect(game.feed(other).result).toBe("ate");
    expect(xpOf() - first).toBe(0);
    expect(game.initiative?.food).toBe(food);
  });

  it("is answered by a dish of the food it asked for (a kid in a field that owns a booster)", () => {
    start({ form: stageForm("kid") });
    const c = game.save.creature!;
    const id = dishIds.find((d) => items[d].dish!.also === undefined)!; // a booster: one food, counted as a whole cell
    game.save.owned.push(id);
    const food = dishMeal(c, id)!.eats;
    expect(cravingFoods(c)).toContain(food);
    offer("craving", { food });
    const first = xpOf();
    expect(game.feed(food, id)).toEqual({ result: "ate", levelUp: null });
    expect([xpOf() - first, game.initiative]).toEqual([8, null]);
  });

  it("pays nothing for a meal refused because the creature is asleep, and leaves the craving for the next step to drop", () => {
    start({ t: at(23), set: { sleep: "night" } });
    const food = menuOf(game.save.creature!).find((f) => f !== "treat")!;
    offer("craving", { food });
    const first = xpOf();
    expect(game.feed(food)).toEqual({ result: "sleeping", levelUp: null });
    expect([xpOf() - first, game.initiative?.food]).toEqual([0, food]);
    run(1);
    expect(game.initiative).toBeNull();
  });

  it("pays nothing for a refused meal (full), leaves the craving there, and the next step drops it as moot", () => {
    start();
    const food = cravingFoods(game.save.creature!)[0]!;
    offer("craving", { food });
    setStat(game.save, "hunger", 100);
    const first = xpOf();
    expect(game.feed(food)).toEqual({ result: "full", levelUp: null });
    expect([xpOf() - first, game.initiative?.food]).toEqual([0, food]);
    run(1);
    expect(game.initiative).toBeNull();
  });

  it("answers a craving made by the clock (a real one, from tick to meal)", () => {
    start({ form: "gravelhorn" });
    game.rand = seq(0, CRAVING_DRAW, 0, 0);
    run(60);
    const food = game.initiative!.food!;
    const first = xpOf();
    expect(game.feed(food).result).toBe("ate");
    expect(xpOf() - first).toBe(8);
  });

  it("is the old feeding in Kid Mode: the same result and the same save as `act(feed)` on a copy of the game", () => {
    const make = (): Game => {
      vi.setSystemTime(T0);
      return new Game(careState(stageForm("adult"), {}, T0));
    };
    const viaFeed = make();
    const viaAct = make();
    expect(viaFeed.feed("pellet")).toEqual({ result: "ate", levelUp: null });
    expect(viaAct.act((s, now) => feed(s, "pellet", now))).toBe("ate");
    expect(JSON.stringify(viaFeed.save)).toBe(JSON.stringify(viaAct.save));
  });
});

describe("ignoring everything costs nothing", () => {
  it("leaves the save and every call the same as a control run with the creature out of view, over 20 minutes", () => {
    // Two games on the one fake clock, each with its own record of what it told the screens and the disk.
    const make = (): { g: Game; told: boolean[] } => {
      const save = careState(stageForm("adult"), {}, T0);
      save.settings.adultMode = true;
      const g = new Game(save);
      const record: boolean[] = [];
      g.onSave = (byPlayer) => record.push(byPlayer);
      g.rand = () => 0.3;
      return { g, told: record };
    };
    vi.setSystemTime(T0);
    const real = make();
    const control = make();
    control.g.view.inView = false; // never sees an initiative
    let made = 0;
    let last: Initiative | null = null;
    for (let s = 0; s < 1200; s++) {
      vi.advanceTimersByTime(1000);
      real.g.tick();
      control.g.tick();
      if (real.g.initiative && real.g.initiative !== last) made++;
      last = real.g.initiative;
    }
    expect(made).toBeGreaterThanOrEqual(3);
    expect(control.g.initiative).toBeNull();
    expect(JSON.stringify(real.g.save)).toBe(JSON.stringify(control.g.save));
    expect(real.told).toEqual(control.told);
    expect(real.told.includes(true)).toBe(false);
    expect(real.told.length).toBeGreaterThan(0); // (the clock's own changes were told, in both: the control is not silent)
  });
});

describe("what ends an initiative with no cost", () => {
  it("is ended at once by changing the screen, starting Decorate mode or a training session", () => {
    start();
    run(60);
    game.setScreen("habitat");
    expect([game.initiative, game.view.invite]).toEqual([null, null]);
    game.setScreen("room");
    expect(untilMade(75)).toBe(60); // (the countdown was drawn again after the first start: 60 s)

    game.view.world = "home"; // (the Stage sets it)
    expect(game.startDecor()).toBe(true);
    expect(game.initiative).toBeNull();
    game.endDecor();

    start();
    run(60);
    expect(game.startTraining()).toBe("started");
    expect(game.initiative).toBeNull();
  });

  it("is ended by retiring, by Adult Mode going off, and by another creature hatching (its bornAt differs)", () => {
    start();
    run(60);
    game.act((save, now) => {
      save.settings.adultMode = false;
      return now;
    });
    expect(game.initiative).toBeNull();

    start();
    run(60);
    game.act((save, now) => retireCreature(save, now));
    expect(game.initiative).toBeNull();

    start();
    run(60);
    game.save.creature!.bornAt += 1; // another hatched (the id of the creature an initiative was made for is gone)
    run(1);
    expect(game.initiative).toBeNull();
  });

  it("does not drop on every change: a pet and a meal go through `changed` and a gift stays", () => {
    start();
    const gift = offer("gift", { gift: { kind: "coins", amount: 2 } });
    game.act((save, now) => touch(save, "pet", now));
    expect(game.initiative).toBe(gift);
    game.act((save, now) => feed(save, "pellet", now));
    expect(game.initiative).toBe(gift);
  });

  it("is ended at once, with no tick, by the creature dying or another hatching", () => {
    start();
    offer("gift", { gift: { kind: "coins", amount: 2 } });
    game.act((save, now) => killCreature(save, now));
    expect([game.initiative, game.view.invite]).toEqual([null, null]);

    start();
    offer("gift", { gift: { kind: "coins", amount: 2 } });
    game.act((save) => {
      save.creature!.bornAt += 1;
    });
    expect(game.initiative).toBeNull();
  });

  it("zeroes the clock and draws a new wait when a different game is put in (replaceSave), and only then", () => {
    start();
    run(40); // 20 s left to the first
    const other = careState(stageForm("adult"), {}, T0);
    other.settings.adultMode = true;
    game.replaceSave(other);
    expect(game.initiative).toBeNull();
    run(59);
    expect(game.initiative).toBeNull(); // (not made after the 20 s left: the wait was drawn again)
    run(1);
    expect(game.initiative).not.toBeNull();
    expect(game.initiative?.at).toBe(60_000); // (the clock began again at 0: it was 40,000 when the game was put in)
  });

  it("is not changed by a dev speed: the wait counts real time, not game time", () => {
    start();
    game.devSpeed = 10;
    run(59);
    expect(game.initiative).toBeNull();
    run(1);
    expect(game.initiative).not.toBeNull();
  });
});

describe("where the bubble is", () => {
  const poses: Pose[] = ["idle", "walk", "hop", "happy", "startle", "refuse", "wobble", "rumble", "eat", "sleep", "yawn"];
  const SIZE = 24;
  const WORLD = 768;

  it("sits over the creature's head, 12 by 15, with the call's clamp at the left and right ends", () => {
    const view = createView();
    view.x = 100;
    view.y = 60;
    expect(bubbleBox(view, SIZE, WORLD)).toEqual({ x: 122, y: 24, w: 12, h: 15 }); // x + size - 2, y - size - 12
    view.x = 0;
    view.y = 10;
    expect(bubbleBox(view, SIZE, WORLD)).toEqual({ x: 22, y: 0, w: 12, h: 15 }); // (not above the top)
    view.x = WORLD - SIZE;
    expect(bubbleBox(view, SIZE, WORLD).x).toBe(WORLD - 12); // (not past the right wall)
    view.x = -40;
    expect(bubbleBox(view, SIZE, WORLD).x).toBe(0); // (not past the left wall)
    view.x = 100.6;
    view.y = 60;
    expect(bubbleBox(view, SIZE, WORLD).x).toBe(123); // (the creature is drawn at a whole pixel: 101 + 24 - 2)
    view.x = 100.4;
    expect(bubbleBox(view, SIZE, WORLD).x).toBe(122); // (100 + 24 - 2)
  });

  it("follows the creature's pose: the box is the resting box plus the pose's own offset (every pose, four times in it; the draw and the tap both call it, and init-hit tries a real tap)", () => {
    for (const pose of poses) {
      for (const t of [0, 0.1, 0.25, 0.4]) {
        const view = createView();
        view.x = 200;
        view.y = 90;
        triggerPose(view, pose);
        view.poseTime = t;
        const box = bubbleBox(view, SIZE, WORLD);
        const rest = bubbleBox({ ...view, pose: "idle", poseTime: 0 }, SIZE, WORLD);
        const off = poseOffsets(view);
        expect([box.x - rest.x + 0, box.y - rest.y + 0], `${pose} at ${t}`).toEqual([off.dx + 0, off.dy + 0]); // (+ 0: a rounded -0 is 0)
      }
    }
  });

  it("is 8 pixels higher at the top of a startle and 6 at the top of a hop (literals)", () => {
    for (const [pose, up] of [
      ["startle", 8],
      ["hop", 6],
    ] as const) {
      const view = createView();
      view.x = 200;
      view.y = 90;
      triggerPose(view, pose);
      view.poseTime = view.poseLength / 2;
      expect(bubbleBox(view, SIZE, WORLD).y, pose).toBe(90 - SIZE - up - 12);
    }
  });
});
