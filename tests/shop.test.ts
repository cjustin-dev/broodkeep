// The shop (adult track A2.2a): buying, the 10 second undo, the wall, what a save from storage may hold, and what the Comfy Bed and the Feeding
// Mat do to the care rules. The edge cases are numbered as in docs/adult-a2-plan.md section 9; "edge N" below is that list. Expected values are
// written out by hand (prices from data/shop.ts, rates from data/tuning.ts worked out on paper), never made by the code under test.
import { describe, expect, it } from "vitest";
import { itemIds, items } from "../src/data/shop";
import { feed, startJob, touch } from "../src/game/actions";
import { stepCare } from "../src/game/care";
import { forecast } from "../src/game/forecast";
import { countCareCells } from "../src/game/growth";
import { detailLines, timeToEmpty } from "../src/game/hud";
import { makeRng } from "../src/game/rng";
import { simulateTo } from "../src/game/sim";
import { buy, buyRefusal, missingFor, poorText, undoBuy, undoLeftMs, useWall } from "../src/game/shop";
import { migrateSave, newSave } from "../src/game/state";
import type { Save } from "../src/game/state";
import { HOUR, MINUTE } from "../src/game/time";
import { isUntouched } from "../src/sync/sync";
import { aliveSave, at } from "./helpers";

const DAY = at(10);
const clone = (save: Save): Save => JSON.parse(JSON.stringify(save)) as Save;

// A living creature with the given wallet, at DAY (nothing to catch up on at DAY, so a refusal can be compared with the save as it was).
function wallet(coins: number, bag: Save["inventory"], formId = "cindermane"): Save {
  const save = aliveSave(formId, DAY);
  save.coins = coins;
  save.inventory = { ...bag };
  return save;
}

// Exactly what each item costs: coins, then materials (written by hand from data/shop.ts).
const PRICES = {
  "comfy-bed": { coins: 35, bag: { fiber: 3, wood: 2 } },
  "feeding-mat": { coins: 25, bag: { fiber: 3, herb: 2 } },
  "wall-meadow": { coins: 12, bag: { herb: 2 } },
  "wall-dusk": { coins: 12, bag: { stone: 2 } },
  "hearty-bowl": { coins: 25, bag: { fish: 3 } },
  "green-bowl": { coins: 25, bag: { herb: 3 } },
  "sweet-bowl": { coins: 25, bag: { fiber: 3 } },
  stew: { coins: 35, bag: { wood: 2, stone: 2 } },
  "garden-mix": { coins: 35, bag: { fish: 2, stone: 2 } },
  "hat-knit": { coins: 12, bag: { fiber: 2 } },
  "hat-acorn": { coins: 12, bag: { wood: 2 } },
  "hat-fisher": { coins: 12, bag: { fish: 2 } },
  "hat-crown": { coins: 12, bag: { stone: 2 } },
  "room-play": { coins: 36, bag: { wood: 4, stone: 4 } },
} as const;

describe("the catalogue", () => {
  it("has fourteen items at these prices, in this order, with the care items' words (the four of A2.2a, the five foods of A2.2b, the four hats of A2.4, then the Playroom of H3; the hats' words are tests/hats.test.ts edge 30)", () => {
    expect(itemIds).toEqual([
      "comfy-bed",
      "feeding-mat",
      "wall-meadow",
      "wall-dusk",
      "hearty-bowl",
      "green-bowl",
      "sweet-bowl",
      "stew",
      "garden-mix",
      "hat-knit",
      "hat-acorn",
      "hat-fisher",
      "hat-crown",
      "room-play",
    ]);
    for (const id of itemIds) expect(items[id].price, id).toEqual({ coins: PRICES[id].coins, materials: PRICES[id].bag });
    expect(items["comfy-bed"].effect).toBe("While it sleeps at home, happiness falls 50% as fast.");
    expect(items["feeding-mat"].effect).toBe("A meal that ends at 90 or more counts as a hunger cell (young stage).");
  });

  it("every price in coins is at most three times the measured day's 12.2 coins (the income figure of tools/verify/run-income.sh)", () => {
    for (const id of itemIds) expect(items[id].price.coins, id).toBeLessThanOrEqual(3 * 12.2);
  });

  it("every material has at least two uses: Fiber 4, Herbs 3, Wood 4, Fish 3, Stone 5", () => {
    const uses = (material: string): number => itemIds.filter((id) => material in items[id].price.materials).length;
    expect(["fiber", "herb", "wood", "fish", "stone"].map(uses)).toEqual([4, 3, 4, 3, 5]);
  });
});

describe("buying (edges 1 to 4, 12)", () => {
  it("edge 1: exactly the price buys and leaves 0 of everything", () => {
    for (const id of itemIds) {
      const save = wallet(PRICES[id].coins, PRICES[id].bag);
      expect(buy(save, id, DAY), id).toBe("bought");
      expect(save.coins).toBe(0);
      expect(Object.values(save.inventory).every((n) => n === 0)).toBe(true);
      expect(save.owned).toEqual([id]);
      expect(save.log[save.log.length - 1]!.text).toBe(`Bought ${items[id].name}`);
    }
  });

  it("edge 1: one coin short, or one short in any one material, is poor and changes nothing", () => {
    for (const id of itemIds) {
      const tries: Array<[number, Save["inventory"]]> = [[PRICES[id].coins - 1, PRICES[id].bag]];
      for (const [material, need] of Object.entries(PRICES[id].bag)) tries.push([PRICES[id].coins, { ...PRICES[id].bag, [material]: need - 1 }]);
      for (const [coins, bag] of tries) {
        const save = wallet(coins, bag);
        const before = clone(save);
        expect(buyRefusal(save, id), id).toBe("poor");
        expect(buy(save, id, DAY), id).toBe("poor");
        expect(save, `${id} with ${coins} coins and ${JSON.stringify(bag)}`).toEqual(before);
      }
    }
  });

  it("edge 1: a bag with a missing material key reads as 0, and a refund puts the key back", () => {
    const save = wallet(12, {}); // no `herb` key at all
    expect(buy(save, "wall-meadow", DAY)).toBe("poor");
    expect(missingFor(save, "wall-meadow")).toEqual({ coins: 0, materials: { herb: 2 } });
    save.inventory = { herb: 2, fiber: 0 }; // the other four keys missing
    expect(buy(save, "wall-meadow", DAY)).toBe("bought");
    delete save.inventory.herb; // a save that dropped the key
    expect(undoBuy(save, DAY)).toBe("undone");
    expect(save.inventory.herb).toBe(2);
    expect(save.coins).toBe(12);
  });

  it("edge 2: an unknown id, and ids that exist on every object, are refused; an owned item is refused without a charge", () => {
    const save = wallet(100, { fiber: 9, herb: 9, wood: 9, fish: 9, stone: 9 });
    for (const id of ["nope", "", "constructor", "__proto__", "toString", "wall-meadow "]) {
      const before = clone(save);
      expect(buy(save, id, DAY), id).toBe("unknown");
      expect(save).toEqual(before);
    }
    expect(buy(save, "wall-meadow", DAY)).toBe("bought");
    const owned = clone(save);
    expect(buy(save, "wall-meadow", DAY)).toBe("owned");
    expect(save).toEqual(owned);
  });

  it("edge 3: two quick buys of one item charge once; two different items both go through and the undo is only for the second", () => {
    const save = wallet(50, { herb: 4, stone: 2 });
    expect([buy(save, "wall-meadow", DAY), buy(save, "wall-meadow", DAY)]).toEqual(["bought", "owned"]);
    expect([save.coins, save.inventory.herb]).toEqual([38, 2]);
    expect(buy(save, "wall-dusk", DAY + 1000)).toBe("bought");
    expect(save.lastBuy).toEqual({ item: "wall-dusk", at: DAY + 1000, wall: "wall-meadow" });
    expect(undoBuy(save, DAY + 2000)).toBe("undone");
    expect(save.owned).toEqual(["wall-meadow"]);
    expect(undoBuy(save, DAY + 2000)).toBe("none"); // the first purchase can no longer be undone
  });

  it("edge 4: a job that ends before now has paid by the time the price is checked", () => {
    const save = wallet(10, { herb: 2 }, "gravelhorn"); // an adult: the Rock pile pays 3 to 5 coins, 8 minutes
    expect(startJob(save, "rocks", DAY)).toBe("started");
    expect(buyRefusal(save, "wall-meadow")).toBe("poor"); // 10 coins, before the job has paid
    expect(buy(save, "wall-meadow", DAY + 9 * MINUTE)).toBe("bought");
    expect(save.coins).toBeGreaterThanOrEqual(1); // 10 + 3 to 5, less 12
    expect(save.coins).toBeLessThanOrEqual(3);
  });

  it("edge 12: works with no creature (an egg), and the words for what is missing read as a list", () => {
    const egg = newSave(DAY, 7);
    egg.coins = 12;
    egg.inventory = { herb: 2 };
    expect(buy(egg, "wall-meadow", DAY)).toBe("bought");
    expect(undoBuy(egg, DAY + 5000)).toBe("undone");
    const poor = wallet(10, { fiber: 1 });
    expect(poorText(poor, "comfy-bed")).toBe("Needs 25 more coins, 2 more Fiber and 2 more Wood.");
    expect(poorText(poor, "wall-meadow")).toBe("Needs 2 more coins and 2 more Herbs.");
    expect(poorText(wallet(12, { herb: 1 }), "wall-meadow")).toBe("Needs 1 more Herbs.");
    expect(poorText(wallet(11, { herb: 2 }), "wall-meadow")).toBe("Needs 1 more coin.");
  });
});

describe("the undo (edges 5 and 6)", () => {
  const bought = (): Save => {
    const save = wallet(40, { fiber: 3, herb: 2, wood: 2 });
    expect(buy(save, "comfy-bed", DAY)).toBe("bought");
    return save;
  };

  it("edge 5: inside the window it gives back exactly the price, even at exactly 10 seconds", () => {
    for (const ms of [0, 1, 9999, 10000]) {
      const save = bought();
      expect(save.coins).toBe(5);
      expect(undoLeftMs(save, DAY + ms)).toBe(10000 - ms);
      expect(undoBuy(save, DAY + ms), `${ms} ms`).toBe("undone");
      expect([save.coins, save.inventory.fiber, save.inventory.wood, save.inventory.herb]).toEqual([40, 3, 2, 2]);
      expect(save.owned).toEqual([]);
      expect(save.lastBuy).toBeNull();
    }
  });

  it("edge 5: one millisecond after 10 seconds is late, and so is a clock set back or a day ahead; the item stays", () => {
    for (const ms of [10001, -1, -HOUR, 24 * HOUR]) {
      const save = bought();
      expect(undoLeftMs(save, DAY + ms), `${ms} ms`).toBeNull();
      expect(undoBuy(save, DAY + ms), `${ms} ms`).toBe("late");
      expect(save.owned).toEqual(["comfy-bed"]);
      expect(save.coins).toBe(5);
      expect(save.lastBuy).toBeNull();
    }
  });

  it("edges 5 and 6 for every item: undone at 10.000 s with exactly the price back, late at 10.001 s with the item kept", () => {
    for (const id of itemIds) {
      const { coins, bag } = PRICES[id];
      const fresh = (): Save => {
        const save = wallet(coins, bag);
        expect(buy(save, id, DAY), id).toBe("bought");
        expect(save.coins, `${id} coins left`).toBe(0);
        for (const material of Object.keys(bag)) expect((save.inventory as Record<string, number>)[material], `${id} ${material} left`).toBe(0);
        return save;
      };
      const undone = fresh();
      expect(undoBuy(undone, DAY + 10_000), `${id} at 10.000 s`).toBe("undone");
      expect(undone.coins, id).toBe(coins);
      expect(undone.inventory, id).toEqual(bag);
      expect(undone.owned, id).toEqual([]);
      const late = fresh();
      expect(undoBuy(late, DAY + 10_001), `${id} at 10.001 s`).toBe("late");
      expect(late.owned, id).toEqual([id]);
      expect(late.coins, id).toBe(0);
    }
  });

  it("edge 5: a second undo is none, a reload (JSON) inside the window still undoes, and a buy after an undo works", () => {
    const save = bought();
    const reloaded = migrateSave(clone(save))!;
    expect(undoBuy(reloaded, DAY + 3000)).toBe("undone");
    expect(undoBuy(reloaded, DAY + 3000)).toBe("none");
    expect(undoBuy(save, DAY + 3000)).toBe("undone");
    expect(buy(save, "comfy-bed", DAY + 4000)).toBe("bought");
    expect(save.coins).toBe(5);
  });

  it("edge 5: the buy and the undo both catch the save up to now first", () => {
    const save = wallet(12, { herb: 2 });
    expect(buy(save, "wall-meadow", DAY + 30 * MINUTE)).toBe("bought");
    expect(save.lastSimulatedAt).toBe(DAY + 30 * MINUTE);
    expect(undoBuy(save, DAY + 60 * MINUTE)).toBe("late");
    expect(save.lastSimulatedAt).toBe(DAY + 60 * MINUTE);
  });

  it("edge 6: undoing a wallpaper puts back the wall that was shown; undoing anything else leaves the wall alone", () => {
    const save = wallet(80, { fiber: 3, herb: 4, wood: 2, stone: 2 });
    buy(save, "wall-meadow", DAY);
    buy(save, "wall-dusk", DAY + 1000);
    expect(save.wall).toBe("wall-dusk");
    undoBuy(save, DAY + 2000);
    expect(save.wall).toBe("wall-meadow");
    buy(save, "comfy-bed", DAY + 3000);
    undoBuy(save, DAY + 4000);
    expect(save.wall).toBe("wall-meadow");
    buy(save, "wall-dusk", DAY + 5000);
    useWall(save, null); // the player went back to the plain wall inside the window
    undoBuy(save, DAY + 6000);
    expect(save.wall).toBeNull();
    expect(save.owned).toEqual(["wall-meadow"]); // the Dusk and the bed were each undone
  });
});

describe("the wall (edge 7)", () => {
  it("only an owned wallpaper or null can go on the wall, and it says whether anything changed", () => {
    const save = wallet(0, {});
    save.owned = ["wall-meadow", "comfy-bed"];
    expect(useWall(save, "wall-meadow")).toBe(true);
    expect(save.wall).toBe("wall-meadow");
    expect(useWall(save, "wall-meadow")).toBe(false);
    expect(useWall(save, "wall-dusk")).toBe(false); // not owned
    expect(useWall(save, "comfy-bed")).toBe(false); // owned, but not a wallpaper
    expect(useWall(save, "nope")).toBe(false);
    expect(save.wall).toBe("wall-meadow");
    expect(useWall(save, null)).toBe(true);
    expect(save.wall).toBeNull();
    expect(useWall(save, null)).toBe(false);
  });
});

describe("what a save may hold (edges 8 and 9)", () => {
  const base = (): Record<string, unknown> => JSON.parse(JSON.stringify(newSave(DAY, 3))) as Record<string, unknown>;

  it("edge 8: a save from before the shop gets the defaults", () => {
    const old = base();
    delete old.owned;
    delete old.wall;
    delete old.lastBuy;
    const save = migrateSave(old)!;
    expect([save.owned, save.wall, save.lastBuy]).toEqual([[], null, null]);
  });

  it("edge 8: unknown ids, duplicates and junk are dropped; the wall must be an owned wallpaper; the undo must name something owned", () => {
    const raw = base();
    raw.owned = ["wall-meadow", "wall-meadow", "comfy-bed", "constructor", "__proto__", 5, null, ["comfy-bed"], {}, "future-item"];
    raw.wall = "wall-dusk";
    raw.lastBuy = { item: "comfy-bed", at: DAY, wall: "wall-dusk" };
    const save = migrateSave(raw)!;
    expect(save.owned).toEqual(["wall-meadow", "comfy-bed"]);
    expect(save.wall).toBeNull(); // wall-dusk is not owned
    expect(save.lastBuy).toEqual({ item: "comfy-bed", at: DAY, wall: null }); // the earlier wall is not owned either
    const kept = migrateSave({ ...base(), owned: ["wall-meadow"], wall: "wall-meadow", lastBuy: { item: "wall-meadow", at: DAY, wall: null } })!;
    expect([kept.wall, kept.lastBuy]).toEqual(["wall-meadow", { item: "wall-meadow", at: DAY, wall: null }]);
    expect(migrateSave({ ...base(), owned: ["comfy-bed"], wall: "comfy-bed" })!.wall).toBeNull(); // owned, but not a wallpaper
  });

  it("edge 8: a bad undo record is dropped, and nothing in a save makes migrateSave throw", () => {
    const bad = [
      5,
      "x",
      [],
      null,
      {},
      { item: "comfy-bed" },
      { item: "comfy-bed", at: Number.NaN, wall: null },
      { item: "comfy-bed", at: Number.POSITIVE_INFINITY, wall: null },
      { item: "nope", at: DAY, wall: null },
      { item: "wall-dusk", at: DAY, wall: null },
      { item: "comfy-bed", at: DAY, wall: 3 },
    ];
    for (const lastBuy of bad) expect(migrateSave({ ...base(), owned: ["comfy-bed"], lastBuy })!.lastBuy, JSON.stringify(lastBuy)).toBeNull();
    for (const owned of [5, "comfy-bed", null, {}, true, undefined])
      expect(migrateSave({ ...base(), owned, wall: {}, lastBuy: [] })!.owned).toEqual([]);
  });

  it("edge 9: an egg save that owns something, or can still undo, is not untouched", () => {
    const fresh = newSave(DAY, 3);
    expect(isUntouched(fresh)).toBe(true);
    const owns = newSave(DAY, 3);
    owns.owned = ["wall-meadow"];
    expect(isUntouched(owns)).toBe(false);
    const undo = newSave(DAY, 3);
    undo.lastBuy = { item: "wall-meadow", at: DAY, wall: null };
    expect(isUntouched(undo)).toBe(false);
  });
});

describe("the Comfy Bed (edge 10)", () => {
  // One minute of care at night. Awake happiness falls 100 / (20 x 60) = 0.083333 a minute; asleep that is 0.25 of it, 0.0208333; with the bed
  // half of that again, 0.0104167. Hunger asleep falls 100 / (14 x 60) x 0.25 = 0.0297619, whatever is owned.
  const NIGHT = at(22, 0);
  const minute = (owned: string[], set: (save: Save) => void = () => {}, t = NIGHT): Save => {
    const save = aliveSave("cindermane", t);
    save.owned = owned;
    save.creature!.stats.happiness = 80;
    save.creature!.stats.hunger = 80;
    set(save);
    stepCare(save, makeRng(1), t);
    return save;
  };

  it("slows happiness while it sleeps at home, through the simulation itself", () => {
    expect(80 - minute([]).creature!.stats.happiness).toBeCloseTo(0.0208333, 6);
    expect(80 - minute(["comfy-bed"]).creature!.stats.happiness).toBeCloseTo(0.0104167, 6);
    expect(80 - minute(["wall-meadow", "comfy-bed"]).creature!.stats.happiness).toBeCloseTo(0.0104167, 6);
  });

  it("changes nothing awake, and nothing else asleep", () => {
    const noon = at(12, 0);
    expect(80 - minute(["comfy-bed"], () => {}, noon).creature!.stats.happiness).toBeCloseTo(0.0833333, 6);
    expect(80 - minute([], () => {}, noon).creature!.stats.happiness).toBeCloseTo(0.0833333, 6);
    const withBed = minute(["comfy-bed"]).creature!;
    const without = minute([]).creature!;
    expect(80 - withBed.stats.hunger).toBeCloseTo(0.0297619, 6);
    expect(withBed.stats.hunger).toBeCloseTo(without.stats.hunger, 10);
    expect(withBed.stats.hygiene).toBeCloseTo(without.stats.hygiene, 10);
    expect(withBed.stats.energy).toBeCloseTo(without.stats.energy, 10);
  });

  it("gives nothing to a creature that sleeps through the night out working, and everything to the same one at home", () => {
    const away = minute(["comfy-bed"], (save) => void (save.creature!.job = { spot: "meadow", startedAt: NIGHT, endsAt: NIGHT + 3 * MINUTE }));
    expect(away.creature!.sleep).toBe("night");
    expect(80 - away.creature!.stats.happiness).toBeCloseTo(0.0208333, 6);
    expect(80 - minute(["comfy-bed"]).creature!.stats.happiness).toBeCloseTo(0.0104167, 6);
  });

  it("works with Adult Mode off (Kid Mode keeps what it bought)", () => {
    const save = minute(["comfy-bed"], (s) => void delete s.settings.adultMode);
    expect(save.settings.adultMode).toBeUndefined();
    expect(80 - save.creature!.stats.happiness).toBeCloseTo(0.0104167, 6);
  });

  it("the HUD says what the simulation does: the minutes to empty, and the hourly figure on the card", () => {
    const sleeper = (owned: string[]): Save => {
      const save = aliveSave("cindermane", at(20, 0));
      save.owned = owned;
      save.creature!.stats.happiness = 5;
      save.creature!.stats.hunger = 100; // keep it from calling for food: only happiness is looked at
      return save;
    };
    for (const owned of [[] as string[], ["comfy-bed"]]) {
      const save = sleeper(owned);
      const c = save.creature!;
      c.sleep = "night";
      const said = timeToEmpty(c, "happiness", true, owned)!.minutes;
      let ran = 0;
      for (let t = at(20, 0); save.creature!.stats.happiness > 0 && ran < 700; t += MINUTE) {
        stepCare(save, makeRng(1), t);
        ran += 1;
      }
      expect(Math.abs(ran - said), `${JSON.stringify(owned)}: it said ${said}, the simulation took ${ran}`).toBeLessThanOrEqual(1);
    }
    const c = aliveSave("cindermane", DAY).creature!;
    expect(detailLines(c, "happiness", false, [])[0]).toBe("Falls 5 an hour awake and 1.3 an hour asleep.");
    expect(detailLines(c, "happiness", false, ["comfy-bed"])[0]).toBe("Falls 5 an hour awake and 0.6 an hour asleep.");
  });
});

describe("the Feeding Mat (edges 11 and 16)", () => {
  const young = (hunger: number, owned: string[]): Save => {
    const save = aliveSave("cragpup", DAY); // a young creature: its hunger cells count
    save.owned = owned;
    save.creature!.stats.hunger = hunger;
    return save;
  };
  const cells = (save: Save): number => save.creature!.counters.hungerCells;

  it("a meal that ends at exactly 90 counts with the mat and not without; one just under does not count even with it", () => {
    const withMat = young(70, ["feeding-mat"]);
    expect(feed(withMat, "pellet", DAY)).toBe("ate"); // 70 + 20 = 90
    expect(cells(withMat)).toBe(1);
    const without = young(70, []);
    feed(without, "pellet", DAY);
    expect(cells(without)).toBe(0);
    const just = aliveSave("cragpup", DAY).creature!;
    just.stats.hunger = 89.99;
    countCareCells(just, 60, 50, 5);
    expect(just.counters.hungerCells).toBe(0);
    just.stats.hunger = 90;
    countCareCells(just, 60, 50, 5);
    expect(just.counters.hungerCells).toBe(1);
  });

  it("the line for a plain meal is still 95 without the mat", () => {
    const c = aliveSave("cragpup", DAY).creature!;
    c.stats.hunger = 94.99;
    countCareCells(c, 60, 50);
    expect(c.counters.hungerCells).toBe(0);
    c.stats.hunger = 95;
    countCareCells(c, 60, 50);
    expect(c.counters.hungerCells).toBe(1);
  });

  it("a meal that did not raise hunger counts nothing, mat or no mat: a pet at hunger 92", () => {
    for (const owned of [[] as string[], ["feeding-mat"]]) {
      const save = young(92, owned);
      save.creature!.stats.happiness = 50;
      touch(save, "pet", DAY);
      expect(cells(save), JSON.stringify(owned)).toBe(0);
    }
  });

  it("edge 11: every meal that counts without the mat counts with it, for every start and every amount", () => {
    for (let before = 0; before < 95; before += 0.5) {
      for (const eaten of [8, 20, 25, 35]) {
        const after = Math.min(100, before + eaten);
        const run = (grace: number): number => {
          const c = aliveSave("cragpup", DAY).creature!;
          c.stats.hunger = after;
          countCareCells(c, before, 50, grace);
          return c.counters.hungerCells;
        };
        expect(run(5), `${before} to ${after}`).toBeGreaterThanOrEqual(run(0));
      }
    }
  });

  it("the cell cap of 5 holds, and a kid or an adult counts nothing", () => {
    const save = young(0, ["feeding-mat"]);
    for (let i = 0; i < 9; i++) {
      save.creature!.stats.hunger = 80;
      feed(save, "pellet", DAY);
    }
    expect(cells(save)).toBe(5);
    const kid = aliveSave("pebblin", DAY).creature!;
    kid.stats.hunger = 92;
    countCareCells(kid, 70, 50, 5);
    expect(kid.counters.hungerCells).toBe(0);
  });

  it("edge 16: the mat does not move the refusal line: a feed at 94 is accepted and at 95 refused, with the mat", () => {
    expect(feed(young(94, ["feeding-mat"]), "pellet", DAY)).toBe("ate");
    expect(feed(young(95, ["feeding-mat"]), "pellet", DAY)).toBe("full");
    expect(feed(young(92, ["feeding-mat"]), "pellet", DAY)).toBe("ate");
  });

  it("the Growth Forecast says 90 with the mat and 95 without", () => {
    const c = aliveSave("cragpup", DAY).creature!;
    const note = (owned: string[]): string | undefined => forecast(c, DAY, DAY, owned).rows.find((row) => row.id === "hunger")?.note;
    expect(note([])).toBe("A meal that takes hunger from under 95 to 95 or more");
    expect(note(["feeding-mat"])).toBe("A meal that takes hunger from under 95 to 90 or more");
  });

  it("the simulation catches up with owned items the same way a buy does (a save that owns the bed runs a night)", () => {
    const save = aliveSave("cindermane", at(19, 0));
    save.owned = ["comfy-bed"];
    simulateTo(save, at(19, 30));
    expect(save.creature!.stats.happiness).toBeGreaterThan(0);
  });
});
