// The shop's foods, "dishes" (adult track A2.2b): which a creature is offered, what a dish meal counts, when it is refused, and what the Growth Forecast
// says when a meal can be worth more than one serving. The edge cases are numbered as in docs/adult-a2-plan.md section 10; "edge N" below is that
// list. Expected values are written out by hand (food ids from data/fields.ts, numbers from data/foods.ts), never made by the code under test (the one
// reading of its own words is the "no word of loss" check, which matches the strings the code makes against a pattern).
import { describe, expect, it } from "vitest";
import { foods } from "../src/data/foods";
import { specialId } from "../src/data/special";
import { itemIds, items } from "../src/data/shop";
import { tuning } from "../src/data/tuning";
import { feed } from "../src/game/actions";
import { feedRefusal } from "../src/game/availability";
import { dishesOf, dishIds, dishLabel, dishMeal, servingsPerMeal } from "../src/game/dishes";
import { forecast } from "../src/game/forecast";
import { countServing, foodCells, leadingForm, nextForm } from "../src/game/growth";
import { buy, undoBuy } from "../src/game/shop";
import { simulateTo } from "../src/game/sim";
import { migrateSave, newSave } from "../src/game/state";
import type { Save } from "../src/game/state";
import { HOUR, MINUTE } from "../src/game/time";
import type { FoodId } from "../src/game/types";
import { isUntouched } from "../src/sync/sync";
import { aliveSave, at } from "./helpers";

const DAY = at(10);
const clone = (save: Save): Save => JSON.parse(JSON.stringify(save)) as Save;

// A kid of the field, awake at DAY (nothing to catch up on at DAY, so a refusal can be compared with the save as it was), owning the given items.
function kid(formId: string, owned: string[], hunger = 40): Save {
  const save = aliveSave(formId, DAY);
  save.owned = owned as Save["owned"];
  save.creature!.stats.hunger = hunger;
  return save;
}

const ALL = ["hearty-bowl", "green-bowl", "sweet-bowl", "stew", "garden-mix"];

// The three foods of each field's kid, filling then light then sweet (data/fields.ts, written out by hand).
const FIELDS = [
  { kid: "pebblin", foods: ["meat", "carrot", "worm"] },
  { kid: "drizzle", foods: ["seafood", "seaweed", "shrimp"] },
  { kid: "cinderling", foods: ["chicken", "corn", "syrup"] },
] as const;

describe("which dishes a creature is offered (edge 3)", () => {
  it("none when nothing is owned, each dish alone, and all five in catalogue order whatever the order owned", () => {
    expect(dishesOf(kid("pebblin", []).creature!, [])).toEqual([]);
    for (const id of ALL) expect(dishesOf(kid("pebblin", [id]).creature!, [id]), id).toEqual([id]);
    const c = kid("pebblin", []).creature!;
    expect(dishesOf(c, [...ALL].reverse())).toEqual(["hearty-bowl", "green-bowl", "sweet-bowl", "stew", "garden-mix"]);
    expect(dishIds).toEqual(ALL);
  });

  it("only a kid with a field is offered one: not a baby, a young, an adult, or the special", () => {
    for (const formId of ["blip", "cragpup", "gravelhorn", "lanternfin", specialId]) {
      expect(dishesOf(aliveSave(formId, DAY).creature!, ALL), formId).toEqual([]);
    }
  });

  it("an id in owned that is not a dish (or not an item at all) is never offered", () => {
    const c = kid("pebblin", []).creature!;
    expect(dishesOf(c, ["comfy-bed", "wall-dusk", "nope", "constructor", "stew"])).toEqual(["stew"]);
  });
});

describe("a booster meal (edge 4)", () => {
  const cases = FIELDS.flatMap(({ kid: formId, foods: three }) =>
    (["hearty-bowl", "green-bowl", "sweet-bowl"] as const).map((dish, kind) => ({ formId, dish, food: three[kind] })),
  );

  it("counts exactly 2 servings (one whole cell) of the right food in every field, and nothing else", () => {
    expect(cases).toHaveLength(9);
    for (const { formId, dish, food } of cases) {
      const save = kid(formId, [dish]);
      expect(feed(save, food, DAY, dish), `${formId} ${dish}`).toBe("ate");
      expect(save.creature!.counters.servings, `${formId} ${dish}`).toEqual({ [food]: 2 });
      expect(foodCells(save.creature!, food as FoodId)).toBe(1);
    }
  });

  it("its meal is the food's own: the same stats, digestion and random numbers as a plain meal of it", () => {
    for (const { formId, dish, food } of cases) {
      const withDish = kid(formId, [dish]);
      const plain = kid(formId, []);
      feed(withDish, food, DAY, dish);
      feed(plain, food, DAY);
      expect(withDish.creature!.stats, `${formId} ${dish}`).toEqual(plain.creature!.stats);
      expect(withDish.creature!.digestQueue).toEqual(plain.creature!.digestQueue);
      expect(withDish.rngState).toBe(plain.rngState);
    }
    // And the hunger is written out: 40 + 35 (filling), 40 + 20 (light), 40 + 25 (sweet).
    const hearty = kid("pebblin", ["hearty-bowl"]);
    feed(hearty, "meat", DAY, "hearty-bowl");
    expect(hearty.creature!.stats.hunger).toBe(75);
    const green = kid("pebblin", ["green-bowl"]);
    feed(green, "carrot", DAY, "green-bowl");
    expect(green.creature!.stats.hunger).toBe(60);
    const sweet = kid("pebblin", ["sweet-bowl"]);
    feed(sweet, "worm", DAY, "sweet-bowl");
    expect(sweet.creature!.stats.hunger).toBe(65);
  });
});

describe("a recipe meal (edge 5)", () => {
  it("Stew counts 1 serving of the filling and 1 of the light food; Garden Mix the light and the sweet; in every field", () => {
    for (const {
      kid: formId,
      foods: [filling, light, sweet],
    } of FIELDS) {
      const stew = kid(formId, ["stew"]);
      expect(feed(stew, filling, DAY, "stew")).toBe("ate");
      expect(stew.creature!.counters.servings, `${formId} stew`).toEqual({ [filling]: 1, [light]: 1 });
      const mix = kid(formId, ["garden-mix"]);
      expect(feed(mix, light, DAY, "garden-mix")).toBe("ate");
      expect(mix.creature!.counters.servings, `${formId} garden-mix`).toEqual({ [light]: 1, [sweet]: 1 });
    }
  });

  it("its stats are the first food's (Stew: meat's 35 hunger, not carrot's 20; Garden Mix: carrot's 20)", () => {
    const stew = kid("pebblin", ["stew"]);
    feed(stew, "meat", DAY, "stew");
    expect(stew.creature!.stats.hunger).toBe(75);
    const mix = kid("pebblin", ["garden-mix"]);
    feed(mix, "carrot", DAY, "garden-mix");
    expect(mix.creature!.stats.hunger).toBe(60);
    const c = kid("pebblin", []).creature!;
    expect(dishMeal(c, "stew")!.counts).toEqual([
      ["meat", 1],
      ["carrot", 1],
    ]);
    expect(dishMeal(c, "garden-mix")!.counts).toEqual([
      ["carrot", 1],
      ["worm", 1],
    ]);
  });
});

describe("a dish is a choice, never automatic (edge 6)", () => {
  it("a plain meal counts 1 with every dish owned, and a day of plain meals leaves the same save with or without them (apart from what is owned)", () => {
    const save = kid("pebblin", ALL);
    expect(feed(save, "meat", DAY)).toBe("ate");
    expect(save.creature!.counters.servings).toEqual({ meat: 1 });

    const day = (owned: string[]): Save => {
      const s = aliveSave("pebblin", at(8));
      s.owned = owned as Save["owned"];
      const foodsInOrder: FoodId[] = ["meat", "carrot", "worm", "pellet", "treat"];
      let i = 0;
      for (let t = at(8, 30); t < at(19); t += 30 * MINUTE) {
        simulateTo(s, t);
        if (s.creature!.stats.hunger < 70) feed(s, foodsInOrder[i++ % foodsInOrder.length]!, t);
      }
      simulateTo(s, at(19));
      return s;
    };
    const withDishes = day(ALL);
    const without = day([]);
    expect(Object.keys(without.creature!.counters.servings).length).toBeGreaterThan(0); // the day did feed it
    withDishes.owned = [];
    expect(withDishes).toEqual(without);
  });
});

describe("refusals (edges 7 and 20)", () => {
  // Each refusal leaves the save as it was (at DAY there is nothing to catch up on).
  const refused = (save: Save, food: FoodId, dish: string | undefined, word: string, label: string): void => {
    const before = clone(save);
    expect(feed(save, food, DAY, dish as never), label).toBe(word);
    expect(save, label).toEqual(before);
  };

  it("a dish that is not offered is 'unavailable' whatever else is true", () => {
    refused(kid("pebblin", []), "meat", "hearty-bowl", "unavailable", "not owned");
    refused(kid("cragpup", ["hearty-bowl"]), "meat", "hearty-bowl", "unavailable", "owned but the creature is a young");
    refused(kid("pebblin", ["hearty-bowl"]), "carrot", "hearty-bowl", "unavailable", "owned but another food");
    refused(kid("pebblin", ["stew"]), "carrot", "stew", "unavailable", "Stew eats the filling food, not the light one");
    refused(kid("pebblin", ["comfy-bed", "stew"]), "meat", "comfy-bed", "unavailable", "an item that is not a dish");
    const notOwnedAsleep = kid("pebblin", []);
    notOwnedAsleep.creature!.sleep = "nap";
    refused(notOwnedAsleep, "meat", "hearty-bowl", "unavailable", "not owned and asleep: the dish check comes before sleep");
    refused(kid("pebblin", [], 97), "meat", "hearty-bowl", "unavailable", "not owned and full: the dish check comes before fullness");
  });

  it("with no creature at home to feed (away on a job, an egg, a dead one) a dish is 'unavailable', owned or not, and nothing changes (the answer of `alive`, before the dish rule)", () => {
    for (const owned of [["hearty-bowl"], []]) {
      const away = kid("pebblin", owned);
      away.creature!.job = { spot: "meadow", startedAt: DAY, endsAt: DAY + 3 * MINUTE };
      refused(away, "meat", "hearty-bowl", "unavailable", `away, owning ${owned.length}`);
      const egg = newSave(DAY, 1234);
      egg.owned = owned as Save["owned"];
      refused(egg, "meat", "hearty-bowl", "unavailable", `an egg, owning ${owned.length}`);
      const dead = kid("pebblin", owned);
      dead.phase = "dead";
      refused(dead, "meat", "hearty-bowl", "unavailable", `a dead creature, owning ${owned.length}`);
    }
  });

  it("an offered dish follows the plain meal's rules: asleep, full at 95 and eating at 94.99", () => {
    const asleep = kid("pebblin", ["hearty-bowl"]);
    asleep.creature!.sleep = "nap";
    refused(asleep, "meat", "hearty-bowl", "sleeping", "owned and asleep");
    refused(kid("pebblin", ["hearty-bowl"], 95), "meat", "hearty-bowl", "full", "owned at 95");
    const edge = kid("pebblin", ["hearty-bowl"], 94.99);
    expect(feed(edge, "meat", DAY, "hearty-bowl")).toBe("ate");
    expect(edge.creature!.counters.servings).toEqual({ meat: 2 }); // once
  });

  it("edge 20: feedRefusal with a dish and no owned list refuses it; with the dish owned and a Land kid it does not", () => {
    const c = kid("pebblin", []).creature!;
    expect(feedRefusal(c, "meat", "hearty-bowl")).toBe("off-menu");
    expect(feedRefusal(c, "meat", "hearty-bowl", [])).toBe("off-menu");
    expect(feedRefusal(c, "meat", "hearty-bowl", ["hearty-bowl"])).toBeNull();
    expect(feedRefusal(c, "meat")).toBeNull(); // no dish: as before
  });
});

describe("counting servings (edge 8)", () => {
  it("a count under 1, or not a number, adds nothing; a kid counts it, a young does not", () => {
    const c = kid("pebblin", []).creature!;
    for (const bad of [0, -1, -5, 0.5, Number.NaN]) {
      countServing(c, "meat", bad);
      expect(c.counters.servings, String(bad)).toEqual({});
    }
    countServing(c, "meat");
    countServing(c, "meat", 2);
    expect(c.counters.servings).toEqual({ meat: 3 });
    const young = aliveSave("cragpup", DAY).creature!;
    countServing(young, "meat", 2);
    expect(young.counters.servings).toEqual({});
  });
});

describe("what the dishes decide (edge 9)", () => {
  const meal = (save: Save, food: FoodId, dish?: string): void => {
    save.creature!.stats.hunger = 40; // room for the next meal
    feed(save, food, DAY, dish as never);
  };

  it("one meat serving plus a Hearty Bowl meal is 3 servings and 1 cell", () => {
    const save = kid("pebblin", ["hearty-bowl"]);
    meal(save, "meat");
    meal(save, "meat", "hearty-bowl");
    expect(save.creature!.counters.servings).toEqual({ meat: 3 });
    expect(foodCells(save.creature!, "meat")).toBe(1);
  });

  it("two Stew meals tie meat and carrot, which gives the fourth young; a Hearty Bowl meal then breaks the tie for meat", () => {
    const save = kid("pebblin", ["stew", "hearty-bowl"]);
    const grown = save.creature!.stageStartedAt + 24 * HOUR;
    meal(save, "meat", "stew");
    meal(save, "meat", "stew");
    expect(save.creature!.counters.servings).toEqual({ meat: 2, carrot: 2 });
    expect(nextForm(save.creature!, grown)).toBe("sporeling");
    meal(save, "meat", "hearty-bowl");
    expect(nextForm(save.creature!, grown)).toBe("cragpup");
    // Without the dishes: two plain meat meals are 1 cell and give the meat young.
    const plain = kid("pebblin", []);
    meal(plain, "meat");
    meal(plain, "meat");
    expect(nextForm(plain.creature!, grown)).toBe("cragpup");
  });
});

describe("the Growth Forecast (edge 10)", () => {
  it("servingsPerMeal: a booster owned makes its food worth a whole cell, nothing else does", () => {
    expect(servingsPerMeal([], "land", "meat")).toBe(1);
    expect(servingsPerMeal(["hearty-bowl"], "land", "meat")).toBe(2);
    expect(servingsPerMeal(["hearty-bowl"], "land", "carrot")).toBe(1);
    expect(servingsPerMeal(["hearty-bowl"], "water", "seafood")).toBe(2);
    expect(servingsPerMeal(["green-bowl"], "sky", "corn")).toBe(2);
    expect(servingsPerMeal(["sweet-bowl"], "sky", "syrup")).toBe(2);
    expect(servingsPerMeal(["stew", "garden-mix"], "land", "meat")).toBe(1);
    expect(servingsPerMeal(["stew", "garden-mix"], "land", "carrot")).toBe(1);
    expect(servingsPerMeal(ALL, "land", "pellet" as FoodId)).toBe(1); // not one of the field's foods
  });

  // A Land kid one minute before its 24 hours end, at hunger 95 (so one more meal at most), with 2 carrot servings and nothing else.
  const nearTheEnd = (): { c: Save["creature"] & object; now: number } => {
    const save = kid("pebblin", [], 95);
    save.creature!.counters.servings = { carrot: 2 };
    return { c: save.creature!, now: save.creature!.stageStartedAt + 24 * HOUR - MINUTE };
  };

  it("one more meal cannot lift meat to a cell, so it is Locked; with a Hearty Bowl it can, so it is not", () => {
    const { c, now } = nearTheEnd();
    expect(forecast(c, now).confidence?.kind).toBe("locked");
    expect(forecast(c, now, now, ["stew", "garden-mix", "green-bowl"]).confidence?.kind).toBe("locked"); // none of those can lift meat or worm to a cell
    expect(forecast(c, now, now, ["hearty-bowl"]).confidence?.kind).toBe("open"); // a doubled meat meal ties carrot
    expect(forecast(c, now, now, ["sweet-bowl"]).confidence?.kind).toBe("open"); // and so does a doubled worm meal
  });

  it("the rivals' words follow: 2 meat servings are 'more than the time left allows' with one meal left, and enough with a Hearty Bowl", () => {
    const { c, now } = nearTheEnd();
    const meat = (owned: string[]): string => forecast(c, now, now, owned).rivals.find((r) => r.label === "Meat")!.text;
    expect(meat([])).toBe("Meat: it takes 2 Meat servings, more than the time left allows.");
    expect(meat(["hearty-bowl"])).toBe(
      "Meat: 2 Meat servings more would make Sporeling the leader, and Cragpup would take 4 more, more than the time left allows.",
    );
  });

  it("a tie's second half follows too: with two meals left, Cragpup is 3 more meat servings away, within reach of two Hearty Bowl meals but not of two plain ones", () => {
    const save = kid("pebblin", [], 90); // hunger 90 one minute from the end: two more meals at most (the room is 10.2 of a smallest meal of 5)
    save.creature!.counters.servings = { carrot: 2, meat: 1 };
    const c = save.creature!;
    const now = c.stageStartedAt + 24 * HOUR - MINUTE;
    const meat = (owned: string[]): string => forecast(c, now, now, owned).rivals.find((r) => r.label === "Meat")!.text;
    expect(meat([])).toBe(
      "Meat: 1 Meat serving more would make Sporeling the leader, and Cragpup would take 3 more, more than the time left allows.",
    );
    expect(meat(["hearty-bowl"])).toBe("Meat: 1 Meat serving more would make Sporeling the leader, and 3 more would give Cragpup.");
  });

  it("whenever it says Locked, no run of meals (each a plain food or an owned dish) changes the leader: a Land kid with 0 to 7 servings of each of its three foods, hunger 95 and 90, every set of the five dishes", () => {
    // What each dish counts for a Land kid, written out by hand (the same as the plan's table: Hearty/Green/Sweet Bowl 2 of one food, Stew meat + carrot, Garden Mix carrot + worm).
    const counts: Record<string, Array<[FoodId, number]>> = {
      "hearty-bowl": [["meat", 2]],
      "green-bowl": [["carrot", 2]],
      "sweet-bowl": [["worm", 2]],
      stew: [
        ["meat", 1],
        ["carrot", 1],
      ],
      "garden-mix": [
        ["carrot", 1],
        ["worm", 1],
      ],
    };
    const subsets = Array.from({ length: 32 }, (_, bits) => ALL.filter((_, i) => bits & (1 << i)));
    expect(subsets).toHaveLength(32);
    const lockedBy: Record<string, number> = {};
    for (const hunger of [95, 90]) {
      const meals = hunger === 95 ? 1 : 2; // mostMeals at this hunger one minute from the end: the room is 5.2 or 10.2 of a smallest meal of 5 (worked out by hand)
      for (const owned of subsets) {
        const c = kid("pebblin", owned, hunger).creature!;
        const now = c.stageStartedAt + 24 * HOUR - MINUTE;
        const options: Array<Array<[FoodId, number]>> = [[["meat", 1]], [["carrot", 1]], [["worm", 1]], ...owned.map((id) => counts[id]!)];
        const walk = (left: number, servings: Record<string, number>, leader: string | null, label: string): void => {
          c.counters.servings = servings;
          expect(leadingForm(c), label).toBe(leader);
          if (left === 0) return;
          for (const option of options) {
            const next = { ...servings };
            for (const [food, n] of option) next[food] = (next[food] ?? 0) + n;
            walk(left - 1, next, leader, label);
          }
        };
        for (let meat = 0; meat <= 7; meat++) {
          for (let carrot = 0; carrot <= 7; carrot++) {
            for (let worm = 0; worm <= 7; worm++) {
              const start = { meat, carrot, worm };
              c.counters.servings = start;
              if (forecast(c, now, now, owned).confidence?.kind !== "locked") continue;
              const key = `${hunger} ${owned.join("+") || "none"}`;
              lockedBy[key] = (lockedBy[key] ?? 0) + 1;
              walk(meals, start, leadingForm(c), `${key} servings ${meat}/${carrot}/${worm}`);
            }
          }
        }
      }
    }
    // The sweep is not empty: every one of the 2 hunger levels x 32 sets has Locked states in the grid, so the walk ran on each. The fewest is 24 (found
    // on 2026-11-23 by failing an assertion on the sorted counts of `lockedBy` once and reading the message; the next fewest groups have 40).
    expect(Object.keys(lockedBy)).toHaveLength(64);
    expect(Math.min(...Object.values(lockedBy))).toBeGreaterThanOrEqual(24);
  }, 30_000); // the whole file runs in about 3 seconds here; the sweep gets a long limit so a slower machine fails on the rule, not the default 5 s
});

describe("nothing else moves (edges 11 and 19)", () => {
  it("a dish meal changes nothing but the servings: the creature and the save are those of a plain meal of the same food", () => {
    const dish = kid("pebblin", ["hearty-bowl"]);
    feed(dish, "meat", DAY, "hearty-bowl");
    const plain = kid("pebblin", ["hearty-bowl"]);
    feed(plain, "meat", DAY);
    expect(dish.creature!.counters.servings).toEqual({ meat: 2 });
    expect(plain.creature!.counters.servings).toEqual({ meat: 1 });
    dish.creature!.counters.servings = {};
    plain.creature!.counters.servings = {};
    dish.log.at(-1)!.text = plain.log.at(-1)!.text = ""; // the log names the dish (the next test)
    expect(dish).toEqual(plain);
  });

  it("the log names the dish, and a plain meal still names the food", () => {
    const save = kid("pebblin", ["hearty-bowl"]);
    feed(save, "meat", DAY, "hearty-bowl");
    expect(save.log.at(-1)!.text).toBe("Ate Hearty Bowl");
    save.creature!.stats.hunger = 40;
    feed(save, "meat", DAY);
    expect(save.log.at(-1)!.text).toBe("Ate Meat");
  });
});

describe("the saved game (edge 12)", () => {
  const base = (): Record<string, unknown> => JSON.parse(JSON.stringify(newSave(DAY, 3))) as Record<string, unknown>;

  it("migrateSave keeps the five ids and drops one it does not know", () => {
    const raw = { ...base(), owned: [...ALL, "future-food"] };
    expect(migrateSave(raw)!.owned).toEqual(ALL);
  });

  it("a save that owns only a dish is not untouched", () => {
    const fresh = newSave(DAY, 3);
    expect(isUntouched(fresh)).toBe(true);
    fresh.owned = ["stew"];
    expect(isUntouched(fresh)).toBe(false);
  });

  it("a dish is offered the moment it is bought and gone the moment it is undone", () => {
    const save = kid("pebblin", []);
    save.coins = 25;
    save.inventory = { fish: 3 };
    expect(buy(save, "hearty-bowl", DAY)).toBe("bought");
    expect(dishesOf(save.creature!, save.owned)).toEqual(["hearty-bowl"]);
    expect(undoBuy(save, DAY + 1000)).toBe("undone");
    expect(dishesOf(save.creature!, save.owned)).toEqual([]);
  });
});

describe("the words (edge 13) and the catalogue's foods", () => {
  it("the cards and the tray buttons say what the meal does, in numbers (a booster card names its three foods; a recipe card names the two kinds, its tray button the two foods)", () => {
    expect(items["hearty-bowl"].effect).toBe("The filling food (Meat, Seafood, Chicken) counts 2 servings (kid stage).");
    expect(items["green-bowl"].effect).toBe("The light food (Carrot, Seaweed, Corn) counts 2 servings (kid stage).");
    expect(items["sweet-bowl"].effect).toBe("The sweet food (Worm, Shrimp, Syrup) counts 2 servings (kid stage).");
    expect(items.stew.effect).toBe("A filling meal that also counts 1 serving of the light food (kid stage).");
    expect(items["garden-mix"].effect).toBe("A light meal that also counts 1 serving of the sweet food (kid stage).");
    const c = kid("pebblin", []).creature!;
    expect(dishLabel(c, "hearty-bowl")).toBe("Hearty Bowl: Meat, counts 2 servings");
    expect(dishLabel(c, "stew")).toBe("Stew: Meat and Carrot, 1 serving of each");
    expect(dishLabel(c, "garden-mix")).toBe("Garden Mix: Carrot and Worm, 1 serving of each");
    expect(dishLabel(kid("drizzle", []).creature!, "sweet-bowl")).toBe("Sweet Bowl: Shrimp, counts 2 servings");
  });

  it("the whole of every string has no word of loss, and the 2 in the words is the tuning's servingsPerFoodCell (pinned: change it and the words)", () => {
    expect(tuning.growth.servingsPerFoodCell).toBe(2);
    for (const id of dishIds) {
      for (const { kid: formId } of FIELDS) {
        const words = `${items[id].name} ${items[id].effect} ${dishLabel(kid(formId, []).creature!, id)}`;
        expect(words, `${id} ${formId}`).not.toMatch(/lose|lost|waste|penalt|cost you|only|never/i);
      }
    }
    expect(foods.meat.name).toBe("Meat"); // the names the words above are built from
    expect(itemIds.filter((id) => items[id].kind === "food")).toEqual(ALL);
  });
});
