// The Growth Forecast's numbers (game/forecast.ts) checked against the code that runs the game. The edge cases are listed in
// docs/adult-a1-plan.md, section 3b. The "Locked" claims are checked by playing the real simulation against them.
import { describe, expect, it } from "vitest";
import { eggField } from "../src/data/eggs";
import { foods } from "../src/data/foods";
import { planOf } from "../src/data/fields";
import { specialId } from "../src/data/special";
import { tuning } from "../src/data/tuning";
import { feed, goTo, touch } from "../src/game/actions";
import { forceEvolve } from "../src/game/dev";
import { adultTier, dayText, forecast, mostMeals, mostMistakes, whatIf } from "../src/game/forecast";
import { fieldCells, leadingForm, nextForm, stageHours } from "../src/game/growth";
import { makeRng } from "../src/game/rng";
import { simulateTo } from "../src/game/sim";
import { evolveTo } from "../src/game/sim";
import { migrateSave } from "../src/game/state";
import type { CallKind, Counters, Creature, Save } from "../src/game/state";
import { HOUR, MINUTE } from "../src/game/time";
import type { EggPattern, FieldId, FoodId } from "../src/game/types";
import { aliveSave, at } from "./helpers";

const NOON = at(12);
const g = tuning.growth;

interface Options {
  counters?: Partial<Counters>;
  ageMinutes?: number; // how long ago the stage began
  pattern?: EggPattern;
  hunger?: number;
}

// A creature of `formId` in a save, with the clock at noon and everything else fine (full stats, no call, nothing to digest).
function make(formId: string, o: Options = {}): { save: Save; c: Creature; now: number } {
  const save = aliveSave("blip", at(8));
  if (formId !== "blip") forceEvolve(save, formId, at(8));
  const c = save.creature!;
  Object.assign(c.counters, o.counters ?? {});
  c.stageStartedAt = NOON - (o.ageMinutes ?? 0) * MINUTE;
  c.eggPattern = o.pattern ?? "speckled";
  Object.assign(c.stats, { hunger: o.hunger ?? 100, happiness: 100, energy: 100, hygiene: 100, wellness: 100 });
  c.poop = 0;
  c.call = null;
  c.callMinutes = 0;
  c.digestQueue = [];
  c.place = "home";
  save.lastSimulatedAt = NOON;
  return { save, c, now: NOON };
}

// Freezes an object all the way down, so any write to it throws (the tests run as modules, which are strict).
function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

// Plays the real simulation one minute at a time until `endMs`, letting `move` act after each minute. Returns the form it ends as.
function play(save: Save, endMs: number, move: (save: Save, t: number) => void): string {
  for (let t = save.lastSimulatedAt + MINUTE; t <= endMs; t += MINUTE) {
    simulateTo(save, t);
    if (save.phase === "alive") move(save, t);
  }
  return save.creature!.formId;
}
const idle = (): void => undefined;
// As many meals of one food as it will take, in one instant (a player can tap as fast as the game allows).
const eat = (save: Save, food: FoodId, t: number): void => {
  for (let i = 0; i < 50 && feed(save, food, t) === "ate"; i++);
};

const baby = (counters: Partial<Counters>, o: Options = {}) => make("blip", { ...o, counters });
const kid = (counters: Partial<Counters>, o: Options = {}) => make(planOf("land").kid, { ...o, counters });
const young = (counters: Partial<Counters>, o: Options = {}) => make("cragpup", { ...o, counters });

describe("the leader", () => {
  // [title, creature, the form it must lead to, written out by hand from data/fields.ts]
  const cases: Array<[string, () => { c: Creature }, string]> = [
    ["a baby with no cells and a speckled egg goes to Land's kid", () => baby({}), "pebblin"],
    ["a baby with no cells and a striped egg goes to Water's kid", () => baby({}, { pattern: "striped" }), "drizzle"],
    ["a baby with no cells and a swirled egg goes to Sky's kid", () => baby({}, { pattern: "swirled" }), "cinderling"],
    ["Land 3 cells against Water 1: Land", () => baby({ fieldMinutes: { land: 45, water: 15 } }), "pebblin"],
    ["Water 2 cells against Land 1: Water", () => baby({ fieldMinutes: { land: 15, water: 30 } }, { pattern: "swirled" }), "drizzle"],
    ["Land 2 and Water 2 level, Sky 0, swirled egg: the egg's field wins even though it is behind", () => baby({ fieldMinutes: { land: 30, water: 30 } }, { pattern: "swirled" }), "cinderling"],
    ["14 minutes is not a cell", () => baby({ fieldMinutes: { land: 14 } }, { pattern: "striped" }), "drizzle"],
    ["15 minutes is a cell", () => baby({ fieldMinutes: { land: 15 } }, { pattern: "striped" }), "pebblin"],
    ["Sky at 4 cells ends the stage", () => baby({ fieldMinutes: { sky: 60 } }), "cinderling"],
    ["a kid with meat 4 servings (2 cells) leads to Cragpup", () => kid({ servings: { meat: 4 } }), "cragpup"],
    ["a kid with carrot 5 against meat 3 (2 cells against 1): Dugling", () => kid({ servings: { meat: 3, carrot: 5 } }), "dugling"],
    ["a kid with worm 2: Frillet", () => kid({ servings: { worm: 2 } }), "frillet"],
    ["3 servings against 2 are 1 cell each: a tie gives the fourth young", () => kid({ servings: { meat: 3, carrot: 2 } }), "sporeling"],
    ["a kid never fed a field food: the fourth young", () => kid({}), "sporeling"],
    ["pellets and treats count for nothing", () => kid({ servings: { pellet: 9, treat: 9 } }), "sporeling"],
    ["three level: the fourth young", () => kid({ servings: { meat: 2, carrot: 2, worm: 2 } }), "sporeling"],
    ["young, 5 hunger cells, 5 happy cells, no mistakes: tier 1", () => young({ hungerCells: 5, happyCells: 5 }), "gravelhorn"],
    ["young, 4 hunger cells, no mistakes: tier 2", () => young({ hungerCells: 4, happyCells: 5 }), "cindermane"],
    ["young, 4 happy cells, no mistakes: tier 2", () => young({ hungerCells: 5, happyCells: 4 }), "cindermane"],
    ["young, one mistake, full cells: tier 2", () => young({ hungerCells: 5, happyCells: 5, careMistakes: 1 }), "cindermane"],
    ["young, two mistakes: tier 3", () => young({ hungerCells: 5, happyCells: 5, careMistakes: 2 }), "scrapjaw"],
    ["young, five mistakes: tier 3", () => young({ careMistakes: 5 }), "scrapjaw"],
    ["young, six mistakes: tier 4", () => young({ careMistakes: 6 }), "gutterfang"],
    ["young, no care at all: tier 2", () => young({}), "cindermane"],
  ];
  it.each(cases)("%s", (_title, build, expected) => {
    const { c } = build();
    const f = forecast(c, NOON);
    expect(f.leader).toBe(expected);
    expect(leadingForm(c)).toBe(expected); // the game's own function says the same
    const limit = stageHours(c)!;
    expect(nextForm(c, c.stageStartedAt + limit * HOUR)).toBe(expected); // and so does what the game does when the time is up
  });

  it("an adult and the special have no leader, a final-form line and their own tier", () => {
    const adult = make("gravelhorn").c;
    const fa = forecast(adult, NOON);
    expect([fa.stage, fa.leader, fa.tier, fa.timer, fa.confidence, fa.rows.length, fa.rivals.length]).toEqual(["adult", null, 1, null, null, 0, 0]);
    expect(fa.rule).toEqual(["Growth is complete."]);
    expect(forecast(make("mudlop").c, NOON).tier).toBe(4);
    const special = forecast(make(specialId).c, NOON);
    expect([special.stage, special.leader, special.tier, special.timer, special.confidence]).toEqual(["special", null, null, null, null]);
    expect(special.rule).toEqual(["Dustpuff is a special form. It grows no further."]);
  });

  it("the tier of every adult in the tree is its place in the table", () => {
    expect(adultTier("gravelhorn")).toBe(1);
    expect(adultTier("gutterfang")).toBe(4);
    expect(adultTier("galecrown")).toBe(1);
    expect(adultTier("pebblin")).toBeNull();
    expect(adultTier("nobody")).toBeNull();
  });

  it("a baby at 4 cells grows up at the next minute: no lock claim, no rivals", () => {
    const { c } = baby({ fieldMinutes: { sky: 60, land: 30 } });
    const f = forecast(c, NOON);
    expect(f.confidence).toEqual({ kind: "now", text: "It grows up at the next minute." });
    expect(f.rivals).toEqual([]);
    expect(forecast(baby({ fieldMinutes: { sky: 59 } }).c, NOON).confidence?.kind).not.toBe("now"); // 59 minutes is 3 cells
  });

  it("the same numbers whether it is at home, away on a job, asleep, or asleep on a job", () => {
    const base = forecast(young({ hungerCells: 3, careMistakes: 1 }, { ageMinutes: 600 }).c, NOON);
    for (const change of [
      (c: Creature) => { c.job = { spot: "meadow", startedAt: NOON - 5 * MINUTE, endsAt: NOON + 5 * MINUTE }; },
      (c: Creature) => { c.sleep = "night"; },
      (c: Creature) => { c.sleep = "night"; c.job = { spot: "meadow", startedAt: NOON - 5 * MINUTE, endsAt: NOON + 5 * MINUTE }; },
    ]) {
      const { c } = young({ hungerCells: 3, careMistakes: 1 }, { ageMinutes: 600 });
      change(c);
      expect(forecast(c, NOON)).toEqual(base);
    }
  });
});

describe("the stage time", () => {
  it("is the full length at the start, then counts down to the checkpoint the game uses", () => {
    const { c } = kid({}, { ageMinutes: 0 });
    const t = forecast(c, NOON).timer!;
    expect([t.leftMinutes, t.limitMinutes, t.endsAt]).toEqual([1440, 1440, NOON + 24 * HOUR]);
    expect(t.text).toBe("24:00 left, until tomorrow 12:00 pm.");
    const mid = forecast(kid({}, { ageMinutes: 600 }).c, NOON).timer!;
    expect([mid.leftMinutes, mid.text]).toEqual([840, "14:00 left, until tomorrow 2:00 am."]);
  });

  it("a baby's time is a limit, with the early end named", () => {
    const t = forecast(baby({}, { ageMinutes: 120 }).c, NOON).timer!;
    expect(t.text).toBe("Within 4:00, by today 4:00 pm. A field with 4 cells ends it sooner.");
  });

  it("is never negative, and says it is ready when it is up or past due", () => {
    for (const age of [1440, 1441, 5000]) {
      const t = forecast(kid({}, { ageMinutes: age }).c, NOON).timer!;
      expect(t.leftMinutes).toBe(0);
      expect(t.text).toBe("Ready to grow up.");
    }
    expect(forecast(kid({}, { ageMinutes: 1439.5 }).c, NOON).timer!.leftMinutes).toBe(0.5);
  });

  it("after a clock set back it is the real time to the checkpoint, longer than the stage, and says so", () => {
    const { c } = kid({}, { ageMinutes: -600 }); // the stage began 10 hours from now
    const t = forecast(c, NOON).timer!;
    expect(t.leftMinutes).toBe(1440 + 600);
    expect(t.endsAt).toBe(c.stageStartedAt + 24 * HOUR);
    expect(t.text).toContain("The clock was set back, so this runs longer than the stage's length.");
    expect(nextForm(c, t.endsAt - MINUTE)).toBeNull(); // the game really does wait that long
    expect(nextForm(c, t.endsAt)).not.toBeNull();
  });

  it("names the day: today, tomorrow, yesterday, a weekday, across a daylight saving change", () => {
    const old = process.env.TZ;
    try {
      process.env.TZ = "America/New_York";
      const now = new Date(2026, 2, 7, 23, 30).getTime(); // the evening before the clocks go forward
      expect(dayText(now, now)).toBe("today");
      expect(dayText(new Date(2026, 2, 8, 12, 0).getTime(), now)).toBe("tomorrow"); // 12 hours 30 minutes later on the clock face, 11 and a half hours in real time, the next day
      expect(dayText(new Date(2026, 2, 9, 8, 0).getTime(), now)).toBe("Mon");
      expect(dayText(new Date(2026, 2, 6, 23, 59).getTime(), now)).toBe("yesterday");
      expect(dayText(new Date(2026, 2, 8, 0, 5).getTime(), now)).toBe("tomorrow"); // 35 minutes later
    } finally {
      if (old === undefined) delete process.env.TZ;
      else process.env.TZ = old;
    }
  });
});

describe("the rows", () => {
  it("a baby has one row per field with pips of the 4 cells that end the stage", () => {
    const { c } = baby({ fieldMinutes: { land: 47, water: 15 } });
    const rows = forecast(c, NOON).rows;
    expect(rows.map((r) => [r.label, r.value, r.pips, r.leads])).toEqual([
      ["Land", 3, 4, true],
      ["Water", 1, 4, false],
      ["Sky", 0, 4, false],
    ]);
    expect(rows[0]!.note).toBe("2 of 15 awake minutes toward the next cell");
  });

  it("a kid has the field's three foods with whole cells and the servings behind them", () => {
    const { c } = kid({ servings: { meat: 5, carrot: 1 } });
    const rows = forecast(c, NOON).rows;
    expect(rows.map((r) => [r.label, r.value, r.pips, r.leads])).toEqual([
      ["Meat", 2, null, true],
      ["Carrot", 0, null, false],
      ["Worm", 0, null, false],
    ]);
    expect([rows[0]!.note, rows[1]!.note]).toEqual(["5 servings, 2 make a cell", "1 serving, 2 make a cell"]);
  });

  it("a young one has hunger cells, happy cells and mistakes, with the real rules in the notes", () => {
    const rows = forecast(young({ hungerCells: 3, happyCells: 4, careMistakes: 2 }).c, NOON).rows;
    expect(rows.map((r) => [r.label, r.value, r.pips, r.maxTaps])).toEqual([
      ["Hunger cells", 3, 5, 2],
      ["Happy cells", 4, 5, 1],
      ["Care mistakes", 2, null, 4],
    ]);
    expect(rows[0]!.note).toBe("A meal that takes hunger from under 95 to 95 or more");
    expect(rows[2]!.note).toBe("Tier 1 allows none, tier 2 up to 1, tier 3 up to 5");
  });

  it("the tie rule is named, with the field the egg pattern sends it to", () => {
    expect(forecast(baby({ fieldMinutes: { land: 30, water: 30 } }, { pattern: "swirled" }).c, NOON).tie).toBe(
      "Land and Water are level at 2 cells. A tie goes to the field of its egg pattern: Sky.",
    );
    expect(forecast(baby({}).c, NOON).tie).toBe("No field cell yet. A tie goes to the field of its egg pattern: Land.");
    expect(forecast(baby({ fieldMinutes: { land: 30 } }).c, NOON).tie).toBeNull();
    expect(forecast(kid({ servings: { meat: 3, carrot: 2 } }).c, NOON).tie).toBe("Meat and Carrot are level at 1 cell. A tie gives the fourth young: Sporeling.");
    expect(forecast(kid({}).c, NOON).tie).toBe("No field food yet. A tie gives the fourth young: Sporeling.");
    expect(forecast(kid({ servings: { meat: 4 } }).c, NOON).tie).toBeNull();
    expect(forecast(young({}).c, NOON).tie).toBeNull();
  });

  it("the care clock says how long it has gone without care, and what happens at the end", () => {
    const f = forecast(baby({ neglectMinutes: 65 }).c, NOON);
    expect(f.careClock).toEqual({
      minutes: 65,
      limitMinutes: 240,
      text: "1:05 of 4:00 awake hours with no care (time away on a job does not count). At 4:00 it becomes Dustpuff instead.",
    });
    expect(forecast(young({}).c, NOON).careClock).toBeNull();
  });
});

describe("rivals", () => {
  it("a baby's rival amounts flip the leader exactly: one minute less does not", () => {
    for (const counters of [{ fieldMinutes: { land: 45, water: 20 } }, { fieldMinutes: { land: 30, water: 30 } }, {}, { fieldMinutes: { sky: 14 } }]) {
      const { c } = baby(counters, { pattern: "swirled" });
      const f = forecast(c, NOON);
      expect(f.rivals.length).toBe(2);
      for (const r of f.rivals) {
        const field = r.label.toLowerCase() as FieldId;
        const lead = (n: number) => {
          const copy = structuredClone(c);
          copy.counters.fieldMinutes[field] = (copy.counters.fieldMinutes[field] ?? 0) + n;
          return leadingForm(copy);
        };
        expect(r.amount).not.toBeNull();
        expect(lead(r.amount!)).not.toBe(f.leader);
        expect(lead(r.amount! - 1)).toBe(f.leader);
        expect(lead(r.amount!)).toBe(r.becomes);
      }
    }
  });

  it("a baby example, written out", () => {
    const f = forecast(baby({ fieldMinutes: { land: 45, water: 20 } }, { ageMinutes: 100 }).c, NOON);
    expect(f.rivals.map((r) => r.text)).toEqual([
      "Water: 40 awake minutes more would make Drizzle the leader.", // 4 cells beat Land's 3 (cells, not minutes, are compared)
      "Sky: 60 awake minutes more would make Cinderling the leader.",
    ]);
  });

  it("a kid's rival numbers flip the leader exactly, and a tie is explained", () => {
    const { c } = kid({ servings: { meat: 4, carrot: 1 } }, { hunger: 50 });
    const f = forecast(c, NOON);
    const carrot = f.rivals.find((r) => r.label === "Carrot")!;
    expect(carrot.amount).toBe(3); // 1 + 3 = 4 servings = 2 cells: level with Meat, so the fourth young
    expect(carrot.becomes).toBe("sporeling");
    expect(carrot.text).toBe("Carrot: 3 Carrot servings more would make Sporeling the leader, and 5 more would give Dugling.");
    const lead = (n: number) => {
      const copy = structuredClone(c);
      copy.counters.servings.carrot = (copy.counters.servings.carrot ?? 0) + n;
      return leadingForm(copy);
    };
    expect([lead(2), lead(3), lead(4), lead(5)]).toEqual(["cragpup", "sporeling", "sporeling", "dugling"]);
  });

  it("says when the time left is not enough, from the same bound as the lock", () => {
    // 2 cells of Meat, nothing else, hunger full, 10 minutes left: no rival can get 4 servings in that time.
    const { c } = kid({ servings: { meat: 4 } }, { ageMinutes: 1430 });
    const f = forecast(c, NOON);
    expect(f.rivals.every((r) => !r.enough)).toBe(true);
    expect(f.rivals[0]!.text).toBe("Carrot: it takes 4 Carrot servings, more than the time left allows.");
  });

  it("a kid's other rival: Worm, with a tie in between", () => {
    const { c } = kid({ servings: { meat: 4, carrot: 1 } }, { hunger: 50 });
    const worm = forecast(c, NOON).rivals.find((r) => r.label === "Worm")!;
    expect([worm.amount, worm.becomes]).toEqual([4, "sporeling"]);
    expect(worm.text).toBe("Worm: 4 Worm servings more would make Sporeling the leader, and 6 more would give Frillet.");
    const lead = (n: number) => {
      const copy = structuredClone(c);
      copy.counters.servings.worm = n;
      return leadingForm(copy);
    };
    expect([lead(3), lead(4), lead(5), lead(6)]).toEqual(["cragpup", "sporeling", "sporeling", "frillet"]);
  });

  it("the tie clause says so when the second number is out of reach in the time left", () => {
    // 101 minutes left, hunger 90: 4 meals at most. Carrot: 3 more tie it (in reach), 5 more would give Dugling (not).
    const { c } = kid({ servings: { meat: 4, carrot: 1 } }, { ageMinutes: 1340, hunger: 90 });
    const carrot = forecast(c, NOON).rivals.find((r) => r.label === "Carrot")!;
    expect(carrot.enough).toBe(true);
    expect(carrot.text).toBe("Carrot: 3 Carrot servings more would make Sporeling the leader, and Dugling would take 5 more, more than the time left allows.");
  });

  it("a young one sees the tier above and the tier below", () => {
    const f = forecast(young({ hungerCells: 3, happyCells: 4 }).c, NOON);
    expect(f.tier).toBe(2);
    expect(f.rivals.map((r) => r.text)).toEqual([
      "Tier 1 (Gravelhorn): 2 more hunger cells and 1 more happy cell, with no mistakes.",
      "Tier 3 (Scrapjaw): after 2 more care mistakes.",
    ]);
    const out = forecast(young({ hungerCells: 5, happyCells: 5, careMistakes: 1 }).c, NOON);
    expect(out.rivals[0]!.text).toBe("Tier 1 (Gravelhorn): out of reach in this stage, it has made 1 mistake.");
    expect(out.rivals[0]!.enough).toBe(false);
    // 5 hunger cells and 5 happy cells needed with 2 minutes left: not in the time
    const late = forecast(young({}, { ageMinutes: 2879 }).c, NOON);
    expect(late.rivals[0]!.enough).toBe(false);
    expect(late.rivals[0]!.text).toBe("Tier 1 (Gravelhorn): 5 more hunger cells and 5 more happy cells, with no mistakes. That is more than the time left allows.");
    // hunger cells all done, 5 happy cells to go, 2 minutes left: at most one happy cell a step (and one now), so it cannot be done
    const happy = forecast(young({ hungerCells: 5 }, { ageMinutes: 2879 }).c, NOON).rivals[0]!;
    expect([happy.enough, happy.text]).toEqual([false, "Tier 1 (Gravelhorn): 0 more hunger cells and 5 more happy cells, with no mistakes. That is more than the time left allows."]);
    // and with a day left it is in the time
    expect(forecast(young({}, { ageMinutes: 100 }).c, NOON).rivals[0]!.enough).toBe(true);
    expect(forecast(young({ careMistakes: 6 }).c, NOON).rivals.map((r) => r.label)).toEqual(["Tier 3"]); // tier 4 has no worse tier
    expect(forecast(young({ hungerCells: 5, happyCells: 5 }).c, NOON).rivals.map((r) => r.label)).toEqual(["Tier 2"]); // tier 1 has no better tier
  });
});

describe("what-if", () => {
  it("never changes the creature or the save: frozen all the way down, so a write would throw", () => {
    for (const make1 of [
      () => baby({ fieldMinutes: { land: 20 } }, { ageMinutes: 90 }),
      () => kid({ servings: { meat: 3 } }, { ageMinutes: 90 }),
      () => young({ hungerCells: 2 }, { ageMinutes: 90 }),
    ]) {
      const { save, c } = make1();
      const before = JSON.stringify(save);
      deepFreeze(save);
      const tapSets: Array<Record<string, number>> = [{}, { "field:water": 5, "food:carrot": 4, hunger: 3, happy: 2, mistakes: 3 }, { "field:land": 99, "food:worm": 99 }];
      for (const taps of tapSets) {
        whatIf(c, NOON, taps);
        forecast(c, NOON);
      }
      expect(JSON.stringify(save)).toBe(before);
    }
  });

  it("adding nothing gives the forecast's own result", () => {
    const { c } = young({ hungerCells: 3 }, { ageMinutes: 60 });
    const f = forecast(c, NOON);
    expect(whatIf(c, NOON, {})).toEqual({ leader: f.leader, tier: f.tier, growsNow: false, ambiguous: false });
  });

  it("a baby: tapping a field's cells to 4 grows it up right away, and two fields at 4 are not decided", () => {
    const { c } = baby({ fieldMinutes: { land: 30 } }, { pattern: "swirled" });
    expect(whatIf(c, NOON, { "field:water": 2 })).toMatchObject({ leader: "cinderling", growsNow: false }); // Water 2 cells level with Land: the swirled egg's field, Sky, wins the tie
    expect(whatIf(c, NOON, { "field:water": 3 })).toMatchObject({ leader: "drizzle", growsNow: false });
    expect(whatIf(c, NOON, { "field:water": 4 })).toMatchObject({ leader: "drizzle", growsNow: true, ambiguous: false });
    expect(whatIf(c, NOON, { "field:water": 4, "field:sky": 4 })).toMatchObject({ growsNow: true, ambiguous: true });
  });

  it("a kid: servings tap by tap, through the tie", () => {
    const { c } = kid({ servings: { meat: 4 } });
    const leaders = [0, 1, 2, 3, 4, 5].map((n) => whatIf(c, NOON, { "food:carrot": n }).leader);
    expect(leaders).toEqual(["cragpup", "cragpup", "cragpup", "cragpup", "sporeling", "sporeling"]);
    // (4 servings give 2 cells: level with meat. 6 would give 3: ahead.)
    expect(whatIf(c, NOON, { "food:carrot": 6 }).leader).toBe("dugling");
  });

  it("a young one: filling the cells gives tier 1, a slip lowers it", () => {
    const { c } = young({ hungerCells: 3, happyCells: 4 });
    expect(whatIf(c, NOON, { hunger: 2, happy: 1 })).toMatchObject({ leader: "gravelhorn", tier: 1 });
    expect(whatIf(c, NOON, { hunger: 2, happy: 1, mistakes: 1 })).toMatchObject({ leader: "cindermane", tier: 2 });
    expect(whatIf(c, NOON, { mistakes: 2 })).toMatchObject({ leader: "scrapjaw", tier: 3 });
  });

  it("taps past a row's limit count only up to the limit; a negative tap counts for nothing", () => {
    // Meat 60 servings (30 cells). Carrot's row stops at 20 servings (10 cells), so 99 taps cannot pass it.
    const big = kid({ servings: { meat: 60 } }).c;
    expect(whatIf(big, NOON, { "food:carrot": 99 }).leader).toBe("cragpup");
    expect(whatIf(big, NOON, { "food:carrot": 20 }).leader).toBe("cragpup");
    // tier 1 stays tier 1 with -1 hunger cell (a negative tap is not a loss)
    const best = young({ hungerCells: 5, happyCells: 5 }).c;
    expect(whatIf(best, NOON, { hunger: -1 })).toMatchObject({ tier: 1 });
  });

  it("stays inside the rules: cells stop at 5, taps cannot go negative or past a row's limit, an unknown id counts for nothing", () => {
    const { c } = young({ hungerCells: 4, happyCells: 5 });
    expect(whatIf(c, NOON, { hunger: 99, happy: 99 })).toMatchObject({ tier: 1 });
    expect(whatIf(c, NOON, { hunger: -4, happy: -1 })).toEqual(whatIf(c, NOON, {}));
    expect(whatIf(c, NOON, { nonsense: 5, hunger: Number.NaN })).toEqual(whatIf(c, NOON, {}));
    expect(whatIf(c, NOON, { mistakes: 99 })).toMatchObject({ tier: 4 });
    const f = forecast(c, NOON);
    expect(f.rows.map((r) => r.maxTaps)).toEqual([1, 0, 6]);
  });
});

describe("locked", () => {
  const locked = (build: () => { c: Creature }): boolean => forecast(build().c, NOON).confidence?.kind === "locked";

  it("the least a meal adds comes from the data: every field food adds at least 5", () => {
    expect(100 - tuning.fullAtHunger).toBe(5);
    for (const id of ["land", "water", "sky"] as const) for (const food of planOf(id).foods) expect(foods[food].hunger).toBeGreaterThanOrEqual(5);
  });

  it("the most meals possible is never below what the real feed allows, and the attack really eats", () => {
    let mostEaten = 0;
    for (const hunger of [0, 30, 60, 80, 94, 94.99, 100]) {
      for (const minutes of [0, 1, 20, 60, 180]) {
        const { save, c } = kid({}, { hunger });
        const bound = mostMeals(c, minutes);
        // The attack: the smallest field food (the most meals), as many as it will take, every minute.
        let meals = 0;
        const end = NOON + minutes * MINUTE;
        for (let t = NOON; t <= end; t += MINUTE) {
          if (t > NOON) simulateTo(save, t);
          while (feed(save, "carrot", t) === "ate") meals++;
        }
        expect(meals, `hunger ${hunger}, ${minutes} minutes`).toBeLessThanOrEqual(bound);
        if (hunger === 0 && minutes === 0) expect(meals).toBe(5); // 0 to 20, 40, 60, 80, then 100: the real feed was used
        mostEaten = Math.max(mostEaten, meals);
      }
    }
    expect(mostEaten).toBeGreaterThan(5);
  });

  it("the most mistakes possible counts the call already running", () => {
    const { c } = young({});
    expect(mostMistakes(c, 59)).toBe(0);
    expect(mostMistakes(c, 60)).toBe(1);
    c.call = "hungry";
    c.callMinutes = 59;
    expect(mostMistakes(c, 0)).toBe(0);
    expect(mostMistakes(c, 1)).toBe(1);
    expect(mostMistakes(c, 61)).toBe(2);
  });

  it("is said for a baby that is far enough ahead for the time left, and not before", () => {
    // Land 3 cells, nothing else. A rival can get floor((T) / 15) cells, T being the minutes left rounded up, plus one.
    expect(locked(() => baby({ fieldMinutes: { land: 45 } }, { ageMinutes: 360 - 43 }))).toBe(true); // T = 44: 2 cells at most
    expect(locked(() => baby({ fieldMinutes: { land: 45 } }, { ageMinutes: 360 - 44 }))).toBe(false); // T = 45: 3 cells, level
    expect(locked(() => baby({ fieldMinutes: { land: 45 } }, { ageMinutes: 100 }))).toBe(false);
    expect(locked(() => baby({}, { ageMinutes: 359.9 }))).toBe(true); // no field can get a cell in what is left: the egg's field decides
    expect(locked(() => baby({}, { ageMinutes: 340 }))).toBe(false);
  });

  it("a kid is not locked by the same neglect rule, and not with a level top", () => {
    expect(locked(() => kid({ servings: { meat: 4 }, neglectMinutes: 100 }, { ageMinutes: 1340 }))).toBe(true);
    expect(locked(() => kid({ servings: { meat: 4 }, neglectMinutes: 140 }, { ageMinutes: 1340 }))).toBe(false); // 140 + 101 steps reaches 240
    // meat and carrot level at 1 cell, 60 minutes left: one meat serving would make 2 cells
    expect(locked(() => kid({ servings: { meat: 3, carrot: 2 } }, { ageMinutes: 1380 }))).toBe(false);
  });

  it("exactly one minute left, and half a minute: the bounds count a step more, so a creature one meal short is not locked", () => {
    expect(forecast(young({ careMistakes: 6 }, { ageMinutes: 2879 }).c, NOON).timer!.leftMinutes).toBe(1);
    expect(forecast(young({ careMistakes: 6 }, { ageMinutes: 2879 }).c, NOON).confidence!.kind).toBe("locked");
    // hunger 40 and 1 minute left: room for 12 meals, so 4 servings of meat are not safe
    expect(locked(() => kid({ servings: { meat: 4 } }, { ageMinutes: 1439, hunger: 40 }))).toBe(false);
    // the same creature with the stage ending in half a minute: still not locked
    expect(locked(() => kid({ servings: { meat: 4 } }, { ageMinutes: 1439.5, hunger: 40 }))).toBe(false);
  });

  it("counts from how far the creature has been simulated, not from the clock: minutes not run yet can still happen", () => {
    const { c } = baby({ fieldMinutes: { land: 45 } }, { ageMinutes: 317 });
    expect(forecast(c, NOON).confidence!.kind).toBe("locked");
    expect(forecast(c, NOON, NOON - 30 * MINUTE).confidence!.kind).toBe("open"); // 30 minutes of the creature's life are still to be simulated
    expect(forecast(c, NOON, NOON + 30 * MINUTE).confidence!.kind).toBe("locked"); // a simulation ahead of the clock changes nothing
  });

  it("is not said while 4 awake hours without care can still turn it into the special", () => {
    const old = { fieldMinutes: { land: 45 } };
    expect(locked(() => baby({ ...old, neglectMinutes: 100 }, { ageMinutes: 317 }))).toBe(true);
    expect(locked(() => baby({ ...old, neglectMinutes: 195 }, { ageMinutes: 317 }))).toBe(true); // 195 + 44 minutes is below 240
    expect(locked(() => baby({ ...old, neglectMinutes: 196 }, { ageMinutes: 317 }))).toBe(false); // 196 + 44 reaches it
  });

  it("is said for a kid only when no rival can catch up with the meals the hunger allows", () => {
    expect(locked(() => kid({ servings: { meat: 4 } }, { ageMinutes: 1340, hunger: 100 }))).toBe(true);
    expect(locked(() => kid({ servings: { meat: 4 } }, { ageMinutes: 1340, hunger: 40 }))).toBe(false); // room for 14 meals
    expect(locked(() => kid({ servings: { meat: 3, carrot: 2 } }, { ageMinutes: 1340 }))).toBe(false); // a tie can be broken by one serving
    expect(locked(() => kid({ servings: { meat: 4 } }, { ageMinutes: 100 }))).toBe(false);
  });

  it("is said for a young one only when the best and the worst tier it can still reach are the same", () => {
    expect(locked(() => young({ careMistakes: 6 }, { ageMinutes: 100 }))).toBe(true); // tier 4 never changes
    expect(locked(() => young({ careMistakes: 3 }, { ageMinutes: 100 }))).toBe(false); // could still reach 6
    expect(locked(() => young({ careMistakes: 3 }, { ageMinutes: 2880 - 10 }))).toBe(true); // 11 minutes: no more mistake fits
    expect(locked(() => young({ hungerCells: 5, happyCells: 5 }, { ageMinutes: 2880 - 20 }))).toBe(true); // tier 1, no time for a mistake
    expect(locked(() => young({ hungerCells: 5, happyCells: 5 }, { ageMinutes: 2880 - 100 }))).toBe(false);
    expect(locked(() => young({ hungerCells: 3 }, { ageMinutes: 2880 - 20 }))).toBe(false); // cells could still make tier 1
  });

  // ---- the attack: whenever the forecast says Locked, the real game must end as the forecast says, whatever the player does ----

  // The attacker acts at once (before the first minute runs) and after every minute, until 3 minutes past the checkpoint (the stage ends at
  // the first whole step after it).
  const finish = (save: Save, c: Creature, move: (save: Save, t: number) => void): string => {
    const hours = stageHours(c)!;
    move(save, save.lastSimulatedAt);
    return play(save, c.stageStartedAt + hours * HOUR + 3 * MINUTE, move);
  };

  it("a baby cannot be beaten: not by sitting in any other field, not by staying", () => {
    for (const place of ["land", "water", "sky"] as const) {
      const { save, c } = baby({ fieldMinutes: { land: 45 } }, { ageMinutes: 317 });
      const f = forecast(c, NOON);
      expect(f.confidence!.kind).toBe("locked");
      expect(finish(save, c, (s, t) => void goTo(s, place, t))).toBe(f.leader);
    }
  });

  it("a partial minute counts as a whole step: 44.5 minutes left is not locked, and an attack that uses all 45 steps beats it", () => {
    // Land 3 cells and a swirled egg (a tie goes to Sky). 44.5 minutes left is 45 steps of care: Water gets 3 cells, level with Land, and Sky wins.
    const { save, c } = baby({ fieldMinutes: { land: 45 } }, { ageMinutes: 360 - 44.5, pattern: "swirled" });
    expect(forecast(c, NOON).confidence!.kind).toBe("open");
    expect(finish(save, c, (s, t) => void goTo(s, "water", t))).toBe("cinderling");
  });

  it("the same baby with more time left CAN be beaten (so the attack is a real attack): and the forecast did not say Locked", () => {
    const { save, c } = baby({ fieldMinutes: { land: 45 } }, { ageMinutes: 200 });
    expect(forecast(c, NOON).confidence!.kind).toBe("open");
    expect(finish(save, c, (s, t) => void goTo(s, "water", t))).toBe("drizzle");
  });

  it("a baby that could still be neglected into the special is not locked, and the attack proves it can happen", () => {
    const { save, c } = baby({ fieldMinutes: { land: 45 }, neglectMinutes: 215 }, { ageMinutes: 317 });
    expect(forecast(c, NOON).confidence!.kind).toBe("open");
    expect(finish(save, c, idle)).toBe(specialId);
    const calm = baby({ fieldMinutes: { land: 45 }, neglectMinutes: 100 }, { ageMinutes: 317 });
    expect(forecast(calm.c, NOON).confidence!.kind).toBe("locked");
    expect(finish(calm.save, calm.c, idle)).toBe("pebblin");
  });

  it("a kid cannot be beaten by feeding a rival food at every chance, and can be when the forecast says open", () => {
    for (const food of ["carrot", "worm"] as const) {
      const { save, c } = kid({ servings: { meat: 4 } }, { ageMinutes: 1340, hunger: 100 });
      const f = forecast(c, NOON);
      expect(f.confidence!.kind).toBe("locked");
      expect(finish(save, c, (s, t) => eat(s, food, t))).toBe(f.leader);
    }
    const open = kid({ servings: { meat: 4 } }, { ageMinutes: 1340, hunger: 40 });
    expect(forecast(open.c, NOON).confidence!.kind).toBe("open");
    expect(finish(open.save, open.c, (s, t) => eat(open.save, "carrot", t))).toBe("sporeling"); // 5 servings: level with meat
  });

  it("a young one cannot be beaten by ignoring every call, and can be when a call is nearly a mistake", () => {
    const calm = young({ hungerCells: 5, happyCells: 5 }, { ageMinutes: 2880 - 30, hunger: 20 });
    expect(forecast(calm.c, NOON).confidence!.kind).toBe("locked");
    expect(finish(calm.save, calm.c, idle)).toBe("gravelhorn");
    const risky = young({ hungerCells: 5, happyCells: 5 }, { ageMinutes: 2880 - 30, hunger: 20 });
    risky.c.call = "hungry";
    risky.c.callMinutes = 50;
    expect(forecast(risky.c, NOON).confidence!.kind).toBe("open");
    expect(finish(risky.save, risky.c, idle)).toBe("cindermane");
  });

  it("a random sweep: every Locked claim survives every attack, and each stage has some", () => {
    const rng = makeRng(20261122);
    const found = { baby: 0, kid: 0, young: 0 };
    const attacks: Record<string, Array<(save: Save, t: number) => void>> = {
      baby: [idle, ...(["land", "water", "sky"] as const).map((p) => (s: Save, t: number) => void goTo(s, p, t))],
      kid: [idle, ...(["pellet", "carrot", "worm", "meat"] as const).map((food: FoodId) => (s: Save, t: number) => eat(s, food, t))],
      young: [idle, (s: Save, t: number) => { eat(s, "pellet", t); for (let i = 0; i < 5; i++) touch(s, "pet", t); }],
    };
    for (let i = 0; i < 240; i++) {
      const stage = (["baby", "kid", "young"] as const)[i % 3]!;
      const left = rng.chance(0.7) ? rng.int(1, 70) : rng.int(1, 300);
      const hunger = rng.int(0, 100);
      let made: ReturnType<typeof make>;
      if (stage === "baby") {
        const minutes: Partial<Record<FieldId, number>> = {};
        for (const id of ["land", "water", "sky"] as const) if (rng.chance(0.6)) minutes[id] = rng.int(0, 59);
        made = baby({ fieldMinutes: minutes, neglectMinutes: rng.int(0, 239) }, { ageMinutes: 360 - left, hunger, pattern: (["speckled", "striped", "swirled"] as const)[rng.int(0, 2)] });
      } else if (stage === "kid") {
        const servings: Partial<Record<FoodId, number>> = {};
        for (const food of ["meat", "carrot", "worm"] as const) if (rng.chance(0.7)) servings[food] = rng.int(0, 12);
        made = kid({ servings, neglectMinutes: rng.int(0, 239) }, { ageMinutes: 1440 - left, hunger });
      } else {
        made = young({ hungerCells: rng.int(0, 5), happyCells: rng.int(0, 5), careMistakes: rng.chance(0.5) ? 0 : rng.int(0, 7) }, { ageMinutes: 2880 - left, hunger });
        if (rng.chance(0.4)) {
          made.c.call = "hungry";
          made.c.callMinutes = rng.int(0, 59);
          made.c.stats.hunger = 10;
        }
      }
      const f = forecast(made.c, NOON);
      if (f.confidence?.kind !== "locked") continue;
      found[stage]++;
      for (const [k, move] of attacks[stage]!.entries()) {
        const copy: Save = structuredClone(made.save);
        const result = finish(copy, copy.creature!, move);
        expect(result, `${stage} #${i}, attack ${k}: forecast ${f.leader}`).toBe(f.leader);
      }
    }
    expect(found.baby).toBeGreaterThanOrEqual(5);
    expect(found.kid).toBeGreaterThanOrEqual(5);
    expect(found.young).toBeGreaterThanOrEqual(5);
  });
});

describe("the care log", () => {
  // An adult that is hungry from the start and never fed, over daytime hours (awake the whole time, nothing else going wrong). An adult:
  // a baby or a kid left alone for 4 awake hours becomes the special, and that starts its counters again.
  function starving(hours: number): Save {
    const save = aliveSave("gravelhorn", at(8));
    const c = save.creature!;
    c.stats.hunger = 0;
    c.stats.hygiene = 100;
    simulateTo(save, at(8 + hours));
    return save;
  }

  it("writes when and which call, in the same step as the count, spaced by the patience time", () => {
    const save = starving(4);
    const c = save.creature!;
    expect(c.counters.careMistakes).toBe(3);
    const log = c.counters.mistakeLog!;
    expect(log.map((e) => e.call)).toEqual(["hungry", "hungry", "hungry"]);
    expect(log[1]!.at - log[0]!.at).toBe(tuning.calls.patienceMinutes * MINUTE);
    expect(log[2]!.at - log[1]!.at).toBe(tuning.calls.patienceMinutes * MINUTE);
    expect(log[0]!.at).toBe(at(8) + (tuning.calls.patienceMinutes + 1) * MINUTE); // the call starts in the first minute, then 60 more
  });

  it("two mistakes in one catch-up each get their own time", () => {
    const save = starving(0);
    simulateTo(save, at(8, 130)); // one catch-up of 130 minutes
    const log = save.creature!.counters.mistakeLog!;
    expect(log.length).toBe(2);
    expect(log[0]!.at).not.toBe(log[1]!.at);
  });

  it("keeps the last few: the count goes on, the list stops at its limit, newest last", () => {
    const save = starving(11);
    const c = save.creature!;
    expect(c.counters.careMistakes).toBeGreaterThan(tuning.calls.mistakeLogMax);
    const log = c.counters.mistakeLog!;
    expect(log.length).toBe(tuning.calls.mistakeLogMax);
    expect(log[log.length - 1]!.at).toBeGreaterThan(log[0]!.at);
    // the call starts in the first minute, then every 60 minutes one mistake: the newest is the last of them, however many there were
    const lastAt = at(8) + (tuning.calls.patienceMinutes + 1 + tuning.calls.patienceMinutes * (c.counters.careMistakes - 1)) * MINUTE;
    expect(log[log.length - 1]!.at).toBe(lastAt);
    const f = forecast(c, at(19));
    expect(f.log.lines.length).toBe(tuning.calls.mistakeLogMax);
    expect(f.log.lines[0]!.at).toBe(log[log.length - 1]!.at); // newest first on screen
    expect(f.log.unlisted).toBe(c.counters.careMistakes - tuning.calls.mistakeLogMax);
    expect(f.log.lines[0]!.text).toMatch(/^today \d{1,2}:\d\d (am|pm) · Hungry, not answered for 60 awake minutes$/);
  });

  it("starts again with the next stage", () => {
    const save = starving(4);
    expect(save.creature!.counters.mistakeLog!.length).toBe(3);
    evolveTo(save, planOf("land").kid, at(12));
    expect(save.creature!.counters.mistakeLog).toBeUndefined();
    expect(save.creature!.counters.careMistakes).toBe(0);
    expect(forecast(save.creature!, at(12)).log).toEqual({ lines: [], unlisted: 0 });
  });

  it("an older save without the log loads, and a count the dev panel set shows as 'not listed'", () => {
    const { save } = young({ careMistakes: 3 });
    const loaded = migrateSave(JSON.parse(JSON.stringify(save)))!;
    expect(loaded.creature!.counters.mistakeLog).toBeUndefined();
    expect(forecast(loaded.creature!, NOON).log).toEqual({ lines: [], unlisted: 3 });
  });

  it("a full log adds only a few hundred characters to the save", () => {
    const without = JSON.stringify(aliveSave("blip", at(8))).length;
    const full = aliveSave("blip", at(8));
    full.creature!.counters.mistakeLog = Array.from({ length: tuning.calls.mistakeLogMax }, (_, i) => ({ at: at(8) + i * HOUR, call: "hungry" as CallKind }));
    expect(JSON.stringify(full).length - without).toBeLessThan(600);
  });
});

describe("what the panel says in words", () => {
  it("the confidence line, in each of its three states, for each stage", () => {
    expect(forecast(baby({}, { ageMinutes: 100 }).c, NOON).confidence).toEqual({
      kind: "open",
      text: "Still open. Up to 4:20 left, and a field with 4 cells ends it sooner.",
    });
    expect(forecast(kid({}, { ageMinutes: 100 }).c, NOON).confidence!.text).toBe("Still open. 22:20 left, and every meal can still count.");
    expect(forecast(young({}, { ageMinutes: 100 }).c, NOON).confidence!.text).toBe("Still open. 46:20 left, and cells and mistakes can still change the tier.");
    expect(forecast(young({ careMistakes: 6 }, { ageMinutes: 2820 }).c, NOON).confidence).toEqual({
      kind: "locked",
      text: "Locked. Nothing it can still do in the 1:00 left changes this.",
    });
  });

  it("What changes this? comes from the tuning numbers", () => {
    expect(forecast(baby({}).c, NOON).rule).toEqual([
      "The first field to reach 4 cells gives the kid. 15 awake minutes in a field make one cell.",
      "After 6 hours the field with the most cells gives it. A tie, or no cells, goes to the field of its egg pattern.",
      "With no care for 4 awake hours it becomes Dustpuff instead (a meal, clean-up, medicine, pet or tickle counts as care).",
    ]);
    expect(forecast(young({}).c, NOON).rule[1]).toBe("Tier 1 needs 5 hunger cells, 5 happy cells and no mistakes. Tier 2 allows up to 1, tier 3 up to 5, tier 4 more.");
    expect(eggField.speckled).toBe("land"); // the rule's "egg pattern" mapping the tie text relies on
    expect(fieldCells(baby({ fieldMinutes: { land: 59 } }).c, "land")).toBe(3);
  });
});
