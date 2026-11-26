// The request board (adult track A2.3): which requests are drawn, how the things the player does count toward them, when they pay, how the board refills
// and what a saved board may hold. The edge cases are numbered as in docs/adult-a2-plan.md section 11; "edge N" below is that list. Expected values are
// written out by hand (food, spot and item ids from the data files, coin numbers from the plan), never made by the code under test.
import { describe, expect, it } from "vitest";
import { forms, getForm } from "../src/data/forms";
import { fieldOfForm } from "../src/data/fields";
import { specialId } from "../src/data/special";
import { itemIds } from "../src/data/shop";
import { retireCreature, callBack, clean, endFight, feed, goTo, startJob } from "../src/game/actions";
import { freshBoard, migrateBoard } from "../src/game/board";
import type { Request } from "../src/game/board";
import { beginFight } from "../src/game/combat/fight";
import { forceEvolve, forceHatch, killCreature } from "../src/game/dev";
import { coinsFor, fits, minutesToNext, noteRequest, paidNote, purchaseCounted, requestProgress, requestWords, staleRequest, stepRequests, targetsFor } from "../src/game/requests";
import { buy, undoBuy, useHat } from "../src/game/shop";
import { simulateTo } from "../src/game/sim";
import { menuOf } from "../src/game/growth";
import { migrateSave, newSave } from "../src/game/state";
import type { Save } from "../src/game/state";
import { HOUR, MINUTE } from "../src/game/time";
import type { Place } from "../src/game/types";
import { touch } from "../src/game/actions";
import { isUntouched } from "../src/sync/sync";
import type { Rng } from "../src/game/rng";
import { aliveSave, at } from "./helpers";

const T0 = at(10); // 10:00 on the player's own clock: awake, and the day is long
const DAY = 24 * HOUR;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

// A living creature of the form at T0, Adult Mode on (the board only runs there).
function adultSave(formId = "pebblin", t = T0): Save {
  const save = aliveSave(formId, t);
  save.settings.adultMode = true;
  return save;
}

const minutes = (save: Save, n: number): void => void simulateTo(save, save.lastSimulatedAt + n * MINUTE);

// A request written out by hand.
const req = (o: Pick<Request, "type" | "target"> & Partial<Request>): Request => ({ id: 0, have: 0, item: null, drewAt: T0, ...o });

// Exactly these requests on the board, and the other slots busy (waiting) for 15 minutes, so nothing else is drawn while a test counts.
function only(save: Save, ...open: Request[]): void {
  save.board.open = open;
  save.board.waits = Array.from({ length: 3 - open.length }, () => ({ doneAt: save.lastSimulatedAt, coins: 0, item: null }));
}

// A generator that can only be read: asking it for a number fails the test.
const readOnlyRng = (state: number): Rng => ({
  next: () => {
    throw new Error("the board advanced the generator");
  },
  int: () => {
    throw new Error("the board advanced the generator");
  },
  chance: () => {
    throw new Error("the board advanced the generator");
  },
  pick: () => {
    throw new Error("the board advanced the generator");
  },
  state: () => state,
});

// Clears the board and steps a minute, `times` times over: every request drawn, in order, with the board each draw saw.
function drawMany(save: Save, times: number): Request[][] {
  const rounds: Request[][] = [];
  for (let i = 0; i < times; i++) {
    save.board.open = [];
    save.board.waits = [];
    minutes(save, 1);
    rounds.push(clone(save.board.open));
  }
  return rounds;
}

// What each stage may be asked for, written out by hand from data/habitat.ts, data/combat.ts and data/shop.ts.
const FIELD_FOODS = { land: ["meat", "carrot", "worm"], water: ["seafood", "seaweed", "shrimp"], sky: ["chicken", "corn", "syrup"] } as const;
const SPOTS: Record<string, string[]> = {
  baby: ["meadow", "herbs"],
  kid: ["meadow", "herbs"],
  young: ["meadow", "herbs", "trees", "pond"],
  adult: ["meadow", "herbs", "trees", "pond", "rocks"],
};
// Items whose materials a baby, a kid or the special can gather (Fiber and Herbs only), then a young (plus Wood and Fish), then an adult (plus Stone).
// (the hats cost Fiber, Wood, Fish and Stone: the Knit Cap at every stage, the Acorn Cap and the Fisher Hat from a young, the Stone Crown at an adult)
const BUY_LOW = ["feeding-mat", "wall-meadow", "green-bowl", "sweet-bowl", "hat-knit"];
const BUY_YOUNG = [...BUY_LOW, "comfy-bed", "hearty-bowl", "hat-acorn", "hat-fisher"];
const BUY_ADULT = ["comfy-bed", "feeding-mat", "wall-meadow", "wall-dusk", "hearty-bowl", "green-bowl", "sweet-bowl", "stew", "garden-mix", "hat-knit", "hat-acorn", "hat-fisher", "hat-crown", "room-play"]; // (the Playroom needs Wood and Stone: an adult)
const BUY_BY_STAGE: Record<string, string[]> = { baby: BUY_LOW, kid: BUY_LOW, young: BUY_YOUNG, adult: BUY_ADULT };

describe("drawing (edges 1 to 6)", () => {
  it("deals 3 requests at the first whole minute of a living creature in Adult Mode, and not before (edge 1)", () => {
    const save = adultSave();
    simulateTo(save, T0 + 30_000);
    expect(save.board).toEqual({ open: [], waits: [], drawn: 0, done: 0 });
    simulateTo(save, T0 + MINUTE);
    expect(save.board.open.map((r) => r.id)).toEqual([0, 1, 2]);
    expect(save.board.waits).toEqual([]);
    expect(save.board.drawn).toBe(3);
    expect(save.board.done).toBe(0);
    expect(save.board.open.every((r) => r.have === 0 && r.drewAt === T0 + MINUTE)).toBe(true);
  });

  it("deals nothing in Kid Mode, to an egg, or to a dead creature, and the setting must be exactly true (edge 1)", () => {
    const kid = aliveSave("pebblin", T0);
    minutes(kid, 120);
    expect(kid.board).toEqual(freshBoard());

    const egg = newSave(T0, 1);
    egg.settings.adultMode = true;
    minutes(egg, 10);
    expect(egg.phase).toBe("egg");
    expect(egg.board).toEqual(freshBoard());

    const dead = adultSave();
    killCreature(dead, T0);
    minutes(dead, 120);
    expect(dead.phase).toBe("dead");
    expect(dead.board).toEqual(freshBoard());

    const odd = adultSave();
    (odd.settings as { adultMode?: unknown }).adultMode = 1;
    minutes(odd, 60);
    expect(odd.board).toEqual(freshBoard());
  });

  it("takes nothing from the game's random numbers: a day with the board on and off differs only in the board (edge 1)", () => {
    const on = adultSave();
    const off = aliveSave("pebblin", T0);
    minutes(on, 300);
    minutes(off, 300);
    expect(on.board.open).toHaveLength(3);
    const strip = (s: Save) => ({ ...s, board: null, settings: null });
    expect(strip(on)).toEqual(strip(off));
    expect(on.rngState).toBe(off.rngState);
  });

  it("reads the simulation's generator without advancing it, and seeds from it and not from the saved state (edge 1)", () => {
    const save = adultSave();
    stepRequests(save, readOnlyRng(777), T0 + MINUTE); // a generator that fails when asked for a number
    expect(save.board.open).toHaveLength(3);

    const dealt = (live: number, saved: number): unknown => {
      const s = adultSave();
      s.rngState = saved;
      stepRequests(s, readOnlyRng(live), T0 + MINUTE);
      return s.board.open.map(({ id, type, target, item }) => ({ id, type, target, item }));
    };
    expect(dealt(5, 1)).toEqual(dealt(5, 999)); // the saved state does not matter
    const distinct = new Set(Array.from({ length: 30 }, (_, live) => JSON.stringify(dealt(live + 1, 1))));
    expect(distinct.size).toBeGreaterThan(10); // the live state does
  });

  it("only draws what the creature can do, for every form and many seeds (edge 2)", () => {
    let draws = 0;
    for (const id of Object.keys(forms)) {
      const stage = getForm(id).stage;
      const field = id === specialId ? null : fieldOfForm(id);
      const foodsOk = ["pellet", ...(field ? FIELD_FOODS[field] : [])];
      for (let seed = 1; seed <= 12; seed++) {
        const save = adultSave(id);
        save.rngState = seed;
        minutes(save, 1);
        const c = save.creature!;
        for (const r of save.board.open) {
          draws++;
          expect(fits(save, c, r), `${id} ${r.type} ${r.target}`).toBe(true);
          if (r.type === "feed") expect(foodsOk, `${id} feed ${r.target}`).toContain(r.target);
          if (r.type === "job") expect(SPOTS[stage], `${id} job ${r.target}`).toContain(r.target);
          if (r.type === "fight") expect(stage, `${id} fight`).not.toBe("baby");
          if (r.type === "buy") expect(BUY_BY_STAGE[stage], `${id} buy ${r.target}`).toContain(r.target);
          if (r.type === "field") expect(["land", "water", "sky"]).toContain(r.target);
          expect(r.target).not.toBe("treat");
        }
      }
    }
    expect(Object.keys(forms).length).toBeGreaterThanOrEqual(65);
    expect(draws).toBe(Object.keys(forms).length * 12 * 3);
  });

  it("draws everything the stage allows and nothing else, over many seeds (edge 2)", () => {
    const pools: Array<{ form: string; feed: string[]; job: string[]; fight: boolean; buy: string[] }> = [
      { form: "blip", feed: ["pellet"], job: SPOTS.baby!, fight: false, buy: BUY_LOW },
      { form: "pebblin", feed: ["pellet", "meat", "carrot", "worm"], job: SPOTS.kid!, fight: true, buy: BUY_LOW },
      { form: specialId, feed: ["pellet"], job: SPOTS.kid!, fight: true, buy: BUY_LOW },
      { form: "cragpup", feed: ["pellet", "meat", "carrot", "worm"], job: SPOTS.young!, fight: true, buy: BUY_YOUNG },
      { form: "gravelhorn", feed: ["pellet", "meat", "carrot", "worm"], job: SPOTS.adult!, fight: true, buy: BUY_ADULT },
    ];
    for (const pool of pools) {
      const seen = { feed: new Set<unknown>(), field: new Set<unknown>(), job: new Set<unknown>(), fight: new Set<unknown>(), buy: new Set<unknown>() };
      for (let seed = 1; seed <= 250; seed++) {
        const save = adultSave(pool.form);
        save.rngState = seed;
        minutes(save, 1);
        for (const r of save.board.open) seen[r.type].add(r.target);
      }
      const sorted = (set: Set<unknown>): unknown[] => [...set].sort();
      expect(sorted(seen.feed), pool.form).toEqual([...pool.feed].sort());
      expect(sorted(seen.field), pool.form).toEqual(["land", "sky", "water"]);
      expect(sorted(seen.job), pool.form).toEqual([...pool.job].sort());
      expect(sorted(seen.fight), pool.form).toEqual(pool.fight ? [null] : []);
      expect(sorted(seen.buy), pool.form).toEqual([...pool.buy].sort());
    }
  });

  it("each draw has a seed of its own: the three requests dealt together are not all of one type, over many seeds (edge 5)", () => {
    let mixed = 0;
    for (let live = 1; live <= 40; live++) {
      const save = adultSave("pebblin");
      stepRequests(save, readOnlyRng(live), T0 + MINUTE);
      expect(save.board.open).toHaveLength(3);
      if (new Set(save.board.open.map((r) => r.type)).size >= 2) mixed += 1;
    }
    expect(mixed).toBeGreaterThanOrEqual(30); // draws that shared one seed would pick the same type each time (5 types: all three alike is 4 in 100)
  });

  it("a bag that covers a material widens what a baby can be asked to buy (edge 2)", () => {
    const save = adultSave("blip");
    const c = save.creature!;
    expect(targetsFor(save, c, "buy").sort()).toEqual([...BUY_LOW].sort());
    save.inventory.wood = 2; // Comfy Bed costs Fiber 3 and Wood 2: the Fiber can be gathered, the Wood is in the bag
    expect(targetsFor(save, c, "buy")).toContain("comfy-bed");
    save.inventory.wood = 1;
    expect(targetsFor(save, c, "buy")).not.toContain("comfy-bed");
  });

  it("never names the same type and target twice, an owned item, or an item another request pays (edges 3 and 4)", () => {
    const save = adultSave("gravelhorn");
    save.owned = ["comfy-bed", "stew"];
    const rounds = drawMany(save, 40);
    for (const round of rounds) {
      const keys = round.map((r) => `${r.type}:${r.target}`);
      expect(new Set(keys).size).toBe(keys.length);
      const bought = round.filter((r) => r.type === "buy").map((r) => r.target);
      expect(bought).not.toContain("comfy-bed");
      expect(bought).not.toContain("stew");
      for (const r of round) {
        if (r.item === null) continue;
        expect(["comfy-bed", "stew"]).not.toContain(r.item);
        expect(bought).not.toContain(r.item);
      }
    }
  });

  it("with two items left to own, a reward is never the item a buy request names in the same round (edge 4)", () => {
    const save = adultSave("gravelhorn");
    const left = ["feeding-mat", "wall-dusk"];
    save.owned = itemIds.filter((id) => !left.includes(id)); // so a buy request and a reward often reach for the same item, unless the rules keep them apart
    let buys = 0;
    let rewards = 0;
    for (const round of drawMany(save, 40)) {
      const bought = round.filter((r) => r.type === "buy").map((r) => r.target);
      buys += bought.length;
      for (const r of round) {
        if (r.item === null) continue;
        rewards += 1;
        expect(bought, `request ${r.id} pays ${r.item}`).not.toContain(r.item);
      }
    }
    expect(buys).toBeGreaterThan(5); // a run with no buy request or no reward would pass for nothing
    expect(rewards).toBeGreaterThan(5);
  });

  it("carries an item on draws 3, 7, 11 and so on, counted from 0, and no other (edge 4)", () => {
    const save = adultSave("gravelhorn");
    const drawn = drawMany(save, 20).flat();
    expect(drawn.map((r) => r.id)).toEqual(Array.from({ length: 60 }, (_, i) => i));
    for (const r of drawn) expect(r.item !== null, `draw ${r.id}`).toBe(r.id % 4 === 3);
    expect(drawn.filter((r) => r.item !== null)).toHaveLength(15);
    expect(drawn.filter((r) => r.item !== null).every((r) => itemIds.includes(r.item as never))).toBe(true);
  });

  it("with every item owned there are no buy requests and no reward items (edge 3)", () => {
    const save = adultSave("gravelhorn");
    save.owned = [...itemIds];
    const drawn = drawMany(save, 30).flat();
    expect(drawn.some((r) => r.type === "buy")).toBe(false);
    expect(drawn.every((r) => r.item === null)).toBe(true);
    expect(drawn).toHaveLength(90);
  });

  it("with only the four hats left to own, a buy request names a hat the creature can pay for and a reward is a hat (hats plan, edge 19)", () => {
    const save = adultSave("gravelhorn");
    const hats = ["hat-knit", "hat-acorn", "hat-fisher", "hat-crown"];
    save.owned = itemIds.filter((id) => !hats.includes(id));
    expect(targetsFor(save, save.creature!, "buy").sort()).toEqual([...hats].sort());
    const drawn = drawMany(save, 40).flat();
    const bought = drawn.filter((r) => r.type === "buy").map((r) => r.target as string);
    const rewards = drawn.filter((r) => r.item !== null).map((r) => r.item as string);
    expect(bought.length).toBeGreaterThan(5); // a run with no buy request or no reward would pass for nothing
    expect(rewards.length).toBeGreaterThan(5);
    expect(bought.every((id) => hats.includes(id))).toBe(true);
    expect(rewards.every((id) => hats.includes(id))).toBe(true);
  });

  it("a buy request may name the Playroom, and a reward is never the Playroom, owning nothing at all (home plan section 16, G11)", () => {
    const save = adultSave("gravelhorn");
    save.owned = [];
    expect(targetsFor(save, save.creature!, "buy")).toContain("room-play"); // (an adult can gather Wood and Stone)
    const rewards = drawMany(save, 60).flat().filter((r) => r.item !== null).map((r) => r.item as string);
    expect(rewards.length).toBeGreaterThan(5); // a run with no reward would pass for nothing
    expect(rewards).not.toContain("room-play");
    expect(new Set(rewards).size).toBeGreaterThan(3); // (the other items still come)
  });

  it("with only the Playroom left to own, a buy request may name it and no reward is ever drawn (the pool is empty: a room is never a gift)", () => {
    const save = adultSave("gravelhorn");
    save.owned = itemIds.filter((id) => id !== "room-play");
    expect(targetsFor(save, save.creature!, "buy")).toEqual(["room-play"]);
    const drawn = drawMany(save, 40).flat();
    expect(drawn.filter((r) => r.type === "buy").length).toBeGreaterThan(5); // a run with no buy request would pass for nothing
    expect(drawn.filter((r) => r.item !== null)).toEqual([]);
  });

  it("a field request can always be drawn: three fields and at most two other open requests (edge 3)", () => {
    const save = adultSave("pebblin");
    const c = save.creature!;
    save.board.open = [req({ id: 1, type: "field", target: "land" }), req({ id: 2, type: "field", target: "water" })];
    expect(targetsFor(save, c, "field")).toEqual(["sky"]);
  });

  it("the same save and time give the same board however the minutes are split, and through a JSON round trip (edge 5)", () => {
    const start = (): Save => {
      const save = adultSave("pebblin");
      save.creature!.poop = 2; // two on the floor: care draws a number for sickness every awake minute, so the saved generator moves
      save.board.open = [req({ id: 0, type: "feed", target: "pellet" })];
      save.board.drawn = 1;
      save.board.waits = [
        { doneAt: T0, coins: 2, item: null },
        { doneAt: T0 - 5 * MINUTE, coins: 3, item: null },
      ];
      return save;
    };
    const whole = start();
    minutes(whole, 40);
    const stepped = start();
    for (let i = 0; i < 40; i++) minutes(stepped, 1);
    let reloaded = start();
    for (let i = 0; i < 40; i++) {
      minutes(reloaded, 1);
      if (i % 7 === 0) reloaded = JSON.parse(JSON.stringify(reloaded)) as Save;
    }
    expect(whole.board.open).toHaveLength(3); // both waits ran out (at 10 and 15 minutes) and were drawn
    expect(whole.board.drawn).toBe(3);
    expect(JSON.stringify(stepped)).toBe(JSON.stringify(whole));
    expect(JSON.stringify(reloaded)).toBe(JSON.stringify(whole));
  });

  it("draws a waiting slot again exactly 15 minutes after it was done, each slot on its own clock (edge 6)", () => {
    const save = adultSave("pebblin");
    save.board.open = [req({ id: 0, type: "feed", target: "pellet" })];
    save.board.drawn = 1;
    save.board.waits = [
      { doneAt: T0, coins: 2, item: null }, // free at T0 + 15 minutes
      { doneAt: T0 - 5 * MINUTE, coins: 3, item: null }, // free at T0 + 10 minutes
    ];
    const open = (): number => save.board.open.length;
    minutes(save, 9);
    expect(open()).toBe(1);
    minutes(save, 1); // 10 minutes: the older slot
    expect(open()).toBe(2);
    expect(save.board.open[1]!.drewAt).toBe(T0 + 10 * MINUTE);
    expect(save.board.waits).toEqual([{ doneAt: T0, coins: 2, item: null }]);
    minutes(save, 4); // 14 minutes
    expect(open()).toBe(2);
    minutes(save, 1); // 15 minutes: the other
    expect(open()).toBe(3);
    expect(save.board.waits).toEqual([]);
    expect(save.board.open[2]!.drewAt).toBe(T0 + 15 * MINUTE);
  });
});

describe("counting (edges 7 to 12)", () => {
  function meatSave(hunger = 30): Save {
    const save = adultSave("pebblin");
    save.creature!.stats.hunger = hunger;
    only(save, req({ id: 5, type: "feed", target: "meat" }));
    return save;
  }

  it("counts a meal of the named food, pays on the second, and counts nothing after that (edge 7)", () => {
    const save = meatSave();
    expect(feed(save, "meat", T0)).toBe("ate");
    expect(save.board.open[0]!.have).toBe(1);
    expect(save.coins).toBe(0);
    expect(feed(save, "meat", T0)).toBe("ate");
    expect(save.coins).toBe(2);
    expect(save.board.open).toEqual([]);
    expect(save.board.waits.at(-1)).toEqual({ doneAt: T0, coins: 2, item: null });
    expect(save.board.done).toBe(1);
    save.creature!.stats.hunger = 10;
    expect(feed(save, "meat", T0)).toBe("ate"); // a third meal of the same food counts for no request
    expect(save.coins).toBe(2);
    expect(save.board.done).toBe(1);
  });

  it("counts nothing for a refused meal, another food, or a food off the menu (edge 7)", () => {
    const full = meatSave(97);
    expect(feed(full, "meat", T0)).toBe("full");
    expect(full.board.open[0]!.have).toBe(0);

    const asleep = meatSave();
    asleep.creature!.sleep = "night";
    expect(feed(asleep, "meat", T0)).toBe("sleeping");
    expect(asleep.board.open[0]!.have).toBe(0);

    const away = meatSave();
    away.creature!.job = { spot: "meadow", startedAt: T0, endsAt: T0 + 3 * MINUTE };
    expect(feed(away, "meat", T0)).toBe("unavailable");
    expect(away.board.open[0]!.have).toBe(0);

    const off = meatSave();
    expect(feed(off, "seafood", T0)).toBe("unavailable"); // a Land kid is not offered Water's food
    expect(off.board.open[0]!.have).toBe(0);

    const other = meatSave();
    expect(feed(other, "carrot", T0)).toBe("ate");
    expect(feed(other, "pellet", T0)).toBe("ate");
    expect(other.board.open[0]!.have).toBe(0);
  });

  it("a dish meal counts as a meal of the food it is a meal of (edge 7)", () => {
    const save = meatSave();
    save.owned = ["stew"]; // Stew is a meal of the filling food (Meat for Land) that also counts a serving of the light one
    expect(feed(save, "meat", T0, "stew")).toBe("ate");
    expect(save.board.open[0]!.have).toBe(1);
  });

  it("counts from the moment it is drawn: what the stage has counted already is not added (edge 7)", () => {
    let feeds = 0;
    for (let live = 1; live <= 40; live++) {
      const save = adultSave("pebblin");
      for (const food of menuOf(save.creature!)) save.creature!.counters.servings[food] = 6; // six servings of every food already
      save.board.open = [];
      save.board.waits = [];
      stepRequests(save, readOnlyRng(live), T0 + MINUTE);
      for (const r of save.board.open.filter((d) => d.type === "feed")) {
        feeds += 1;
        expect(r.have, `seed ${live}, ${r.target}`).toBe(0);
      }
    }
    expect(feeds).toBeGreaterThan(10); // a run that drew no meal request would pass for nothing
  });

  function fieldSave(place: Place = "land"): Save {
    const save = adultSave("pebblin");
    if (place !== "home") expect(goTo(save, place, T0)).toBe("went");
    only(save, req({ id: 6, type: "field", target: "land" }));
    return save;
  }

  it("counts an awake minute at the named field and pays at the 20th (edge 8)", () => {
    const save = fieldSave();
    minutes(save, 19);
    expect(save.board.open[0]!.have).toBe(19);
    expect(save.coins).toBe(0);
    minutes(save, 1);
    expect(save.coins).toBe(3);
    expect(save.board.waits.at(-1)).toEqual({ doneAt: T0 + 20 * MINUTE, coins: 3, item: null });
    expect(save.board.done).toBe(1);
  });

  it("counts nothing at home, in another field, asleep or on a job (edge 8)", () => {
    const home = fieldSave("home");
    minutes(home, 30);
    expect(home.board.open.find((r) => r.id === 6)!.have).toBe(0);

    const elsewhere = fieldSave("water");
    minutes(elsewhere, 30);
    expect(elsewhere.board.open.find((r) => r.id === 6)!.have).toBe(0);

    const asleep = fieldSave();
    asleep.creature!.stats.energy = 10;
    asleep.creature!.sleep = "nap"; // low energy: it sleeps on
    minutes(asleep, 30);
    expect(asleep.creature!.sleep).toBe("nap");
    expect(asleep.board.open.find((r) => r.id === 6)!.have).toBe(0);

    const working = fieldSave();
    expect(startJob(working, "meadow", T0)).toBe("started"); // 3 minutes, and it is still at the Land field
    minutes(working, 2);
    expect(working.creature!.job).not.toBeNull();
    expect(working.creature!.place).toBe("land");
    expect(working.board.open.find((r) => r.id === 6)!.have).toBe(0);
  });

  it("25 minutes at a field give the same board in one catch-up as one minute at a time (edge 8)", () => {
    const whole = fieldSave();
    minutes(whole, 25);
    const stepped = fieldSave();
    for (let i = 0; i < 25; i++) minutes(stepped, 1);
    expect(whole.board.waits.at(-1)!.doneAt).toBe(T0 + 20 * MINUTE);
    expect(JSON.stringify(stepped)).toBe(JSON.stringify(whole));
  });

  function jobSave(): Save {
    const save = adultSave("pebblin");
    only(save, req({ id: 7, type: "job", target: "meadow" }));
    return save;
  }

  it("counts a finished job at the named spot, also one that finished while the app was closed (edge 9)", () => {
    const live = jobSave();
    expect(startJob(live, "meadow", T0)).toBe("started");
    minutes(live, 2);
    expect(live.board.open[0]!.have).toBe(0);
    minutes(live, 1);
    expect(live.board.done).toBe(1);
    expect(live.coins).toBe(live.hauls[0]!.coins + 3); // the haul and the request

    const closed = jobSave();
    startJob(closed, "meadow", T0);
    minutes(closed, 10); // one catch-up
    expect(closed.board.done).toBe(1);
    expect(closed.coins).toBe(closed.hauls[0]!.coins + 3);
  });

  it("counts nothing for a call back, or a job at another spot (edge 9)", () => {
    const early = jobSave();
    startJob(early, "meadow", T0);
    minutes(early, 1);
    expect(callBack(early, early.lastSimulatedAt)).toBe("called");
    minutes(early, 10);
    expect(early.board.open.find((r) => r.id === 7)!.have).toBe(0);
    expect(early.board.done).toBe(0);

    const other = jobSave();
    startJob(other, "herbs", T0);
    minutes(other, 10);
    expect(other.hauls).toHaveLength(1);
    expect(other.board.open.find((r) => r.id === 7)!.have).toBe(0);
    expect(other.board.done).toBe(0);
  });

  function fightSave(): Save {
    const save = adultSave("pebblin");
    only(save, req({ id: 8, type: "fight", target: null }));
    return save;
  }

  it("counts a won fight and pays; a lost one, or one that is not over, counts nothing (edge 10)", () => {
    const won = fightSave();
    const wonBattle = beginFight(won, won.creature!, T0);
    wonBattle.over = "won";
    const result = endFight(won, wonBattle, T0)!;
    expect(result.won).toBe(true);
    expect(won.coins).toBe(result.coins + 4);
    expect(won.board.done).toBe(1);

    const lost = fightSave();
    const lostBattle = beginFight(lost, lost.creature!, T0);
    lostBattle.over = "lost";
    endFight(lost, lostBattle, T0);
    expect(lost.board.open[0]!.have).toBe(0);
    expect(lost.coins).toBe(0);

    const running = fightSave();
    const runningBattle = beginFight(running, running.creature!, T0);
    expect(endFight(running, runningBattle, T0)).toBeNull();
    expect(running.board.open[0]!.have).toBe(0);
  });

  function buySave(): Save {
    const save = adultSave("pebblin");
    save.coins = 100;
    save.inventory = { fiber: 10, herb: 10 };
    only(save, req({ id: 9, type: "buy", target: "feeding-mat" })); // 25 coins, 3 Fiber, 2 Herbs
    return save;
  }
  const wanted = (save: Save): Request | undefined => save.board.open.find((r) => r.id === 9);

  it("a purchase counts at the first minute after the 10 second undo window, and pays then (edge 11)", () => {
    const save = buySave();
    expect(buy(save, "feeding-mat", T0 + 55_000)).toBe("bought");
    simulateTo(save, T0 + MINUTE); // 5 seconds after the purchase: still undoable
    expect(wanted(save)).toBeDefined();
    expect(save.coins).toBe(75);
    minutes(save, 1); // 65 seconds after
    expect(wanted(save)).toBeUndefined();
    expect(save.coins).toBe(80); // 100 - 25 + 5
    expect(save.board.done).toBe(1);
  });

  it("buy, undo, repeated, pays nothing and never counts (edge 11)", () => {
    const save = buySave();
    for (let round = 0; round < 3; round++) {
      const base = save.lastSimulatedAt;
      expect(buy(save, "feeding-mat", base + 55_000)).toBe("bought");
      expect(undoBuy(save, base + 58_000)).toBe("undone");
      simulateTo(save, base + MINUTE);
    }
    minutes(save, 5);
    expect(save.coins).toBe(100);
    expect(save.inventory).toEqual({ fiber: 10, herb: 10 });
    expect(wanted(save)).toBeDefined();
    expect(save.board.done).toBe(0);
  });

  it("a later purchase makes the earlier one permanent, so the earlier one counts (edge 11)", () => {
    const save = buySave();
    expect(buy(save, "feeding-mat", T0 + 55_000)).toBe("bought");
    expect(buy(save, "green-bowl", T0 + 56_000)).toBe("bought"); // the undo is now for the bowl
    simulateTo(save, T0 + MINUTE);
    expect(wanted(save)).toBeUndefined();
    expect(save.board.done).toBe(1);
  });

  it("a purchase from the future does not count, and the undo after the clock comes back is not paid twice (edge 11)", () => {
    const save = buySave();
    const X = T0 + 55_000;
    expect(buy(save, "feeding-mat", X)).toBe("bought");
    simulateTo(save, X - 61 * MINUTE); // the clock is set back more than an hour: the game carries on from there
    minutes(save, 1);
    expect(save.owned).toContain("feeding-mat");
    expect(wanted(save)).toBeDefined(); // the purchase is dated after now: it does not count
    simulateTo(save, X + 5000); // the clock is back, 5 seconds after the purchase
    expect(wanted(save)).toBeDefined();
    expect(undoBuy(save, X + 5000)).toBe("undone");
    expect(save.coins).toBe(100);
    minutes(save, 5);
    expect(save.coins).toBe(100);
    expect(wanted(save)).toBeDefined();
    expect(save.board.done).toBe(0);
  });

  it("purchaseCounted: the window is 10 seconds, and an item that is not owned never counts (edge 11)", () => {
    const save = buySave();
    save.owned = ["feeding-mat"];
    save.lastBuy = { item: "feeding-mat", at: T0, wall: null };
    expect(purchaseCounted(save, "feeding-mat", T0 + 10_000)).toBe(false);
    expect(purchaseCounted(save, "feeding-mat", T0 + 10_001)).toBe(true);
    expect(purchaseCounted(save, "feeding-mat", T0 - 1000)).toBe(false);
    expect(purchaseCounted(save, "green-bowl", T0 + 99_000)).toBe(false);
    save.lastBuy = null;
    expect(purchaseCounted(save, "feeding-mat", T0)).toBe(true);
  });

  it("with Adult Mode off nothing counts or is drawn, and what was counted is kept (edge 12)", () => {
    const save = meatSave(10);
    expect(feed(save, "meat", T0)).toBe("ate");
    expect(save.board.open[0]!.have).toBe(1);
    save.settings.adultMode = false;
    save.creature!.stats.hunger = 10;
    expect(feed(save, "meat", T0)).toBe("ate");
    goTo(save, "land", T0);
    minutes(save, 30);
    expect(save.board.open).toHaveLength(1);
    expect(save.board.open[0]!.have).toBe(1);
    expect(save.board.waits).toHaveLength(2);
    expect(save.coins).toBe(0);
    save.settings.adultMode = true;
    save.creature!.stats.hunger = 10;
    expect(feed(save, "meat", save.lastSimulatedAt)).toBe("ate");
    expect(save.coins).toBe(2);
  });

  it("a board that Adult Mode never dealt is dealt when it is turned on (edge 12)", () => {
    const save = aliveSave("pebblin", T0);
    minutes(save, 60);
    expect(save.board).toEqual(freshBoard());
    save.settings.adultMode = true;
    minutes(save, 1);
    expect(save.board.open).toHaveLength(3);
  });
});

describe("paying (edges 13 to 15)", () => {
  function twoMeals(item: string | null, drewAt = T0): Save {
    const save = adultSave("pebblin");
    save.creature!.stats.hunger = 10;
    only(save, req({ id: 11, type: "feed", target: "meat", item, drewAt }));
    return save;
  }
  const eatTwice = (save: Save): void => {
    feed(save, "meat", T0);
    save.creature!.stats.hunger = 10;
    feed(save, "meat", T0);
  };

  it("pays its coins and its item, leaves a wait that says what was paid, and writes the log (edge 13)", () => {
    const save = twoMeals("stew");
    eatTwice(save);
    expect(save.coins).toBe(2);
    expect(save.owned).toEqual(["stew"]);
    expect(save.board.waits.at(-1)).toEqual({ doneAt: T0, coins: 2, item: "stew" });
    expect(save.board.done).toBe(1);
    expect(save.log.at(-1)!.text).toBe("Request done: Feed Meat ×2, 2 coins and Stew");
  });

  it("a hat paid as the item arrives owned and not worn; it can be worn, and undoing a later purchase leaves it on (hats plan, edge 25)", () => {
    const save = twoMeals("hat-fisher");
    eatTwice(save);
    expect(save.owned).toEqual(["hat-fisher"]);
    expect(save.hat).toBeNull();
    expect(useHat(save, "hat-fisher")).toBe(true);
    expect(save.hat).toBe("hat-fisher");
    save.coins = 100;
    save.inventory = { herb: 5 };
    expect(buy(save, "wall-meadow", T0)).toBe("bought");
    expect(undoBuy(save, T0)).toBe("undone");
    expect(save.owned).toEqual(["hat-fisher"]);
    expect(save.hat).toBe("hat-fisher");
  });

  it("pays only the coins for an item that is owned by then, and never lists an item twice (edge 13)", () => {
    const save = twoMeals("stew");
    save.owned = ["stew"];
    eatTwice(save);
    expect(save.coins).toBe(2);
    expect(save.owned).toEqual(["stew"]);
    expect(save.board.waits.at(-1)).toEqual({ doneAt: T0, coins: 2, item: null });
    expect(save.log.at(-1)!.text).toBe("Request done: Feed Meat ×2, 2 coins");
  });

  it("a paid wallpaper is owned and not hung, cannot be undone, and cannot be bought again (edge 15)", () => {
    const save = twoMeals("wall-dusk");
    save.coins = 50;
    save.inventory = { stone: 5 };
    eatTwice(save);
    expect(save.owned).toEqual(["wall-dusk"]);
    expect(save.wall).toBeNull();
    expect(save.lastBuy).toBeNull();
    expect(undoBuy(save, T0)).toBe("none");
    expect(buy(save, "wall-dusk", T0)).toBe("owned");
    expect(save.coins).toBe(52);
  });

  it("the oldest open request pays a quarter more after exactly 3 days, rounded up, and not a minute before (edge 13)", () => {
    const paid = { feed: [2, 3], field: [3, 4], job: [3, 4], fight: [4, 5], buy: [5, 7] } as const;
    const target = { feed: "meat", field: "land", job: "meadow", fight: null, buy: "comfy-bed" } as const;
    const save = adultSave("gravelhorn");
    for (const type of ["feed", "field", "job", "fight", "buy"] as const) {
      const board = { ...freshBoard(), open: [req({ id: 1, type, target: target[type], drewAt: T0 - 3 * DAY })] };
      expect(coinsFor(board, board.open[0]!, T0), type).toBe(paid[type][1]);
      board.open[0]!.drewAt = T0 - 3 * DAY + MINUTE; // 2 days 23 hours 59 minutes
      expect(coinsFor(board, board.open[0]!, T0), type).toBe(paid[type][0]);
    }
    expect(save.coins).toBe(0);
  });

  it("only the oldest gets the bonus, the lower id wins a tie, and a request pays it when it is done (edge 13)", () => {
    const old = (id: number, days: number): Request => req({ id, type: "feed", target: "meat", drewAt: T0 - days * DAY });
    const board = { ...freshBoard(), open: [old(1, 4), old(2, 5), old(3, 1)] };
    expect(staleRequest(board, T0)!.id).toBe(2);
    expect(coinsFor(board, board.open[1]!, T0)).toBe(3);
    expect(coinsFor(board, board.open[0]!, T0)).toBe(2);
    expect(coinsFor(board, board.open[2]!, T0)).toBe(2);
    const tied = { ...freshBoard(), open: [old(4, 4), old(3, 4)] };
    expect(staleRequest(tied, T0)!.id).toBe(3);
    expect(staleRequest({ ...freshBoard(), open: [old(1, 2)] }, T0)).toBeNull();
    expect(staleRequest(freshBoard(), T0)).toBeNull();

    const save = twoMeals(null, T0 - 3 * DAY);
    eatTwice(save);
    expect(save.coins).toBe(3);
    expect(save.board.waits.at(-1)!.coins).toBe(3);
  });

  it("pays every request that finishes in one minute, and an event finishes only its own type and target (edge 14)", () => {
    const save = adultSave("pebblin");
    save.owned = ["feeding-mat", "green-bowl"];
    save.lastBuy = null;
    only(save, req({ id: 1, type: "buy", target: "feeding-mat" }), req({ id: 2, type: "buy", target: "green-bowl" }));
    save.board.waits = [{ doneAt: T0, coins: 0, item: null }];
    minutes(save, 1);
    expect(save.board.done).toBe(2);
    expect(save.coins).toBe(10);

    const other = adultSave("pebblin");
    only(other, req({ id: 1, type: "feed", target: "carrot" }), req({ id: 2, type: "job", target: "meadow" }), req({ id: 3, type: "fight", target: null }));
    noteRequest(other, { kind: "feed", food: "meat" }, T0);
    noteRequest(other, { kind: "field", field: "land" }, T0);
    noteRequest(other, { kind: "job", spot: "herbs" }, T0);
    expect(other.board.open.map((r) => r.have)).toEqual([0, 0, 0]);
    expect(other.coins).toBe(0);
  });
});

describe("time (edges 16 and 17)", () => {
  it("brings a time after now back to now, so a refill is never more than 15 minutes away (edge 16)", () => {
    const save = adultSave("pebblin");
    save.board.open = [req({ id: 0, type: "feed", target: "pellet", drewAt: T0 + DAY })];
    save.board.drawn = 1;
    save.board.waits = [
      { doneAt: T0 + DAY, coins: 2, item: null },
      { doneAt: T0 + DAY, coins: 2, item: null },
    ];
    minutes(save, 1);
    expect(save.board.open[0]!.drewAt).toBe(T0 + MINUTE);
    expect(save.board.waits.map((w) => w.doneAt)).toEqual([T0 + MINUTE, T0 + MINUTE]);
    minutes(save, 14);
    expect(save.board.open).toHaveLength(1);
    minutes(save, 1);
    expect(save.board.open).toHaveLength(3);
  });

  it("a clock set a year forward draws what is due, once for each slot (edge 16)", () => {
    const save = adultSave("pebblin");
    save.board.open = [req({ id: 0, type: "feed", target: "pellet" })];
    save.board.drawn = 1;
    save.board.waits = [
      { doneAt: T0, coins: 2, item: null },
      { doneAt: T0, coins: 2, item: null },
    ];
    stepRequests(save, readOnlyRng(5), T0 + 365 * DAY);
    expect(save.board.open).toHaveLength(3);
    expect(save.board.waits).toEqual([]);
    expect(save.board.drawn).toBe(3);
  });

  it("seven days of a creature that is looked after but never uses the board lose nothing, and the oldest pays more (edge 17)", () => {
    const save = adultSave("blip");
    minutes(save, 1);
    const before = clone(save.board.open);
    expect(before).toHaveLength(3);
    for (let hour = 0; hour < 7 * 24; hour++) {
      minutes(save, 60);
      const c = save.creature!;
      Object.assign(c.stats, { hunger: 100, happiness: 100, energy: 100, hygiene: 100, wellness: 100 });
      c.poop = 0;
      c.sick = false;
      touch(save, "pet", save.lastSimulatedAt); // care that is not a meal (a meal would count)
    }
    expect(save.phase).toBe("alive");
    expect(getForm(save.creature!.formId).stage).toBe("adult"); // 7 days is longer than the three stages
    expect(save.board.open.map((r) => [r.id, r.type, r.target, r.have])).toEqual(before.map((r) => [r.id, r.type, r.target, r.have]));
    expect(save.board.waits).toEqual([]);
    expect(save.board.done).toBe(0);
    expect(save.coins).toBe(0);
    expect(save.log.some((l) => /request/i.test(l.text))).toBe(false);
    const oldest = staleRequest(save.board, save.lastSimulatedAt)!;
    expect(oldest.id).toBe(0);
    expect(coinsFor(save.board, oldest, save.lastSimulatedAt)).toBeGreaterThan(coinsFor({ ...save.board, open: [{ ...oldest, drewAt: save.lastSimulatedAt }] }, oldest, save.lastSimulatedAt));
  });

  it("a creature left alone for 7 days dies with the board as it was (edge 17)", () => {
    const save = adultSave("blip");
    minutes(save, 1);
    const before = clone(save.board);
    minutes(save, 7 * 24 * 60);
    expect(save.phase).toBe("dead");
    expect(save.board).toEqual(before);
  });
});

describe("the fit check (edge 18)", () => {
  const rocks = req({ id: 1, type: "job", target: "rocks" });
  const meat = req({ id: 2, type: "feed", target: "meat" });

  it("after a retire the board waits for the next creature; at its first minute what it cannot do is dropped and drawn again, the rest kept", () => {
    const save = adultSave("gravelhorn");
    save.board.open = [meat, rocks, req({ id: 3, type: "field", target: "water", have: 7 })];
    save.board.drawn = 4;
    expect(retireCreature(save, T0)).toBe("retired");
    const waiting = clone(save.board);
    minutes(save, 10); // an egg: the board does nothing
    expect(save.phase).toBe("egg");
    expect(save.board).toEqual(waiting);

    forceHatch(save, "blip", save.lastSimulatedAt);
    minutes(save, 1);
    const ids = save.board.open.map((r) => r.id);
    expect(ids).toContain(3); // the field request keeps its progress
    expect(save.board.open.find((r) => r.id === 3)!.have).toBe(7);
    expect(ids).not.toContain(1);
    expect(ids).not.toContain(2);
    expect(save.board.open).toHaveLength(3); // the two that went were drawn again in the same minute
    expect(save.board.drawn).toBe(6);
    for (const r of save.board.open) expect(fits(save, save.creature!, r)).toBe(true);
  });

  it("a request is dropped for a field food the creature has not got, a spot or fight its stage does not open, or a purchase it cannot pay for", () => {
    const baby = adultSave("blip");
    const c = baby.creature!;
    expect(fits(baby, c, meat)).toBe(false);
    expect(fits(baby, c, req({ type: "feed", target: "pellet" }))).toBe(true);
    expect(fits(baby, c, rocks)).toBe(false);
    expect(fits(baby, c, req({ type: "job", target: "meadow" }))).toBe(true);
    expect(fits(baby, c, req({ type: "fight", target: null }))).toBe(false);
    expect(fits(baby, c, req({ type: "buy", target: "comfy-bed" }))).toBe(false);
    baby.inventory.wood = 2;
    expect(fits(baby, c, req({ type: "buy", target: "comfy-bed" }))).toBe(true);
    baby.inventory.wood = 0;
    baby.owned = ["comfy-bed"]; // owned (its undo window may still be open): it stays
    expect(fits(baby, c, req({ type: "buy", target: "comfy-bed" }))).toBe(true);
    expect(fits(baby, c, req({ type: "field", target: "sky" }))).toBe(true);
  });

  it("an ordinary evolution drops nothing, and the special drops the field food it has lost (edge 18)", () => {
    const save = adultSave("pebblin");
    const board = [meat, req({ id: 2, type: "job", target: "meadow" }), req({ id: 3, type: "fight", target: null })];
    only(save, ...board.map((r, i) => ({ ...r, id: i + 1 })));
    save.board.drawn = 4;
    forceEvolve(save, "cragpup", T0); // a kid grows into a young of its own field
    minutes(save, 1);
    expect(save.board.open.map((r) => r.id)).toEqual([1, 2, 3]);

    const special = adultSave("pebblin");
    only(special, ...board.map((r, i) => ({ ...r, id: i + 1 })));
    special.board.drawn = 4;
    forceEvolve(special, specialId, T0);
    minutes(special, 1);
    const ids = special.board.open.map((r) => r.id);
    expect(ids).not.toContain(1);
    expect(ids).toContain(2);
    expect(ids).toContain(3);
    expect(special.board.open).toHaveLength(3);
  });

  it("with Adult Mode off nothing is dropped until it is turned on (edge 18)", () => {
    const save = adultSave("pebblin");
    only(save, { ...meat, id: 1 });
    save.board.drawn = 2;
    forceEvolve(save, specialId, T0);
    save.settings.adultMode = false;
    minutes(save, 5);
    expect(save.board.open.map((r) => r.id)).toEqual([1]);
    save.settings.adultMode = true;
    minutes(save, 1);
    expect(save.board.open.map((r) => r.id)).not.toContain(1);
  });
});

describe("a saved board (edge 19)", () => {
  const good = (): Request => req({ id: 4, type: "feed", target: "meat", have: 1, item: "stew", drewAt: 1000 });

  it("a save from before the board, or with nothing in its place, gets an empty one without throwing", () => {
    for (const value of [undefined, null, 7, "board", [], {}]) {
      const save = clone(newSave(T0, 1)) as unknown as Record<string, unknown>;
      save.board = value;
      expect(migrateSave(save)!.board, String(value)).toEqual(freshBoard());
    }
    const none = clone(newSave(T0, 1)) as unknown as Record<string, unknown>;
    delete none.board;
    expect(migrateSave(none)!.board).toEqual(freshBoard());
  });

  it("keeps a good board exactly as it was", () => {
    const board = {
      open: [good(), req({ id: 5, type: "fight", target: null, drewAt: 2000 })],
      waits: [{ doneAt: 3000, coins: 4, item: null }],
      drawn: 9,
      done: 4,
    };
    expect(migrateBoard(clone(board))).toEqual(board);
  });

  it("drops a request with an unknown type, or a target that is not of its type's kind, including the treat and object keys", () => {
    const bad = [
      { ...good(), type: "dance" },
      { ...good(), type: "constructor" },
      { ...good(), target: "treat" },
      { ...good(), target: "constructor" },
      { ...good(), target: "__proto__" },
      { ...good(), target: null },
      { ...good(), target: 7 },
      { ...req({ id: 1, type: "field", target: "moon" }) },
      { ...req({ id: 1, type: "field", target: "toString" }) },
      { ...req({ id: 1, type: "job", target: "meat" }) },
      { ...req({ id: 1, type: "buy", target: "constructor" }) },
      { ...req({ id: 1, type: "buy", target: "meat" }) },
      { ...req({ id: 1, type: "fight", target: "meadow" }) },
      { ...good(), item: "constructor" },
      { ...good(), item: 5 },
      { ...good(), item: undefined },
      { ...good(), id: -1 },
      { ...good(), id: 1.5 },
      { ...good(), id: "1" },
      { ...good(), have: "1" },
      { ...good(), have: NaN },
      { ...good(), have: Infinity },
      { ...good(), drewAt: NaN },
      { ...good(), drewAt: Infinity },
      { ...good(), drewAt: "now" },
      null,
      "request",
      7,
    ];
    for (const entry of bad) expect(migrateBoard({ open: [entry], waits: [], drawn: 0, done: 0 }).open, JSON.stringify(entry)).toEqual([]);
  });

  it("clamps progress to what the type needs, and a saved number cannot change a payment", () => {
    expect(migrateBoard({ open: [{ ...good(), have: 99 }], waits: [] }).open[0]!.have).toBe(2);
    expect(migrateBoard({ open: [{ ...good(), have: -5 }], waits: [] }).open[0]!.have).toBe(0);
    const stored = { ...good(), coins: 1e308, need: 1 } as unknown;
    const read = migrateBoard({ open: [stored], waits: [] }).open[0]!;
    expect("coins" in read).toBe(false);
    expect("need" in read).toBe(false);
  });

  it("drops a wait with a bad time, amount or item, and clamps what was paid", () => {
    const wait = { doneAt: 5, coins: 3, item: null };
    for (const entry of [{ ...wait, doneAt: NaN }, { ...wait, doneAt: Infinity }, { ...wait, doneAt: "5" }, { ...wait, coins: NaN }, { ...wait, coins: "3" }, { ...wait, item: "constructor" }, { ...wait, item: 3 }, null, 5]) {
      expect(migrateBoard({ open: [], waits: [entry] }).waits, JSON.stringify(entry)).toEqual([]);
    }
    expect(migrateBoard({ open: [], waits: [{ ...wait, coins: 1e308 }] }).waits[0]!.coins).toBe(1000);
    expect(migrateBoard({ open: [], waits: [{ ...wait, coins: -4 }] }).waits[0]!.coins).toBe(0);
    expect(migrateBoard({ open: [], waits: [{ ...wait, coins: 2.6 }] }).waits[0]!.coins).toBe(3);
  });

  it("keeps at most 3 slots together, open requests first, and a bad count becomes 0", () => {
    const targets = ["pellet", "meat", "carrot", "worm", "seafood"];
    const five = targets.map((target, i) => req({ id: i, type: "feed", target }));
    expect(migrateBoard({ open: five, waits: [] }).open.map((r) => r.id)).toEqual([0, 1, 2]);
    const wait = { doneAt: 5, coins: 3, item: null };
    const mixed = migrateBoard({ open: five.slice(0, 2), waits: [wait, wait, wait] });
    expect(mixed.open).toHaveLength(2);
    expect(mixed.waits).toHaveLength(1);
    expect(migrateBoard({ open: [], waits: [wait, wait, wait, wait] }).waits).toHaveLength(3);
    for (const count of [-1, 1.5, NaN, Infinity, "3", null, 2 ** 60]) {
      const board = migrateBoard({ open: [], waits: [], drawn: count, done: count });
      expect(board.drawn, String(count)).toBe(0);
      expect(board.done, String(count)).toBe(0);
    }
    expect(migrateBoard({ open: [], waits: [], drawn: 12, done: 7 })).toEqual({ open: [], waits: [], drawn: 12, done: 7 });
  });

  it("drops a second open request for the same type and target, and a second one with the same id, so one meal never pays two slots", () => {
    const meat = req({ id: 1, type: "feed", target: "meat" });
    const read = (...open: Request[]) => migrateBoard({ open, waits: [], drawn: 9, done: 0 }).open.map((r) => [r.id, r.target]);
    expect(read(meat, { ...meat, id: 2 })).toEqual([[1, "meat"]]);
    expect(read(meat, req({ id: 1, type: "feed", target: "carrot" }))).toEqual([[1, "meat"]]);
    expect(read(meat, req({ id: 2, type: "field", target: "meat" as never }))).toEqual([[1, "meat"]]); // (a bad field target goes too)
    expect(read(meat, req({ id: 2, type: "feed", target: "carrot" }), req({ id: 3, type: "fight", target: null }), req({ id: 4, type: "fight", target: null }))).toEqual([[1, "meat"], [2, "carrot"], [3, null]]);
    const mats = [req({ id: 1, type: "buy", target: "stew" }), req({ id: 2, type: "buy", target: "stew" })];
    expect(read(...mats)).toEqual([[1, "stew"]]);
    expect(read(req({ id: 1, type: "buy", target: "stew" }), req({ id: 2, type: "buy", target: "comfy-bed" }))).toEqual([[1, "stew"], [2, "comfy-bed"]]); // two different purchases both stay
    // a duplicate does not use up a slot
    expect(read(meat, { ...meat, id: 2 }, req({ id: 3, type: "feed", target: "carrot" }), req({ id: 4, type: "feed", target: "worm" }))).toEqual([[1, "meat"], [3, "carrot"], [4, "worm"]]);
  });

  it("raises a bad or low draw count above the highest id on the board, so a new request never takes the id of an open one", () => {
    const open = [req({ id: 0, type: "feed", target: "meat" }), req({ id: 1, type: "fight", target: null }), req({ id: 5, type: "field", target: "land" })];
    for (const drawn of ["x", NaN, -1, 0, 3, 5]) expect(migrateBoard({ open, waits: [], drawn, done: 0 }).drawn, String(drawn)).toBe(6);
    expect(migrateBoard({ open, waits: [], drawn: 40, done: 0 }).drawn).toBe(40);
  });

  it("reads a save as it was written, the board and the coins it paid together, and a game with no board as an empty one (edge 20: the newest save wins whole, which is cloud-sync.test.ts; no sync code runs here)", () => {
    const account = adultSave("pebblin");
    account.coins = 40;
    account.board = { open: [req({ id: 3, type: "fight", target: null })], waits: [{ doneAt: T0, coins: 4, item: null }], drawn: 5, done: 2 };
    const adopted = migrateSave(clone(account))!;
    expect(adopted.coins).toBe(40);
    expect(adopted.board).toEqual(account.board);
    const local = clone(adultSave("pebblin")) as unknown as Record<string, unknown>;
    delete local.board;
    local.coins = 7;
    const older = migrateSave(local)!;
    expect(older.coins).toBe(7);
    expect(older.board).toEqual(freshBoard());
  });

  it("a save that has had a request drawn is not untouched (the sign-in rule needs no new field)", () => {
    const save = adultSave("pebblin");
    minutes(save, 1);
    expect(save.board.drawn).toBe(3);
    expect(isUntouched(save)).toBe(false);
  });
});

describe("the words of a card", () => {
  it("names each request type in plain words, with the exact numbers", () => {
    expect(requestWords(req({ type: "feed", target: "meat" }))).toBe("Feed Meat ×2");
    expect(requestWords(req({ type: "feed", target: "pellet" }))).toBe("Feed Pellets ×2");
    expect(requestWords(req({ type: "field", target: "water" }))).toBe("20 minutes in the Water field");
    expect(requestWords(req({ type: "job", target: "rocks" }))).toBe("Finish a job at Rock pile");
    expect(requestWords(req({ type: "fight", target: null }))).toBe("Win a fight");
    expect(requestWords(req({ type: "buy", target: "comfy-bed" }))).toBe("Buy Comfy Bed");
    expect(requestProgress(req({ type: "feed", target: "meat", have: 1 }))).toBe("1 of 2 meals");
    expect(requestProgress(req({ type: "field", target: "land", have: 7 }))).toBe("7 of 20 minutes");
    expect(requestProgress(req({ type: "job", target: "meadow" }))).toBe("0 of 1 job");
    expect(requestProgress(req({ type: "fight", target: null }))).toBe("0 of 1 win");
    expect(requestProgress(req({ type: "buy", target: "stew" }))).toBe("0 of 1 purchase");
  });

  it("says what was paid in one line for the note over the room (the newest waits are the ones just paid)", () => {
    const waits = [
      { doneAt: 1, coins: 9, item: "stew" },
      { doneAt: 2, coins: 2, item: null },
      { doneAt: 3, coins: 5, item: "wall-dusk" },
    ];
    expect(paidNote(waits, 1)).toBe("Request done: +5 coins and Wallpaper: Dusk");
    expect(paidNote(waits, 2)).toBe("2 requests done: +7 coins and Wallpaper: Dusk");
    expect(paidNote(waits.slice(1, 2), 1)).toBe("Request done: +2 coins");
    expect(paidNote([{ doneAt: 1, coins: 1, item: null }], 1)).toBe("Request done: +1 coin");
  });

  it("states no amount for a payment whose wait is already gone (a wait is dropped 15 minutes after it was paid, so a long catch-up outlives it)", () => {
    expect(paidNote([], 1)).toBe("Request done");
    expect(paidNote([{ doneAt: 1, coins: 4, item: null }], 2)).toBe("2 requests done");
    expect(paidNote([], 3)).toBe("3 requests done");
  });

  it("counts the minutes to the next request up, at least 1 (and never more than 15 when the clock was set back)", () => {
    expect(minutesToNext(T0, T0)).toBe(15);
    expect(minutesToNext(T0, T0 + 1000)).toBe(15);
    expect(minutesToNext(T0, T0 + 14 * MINUTE)).toBe(1);
    expect(minutesToNext(T0, T0 + 15 * MINUTE)).toBe(1);
    expect(minutesToNext(T0 + DAY, T0)).toBe(15);
  });
});

describe("what the other modules do with the board", () => {
  it("clean and other care never count as a request (only the four events do)", () => {
    const save = adultSave("pebblin");
    save.creature!.poop = 2;
    only(save, req({ id: 1, type: "feed", target: "meat" }), req({ id: 2, type: "job", target: "meadow" }), req({ id: 3, type: "fight", target: null }));
    expect(clean(save, T0)).toBe("cleaned");
    expect(save.board.open.map((r) => r.have)).toEqual([0, 0, 0]);
  });
});
