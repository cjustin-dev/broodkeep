// The Paradise growth rules (docs/paradise-plan.md section 2): field cells, food cells, care cells, the stage lengths, and moving
// between places. Rules that need more than one open field are in growth-fields.test.ts.
import { describe, expect, it } from "vitest";
import { feed, goTo, toggleLights, touch } from "../src/game/actions";
import { killCreature, setCareCounter, setPlace, setServings, setStat, spawnEgg } from "../src/game/dev";
import { countCareCells, fieldCells, foodCells, leadingForm, menuOf, nextForm, stageHours, tierOf } from "../src/game/growth";
import { evolveTo, simulateTo } from "../src/game/sim";
import { HOUR, MINUTE } from "../src/game/time";
import { aliveSave, at } from "./helpers";

const t0 = at(8); // eight in the morning, so a whole stretch of awake time follows

describe("field cells (baby to kid)", () => {
  it("counts one cell for every 15 awake minutes in a field, and none at home", () => {
    const save = aliveSave("blip", t0);
    const c = save.creature!;
    simulateTo(save, t0 + 30 * MINUTE); // at home
    expect(c.counters.fieldMinutes).toEqual({});
    goTo(save, "land", t0 + 30 * MINUTE);
    simulateTo(save, t0 + 44 * MINUTE);
    expect([c.counters.fieldMinutes.land, fieldCells(c, "land")]).toEqual([14, 0]);
    simulateTo(save, t0 + 45 * MINUTE);
    expect([c.counters.fieldMinutes.land, fieldCells(c, "land")]).toEqual([15, 1]);
  });

  it("keeps the minutes of a field when the baby leaves it", () => {
    const save = aliveSave("blip", t0);
    goTo(save, "land", t0);
    simulateTo(save, t0 + 20 * MINUTE);
    goTo(save, "home", t0 + 20 * MINUTE);
    simulateTo(save, t0 + 50 * MINUTE);
    expect(save.creature!.counters.fieldMinutes.land).toBe(20);
    goTo(save, "land", t0 + 50 * MINUTE);
    simulateTo(save, t0 + 60 * MINUTE);
    expect(save.creature!.counters.fieldMinutes.land).toBe(30);
  });

  it("does not count minutes while the baby is asleep", () => {
    const save = aliveSave("blip", t0);
    goTo(save, "land", t0);
    setStat(save, "energy", 50);
    expect(toggleLights(save, t0)).toBe("napping"); // a nap sends it home to its bed
    expect(save.creature!.place).toBe("home");
    setPlace(save, "land"); // (dev mode puts it back in the field while it sleeps)
    simulateTo(save, t0 + 20 * MINUTE);
    expect(save.creature!.sleep).toBe("nap");
    expect(save.creature!.counters.fieldMinutes.land ?? 0).toBe(0);
  });

  it("counts only the baby stage: a kid in a field collects nothing", () => {
    const save = aliveSave("pebblin", t0);
    goTo(save, "land", t0);
    simulateTo(save, t0 + 40 * MINUTE);
    expect(save.creature!.counters.fieldMinutes).toEqual({});
  });

  it("grows into the Land kid in the minute the fourth cell is full, and not before", () => {
    const save = aliveSave("blip", t0);
    goTo(save, "land", t0);
    simulateTo(save, t0 + 59 * MINUTE);
    expect(save.creature!.formId).toBe("blip");
    expect(fieldCells(save.creature!, "land")).toBe(3);
    simulateTo(save, t0 + 60 * MINUTE);
    expect(save.creature!.formId).toBe("pebblin");
    expect(save.creature!.counters.fieldMinutes).toEqual({}); // a new stage starts again
  });

  it("grows up after 6 hours even if it never went outside", () => {
    const save = aliveSave("blip", t0);
    simulateTo(save, t0 + 6 * HOUR - MINUTE);
    expect(save.creature!.formId).toBe("blip");
    simulateTo(save, t0 + 6 * HOUR);
    expect(save.creature!.formId).toBe("pebblin"); // the field of its egg: Land is the only open one
  });

  it("walks a baby home for the night", () => {
    const save = aliveSave("blip", at(19, 50));
    goTo(save, "land", at(19, 50));
    expect(save.creature!.place).toBe("land");
    simulateTo(save, at(20, 5));
    expect(save.creature!.sleep).toBe("night");
    expect(save.creature!.place).toBe("home");
    expect(save.log.some((entry) => entry.text === "Went home to sleep")).toBe(true);
  });

  it("does not carry a nearly due mistake into the next stage", () => {
    const save = aliveSave("pebblin", t0);
    const c = save.creature!;
    c.stats.hunger = 10;
    c.call = "hungry";
    c.callMinutes = 59; // one minute from a care mistake
    evolveTo(save, "sporeling", t0);
    simulateTo(save, t0 + MINUTE);
    expect(save.creature!.counters.careMistakes).toBe(0);
    expect(save.creature!.callMinutes).toBe(1);
  });
});

describe("food cells (kid to young)", () => {
  // Feeds a kid one serving at a time (it must have room in its stomach, so it is made hungry first).
  const serve = (save: ReturnType<typeof aliveSave>, food: Parameters<typeof feed>[1], times: number): void => {
    for (let i = 0; i < times; i++) {
      setStat(save, "hunger", 20);
      expect(feed(save, food, t0)).toBe("ate");
    }
  };
  const youngAfter = (feedings: Array<[Parameters<typeof feed>[1], number]>): string => {
    const save = aliveSave("pebblin", t0);
    for (const [food, times] of feedings) serve(save, food, times);
    // (Not simulated through the day: a creature fed this many times at once and left alone would be sick or dead by then.
    // The growing up itself is tested in "grows up when 24 hours are over".)
    return nextForm(save.creature!, t0 + 24 * HOUR)!;
  };

  it("counts servings in the kid stage only", () => {
    const baby = aliveSave("blip", t0);
    setStat(baby, "hunger", 20);
    feed(baby, "pellet", t0);
    expect(baby.creature!.counters.servings).toEqual({});
    const young = aliveSave("cragpup", t0);
    setStat(young, "hunger", 20);
    feed(young, "carrot", t0);
    expect(young.creature!.counters.servings).toEqual({});
  });

  it("counts servings and makes a cell of every two, keeping a leftover serving", () => {
    const save = aliveSave("pebblin", t0);
    serve(save, "meat", 3);
    expect([save.creature!.counters.servings.meat, foodCells(save.creature!, "meat")]).toEqual([3, 1]);
    serve(save, "meat", 1);
    expect(foodCells(save.creature!, "meat")).toBe(2);
  });

  it("gives the young of the food eaten most", () => {
    expect(youngAfter([["meat", 4]])).toBe("cragpup");
    expect(youngAfter([["carrot", 2]])).toBe("dugling");
    expect(youngAfter([["worm", 2]])).toBe("frillet");
    expect(youngAfter([["meat", 2], ["carrot", 4], ["worm", 2]])).toBe("dugling");
  });

  it("compares whole cells, so 4 and 5 servings are a tie", () => {
    expect(youngAfter([["meat", 4], ["carrot", 5]])).toBe("sporeling");
    expect(youngAfter([["meat", 4], ["carrot", 6]])).toBe("dugling");
  });

  it("gives the fourth young for a tie, for a single serving, and for no field food at all", () => {
    expect(youngAfter([["meat", 2], ["worm", 2]])).toBe("sporeling");
    expect(youngAfter([["meat", 1]])).toBe("sporeling"); // one serving is no cell yet
    expect(youngAfter([])).toBe("sporeling");
    expect(youngAfter([["pellet", 10], ["treat", 6]])).toBe("sporeling"); // pellets and the treat never decide
  });

  it("grows up when 24 hours are over, not a minute sooner", () => {
    const save = aliveSave("pebblin", t0);
    serve(save, "meat", 2);
    simulateTo(save, t0 + 24 * HOUR - MINUTE);
    expect(save.creature!.formId).toBe("pebblin");
    simulateTo(save, t0 + 24 * HOUR);
    expect(save.creature!.formId).toBe("cragpup");
  });

  it("offers pellets, the treat and the field's own foods, and refuses the rest", () => {
    const baby = aliveSave("blip", t0).creature!;
    expect(menuOf(baby)).toEqual(["pellet", "treat"]);
    const kid = aliveSave("pebblin", t0);
    expect(menuOf(kid.creature!)).toEqual(["pellet", "meat", "carrot", "worm", "treat"]);
    const babySave = aliveSave("blip", t0);
    setStat(babySave, "hunger", 20);
    expect(feed(babySave, "meat", t0)).toBe("unavailable");
    expect(babySave.creature!.stats.hunger).toBe(20);
  });
});

describe("care cells and tiers (young to adult)", () => {
  it("counts a hunger cell for a feeding that takes hunger from below the full line to the line or above", () => {
    const save = aliveSave("cragpup", t0);
    setStat(save, "hunger", 40);
    feed(save, "carrot", t0); // 40 to 60: not full
    expect(save.creature!.counters.hungerCells).toBe(0);
    setStat(save, "hunger", 94);
    feed(save, "carrot", t0); // 94 to 100
    expect(save.creature!.counters.hungerCells).toBe(1);
    setStat(save, "hunger", 95);
    expect(feed(save, "carrot", t0)).toBe("full"); // refused: nothing to count
    expect(save.creature!.counters.hungerCells).toBe(1);
  });

  it("counts no hunger cell for a creature that was already at the full line (it would have refused the food)", () => {
    const c = aliveSave("cragpup", t0).creature!;
    c.stats.hunger = 100;
    countCareCells(c, 95, c.stats.happiness);
    expect(c.counters.hungerCells).toBe(0);
    countCareCells(c, 94.9, c.stats.happiness);
    expect(c.counters.hungerCells).toBe(1);
  });

  it("counts a happy cell when happiness reaches 100 from below, not when it was already there", () => {
    const save = aliveSave("cragpup", t0);
    setStat(save, "happiness", 99);
    touch(save, "pet", t0);
    expect(save.creature!.counters.happyCells).toBe(1);
    touch(save, "pet", t0); // already 100
    expect(save.creature!.counters.happyCells).toBe(1);
    setStat(save, "happiness", 50);
    touch(save, "pet", t0); // 52: not 100
    expect(save.creature!.counters.happyCells).toBe(1);
  });

  it("stops counting cells at 5, and counts none outside the young stage", () => {
    const save = aliveSave("cragpup", t0);
    for (let i = 0; i < 8; i++) {
      setStat(save, "hunger", 90);
      feed(save, "carrot", t0);
      setStat(save, "happiness", 99);
      touch(save, "pet", t0);
    }
    expect(save.creature!.counters.hungerCells).toBe(5);
    expect(save.creature!.counters.happyCells).toBe(5);
    const kid = aliveSave("pebblin", t0).creature!;
    kid.stats.hunger = 90;
    kid.stats.happiness = 100;
    countCareCells(kid, 50, 50);
    expect([kid.counters.hungerCells, kid.counters.happyCells]).toEqual([0, 0]);
  });

  it("places an adult by tier: 5 + 5 cells and no mistakes is tier 1, otherwise mistakes alone decide", () => {
    const c = aliveSave("cragpup", t0).creature!;
    const tier = (hunger: number, happy: number, mistakes: number): number => {
      Object.assign(c.counters, { hungerCells: hunger, happyCells: happy, careMistakes: mistakes });
      return tierOf(c);
    };
    expect(tier(5, 5, 0)).toBe(1);
    expect(tier(4, 5, 0)).toBe(2);
    expect(tier(5, 4, 0)).toBe(2);
    expect(tier(0, 0, 0)).toBe(2);
    expect(tier(5, 5, 1)).toBe(2);
    expect(tier(0, 0, 1)).toBe(2);
    expect(tier(5, 5, 2)).toBe(3);
    expect(tier(0, 0, 5)).toBe(3);
    expect(tier(5, 5, 6)).toBe(4);
    expect(tier(0, 0, 40)).toBe(4);
  });

  it("grows into the adult of its tier after 48 hours, not a minute sooner", () => {
    const wanted: Array<[number, number, number, string]> = [
      [5, 5, 0, "gravelhorn"],
      [2, 5, 0, "cindermane"],
      [5, 5, 3, "scrapjaw"],
      [5, 5, 9, "gutterfang"],
    ];
    for (const [hunger, happy, mistakes, adult] of wanted) {
      const save = aliveSave("cragpup", t0);
      Object.assign(save.creature!.counters, { hungerCells: hunger, happyCells: happy, careMistakes: mistakes });
      expect(leadingForm(save.creature!)).toBe(adult);
      expect(nextForm(save.creature!, t0 + 48 * HOUR - MINUTE)).toBeNull();
      expect(nextForm(save.creature!, t0 + 48 * HOUR)).toBe(adult);
    }
  });

  it("never changes an adult", () => {
    const save = aliveSave("gravelhorn", t0);
    expect(leadingForm(save.creature!)).toBeNull();
    expect(nextForm(save.creature!, t0 + 1000 * HOUR)).toBeNull();
    expect(stageHours(save.creature!)).toBeNull();
  });
});

describe("what the dev viewer reads", () => {
  it("names the stage lengths and the form that would win now", () => {
    const baby = aliveSave("blip", t0).creature!;
    expect(stageHours(baby)).toBe(6);
    expect(leadingForm(baby)).toBe("pebblin"); // nothing yet: the field of its egg
    const kid = aliveSave("pebblin", t0);
    expect(stageHours(kid.creature!)).toBe(24);
    setServings(kid, "worm", 6);
    expect(leadingForm(kid.creature!)).toBe("frillet");
    const young = aliveSave("dugling", t0);
    expect(stageHours(young.creature!)).toBe(48);
    setCareCounter(young, "careMistakes", 3);
    expect(leadingForm(young.creature!)).toBe("tuskmole");
  });
});

describe("moving between places", () => {
  it("takes a creature to an open field and home again, and says what happened", () => {
    const save = aliveSave("blip", t0);
    expect(goTo(save, "home", t0)).toBe("already");
    expect(goTo(save, "land", t0)).toBe("went");
    expect(save.creature!.place).toBe("land");
    expect(goTo(save, "land", t0)).toBe("already");
    expect(goTo(save, "home", t0)).toBe("went");
    expect(save.creature!.place).toBe("home");
    expect(save.log.at(-1)?.text).toBe("Went home");
  });

  it("refuses a locked field, a sleeping creature, and a creature that is away", () => {
    const save = aliveSave("blip", t0);
    expect(goTo(save, "water", t0)).toBe("locked");
    expect(goTo(save, "sky", t0)).toBe("locked");
    expect(save.creature!.place).toBe("home");
    save.creature!.sleep = "nap";
    expect(goTo(save, "land", t0)).toBe("sleeping");
    save.creature!.sleep = null;
    save.creature!.job = { spot: "meadow", startedAt: t0, endsAt: t0 + 3 * MINUTE };
    expect(goTo(save, "land", t0)).toBe("unavailable");
  });

  it("does nothing with an egg, or after a death", () => {
    const save = aliveSave("blip", t0);
    killCreature(save, t0);
    expect(goTo(save, "land", t0)).toBe("unavailable");
    spawnEgg(save, t0);
    expect(goTo(save, "land", t0)).toBe("unavailable");
  });
});
