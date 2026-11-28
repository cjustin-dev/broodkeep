// Book recipes (game/recipes.ts, Spec 8 part 1, docs/adult-a4-plan.md section 14): a recipe for every creature of the Book, read off the growth rules. The main
// check is the property: doing exactly what a recipe says, through the real growth functions, grows the creature it names. The words are pinned as literals
// for a sample, and every string is scanned for words of loss and for creature names. The screen side (the card in the Book) is checked by tools/verify/recipes-browser.mjs.
import { describe, expect, it } from "vitest";
import { bookIds, bookPages, lineageOf } from "../src/data/book";
import { eggField } from "../src/data/eggs";
import { fieldOfForm, fieldIds, planOf } from "../src/data/fields";
import { foods } from "../src/data/foods";
import { forms } from "../src/data/forms";
import { specialId } from "../src/data/special";
import { tuning } from "../src/data/tuning";
import { adultTier, countNeglectMinute, nextForm } from "../src/game/growth";
import { perfectText } from "../src/game/perfect";
import { cardText, cellLabel, describeForm, nextText, nextToFind, recipeOf, recipeText } from "../src/game/recipes";
import { makeCreature } from "../src/game/sim";
import type { Creature } from "../src/game/state";
import { HOUR, MINUTE } from "../src/game/time";
import type { EggPattern, FoodId } from "../src/game/types";
import { at } from "./helpers";

const T = at(10);
const g = tuning.growth;

describe("a recipe for every creature of the Book", () => {
  it("is one step for each form of its family line, in order, and the last step makes the form", () => {
    expect(bookIds()).toHaveLength(65);
    for (const id of bookIds()) {
      const recipe = recipeOf(id);
      expect(recipe, id).not.toBeNull();
      expect(recipe!.steps.map((s) => s.formId), id).toEqual(lineageOf(id));
      expect(recipe!.steps[recipe!.steps.length - 1]!.formId).toBe(id);
      for (const step of recipe!.steps) expect(step.text.length, `${id} ${step.formId}`).toBeGreaterThan(10);
    }
  });

  it("gives the stage of each step, the first always the baby", () => {
    for (const id of bookIds()) {
      const stages = recipeOf(id)!.steps.map((s) => s.stage);
      expect(stages[0], id).toBe("baby");
      expect(stages, id).toEqual(id === specialId ? ["baby", "special"] : ["baby", "kid", "young", "adult"].slice(0, stages.length));
    }
    expect(recipeOf("blip")!.steps).toHaveLength(1);
    expect(recipeOf(planOf("land").kid)!.steps).toHaveLength(2);
    expect(recipeOf(planOf("land").youngOther)!.steps).toHaveLength(3);
    expect(recipeOf(planOf("land").adults[planOf("land").youngOther]![2]!)!.steps).toHaveLength(4);
  });

  it("is null for anything that is not a form of the Book (own keys only)", () => {
    for (const id of ["nobody", "constructor", "toString", "__proto__", "hasOwnProperty", ""]) expect(recipeOf(id), id).toBeNull();
  });

  it("carries the care note on every kid, young and adult, and on neither the baby nor the special", () => {
    for (const id of bookIds()) {
      const stage = recipeOf(id)!.steps.at(-1)!.stage;
      expect(recipeOf(id)!.note, id).toBe(stage === "baby" || stage === "special" ? null : recipeText.note);
    }
  });
});

describe("doing what a recipe says grows the creature it names (the property)", () => {
  const eggs: EggPattern[] = ["speckled", "striped", "swirled"];
  const fresh = (formId: string, pattern: EggPattern = "speckled"): Creature => {
    const c = makeCreature(formId, T, pattern);
    c.counters.neglectMinutes = 0;
    return c;
  };
  const after = (c: Creature, hours: number): number => c.stageStartedAt + hours * HOUR + MINUTE;

  it("the kid: 4 field cells (60 awake minutes) in its field, with care, whatever the egg", () => {
    for (const id of bookIds().filter((i) => forms[i]!.stage === "kid" && i !== specialId)) {
      for (const egg of eggs) {
        const c = fresh("blip", egg);
        c.counters.fieldMinutes = { [fieldOfForm(id)!]: g.fieldCellsToKid * g.fieldCellMinutes };
        expect(nextForm(c, c.stageStartedAt + MINUTE), `${id} / ${egg}`).toBe(id);
        c.counters.fieldMinutes = { [fieldOfForm(id)!]: g.fieldCellsToKid * g.fieldCellMinutes - 1 };
        expect(nextForm(c, c.stageStartedAt + MINUTE), `${id} / ${egg} one minute short`).toBeNull();
      }
    }
  });

  it("the kid, by the 6 hour limit: the field with the most cells, and a tie goes to the egg's field, even when the egg's field is not in the tie", () => {
    const late = (c: Creature): number => after(c, g.babyHours);
    const water = planOf("water").kid;
    const c = fresh("blip", "speckled");
    c.counters.fieldMinutes = { land: 30, water: 45 };
    expect(nextForm(c, late(c))).toBe(water);
    const level = fresh("blip", "swirled"); // Land and Water level, an egg whose field is Sky, which has no cell at all
    level.counters.fieldMinutes = { land: 30, water: 30 };
    expect(eggField.swirled).toBe("sky");
    expect(nextForm(level, late(level))).toBe(planOf("sky").kid);
    const inTie = fresh("blip", "striped");
    inTie.counters.fieldMinutes = { land: 30, water: 30 };
    expect(nextForm(inTie, late(inTie))).toBe(water);
  });

  it("the young: more cells of its food than of any other; 4 servings is 2 cells; a tie, or no field food, gives the fourth young", () => {
    for (const field of fieldIds) {
      const plan = planOf(field);
      for (const food of plan.foods) {
        const target = plan.young[food]!;
        const kid = fresh(plan.kid);
        kid.counters.servings = { [food]: g.servingsPerFoodCell };
        expect(nextForm(kid, after(kid, g.kidHours)), `${field} ${food}`).toBe(target);
        expect(nextForm(kid, kid.stageStartedAt + (g.kidHours * HOUR - 2 * MINUTE)), `${field} ${food} too early`).toBeNull();
        const others = plan.foods.filter((f) => f !== food);
        kid.counters.servings = { [food]: g.servingsPerFoodCell * 2, [others[0]!]: g.servingsPerFoodCell + 1 };
        expect(nextForm(kid, after(kid, g.kidHours)), `${field} ${food} two cells against one`).toBe(target);
      }
      const other = fresh(plan.kid);
      expect(nextForm(other, after(other, g.kidHours)), `${field} pellets only`).toBe(plan.youngOther);
      other.counters.servings = { pellet: 9, treat: 9 } as Partial<Record<FoodId, number>>;
      expect(nextForm(other, after(other, g.kidHours)), `${field} pellets and treats only`).toBe(plan.youngOther);
      // 3 servings against 2 is a tie of whole cells (1 each), the case "mostly" would get wrong
      other.counters.servings = { [plan.foods[0]]: g.servingsPerFoodCell + 1, [plan.foods[1]]: g.servingsPerFoodCell };
      expect(nextForm(other, after(other, g.kidHours)), `${field} 3 against 2`).toBe(plan.youngOther);
      other.counters.servings = { [plan.foods[0]]: 4, [plan.foods[1]]: 4, [plan.foods[2]]: 4 };
      expect(nextForm(other, after(other, g.kidHours)), `${field} a three way tie`).toBe(plan.youngOther);
    }
  });

  // [mistakes, hunger cells, happy cells] at each end of what a tier takes
  const tierCases: Record<number, Array<[number, number, number]>> = {
    1: [[0, 5, 5]],
    2: [[0, 4, 5], [0, 5, 4], [0, 0, 0], [1, 5, 5], [1, 0, 0]],
    3: [[2, 5, 5], [5, 0, 0]],
    4: [[6, 5, 5], [99, 0, 0]],
  };

  it("the adult: each tier at both ends of what its words say, after the 48 hours", () => {
    for (const field of fieldIds) {
      const plan = planOf(field);
      for (const [young, tiers] of Object.entries(plan.adults)) {
        for (const [i, adult] of tiers.entries()) {
          const tier = i + 1;
          expect(adultTier(adult), adult).toBe(tier);
          for (const [mistakes, hunger, happy] of tierCases[tier]!) {
            const c = fresh(young);
            Object.assign(c.counters, { careMistakes: mistakes, hungerCells: hunger, happyCells: happy });
            expect(nextForm(c, after(c, g.youngHours)), `${adult} at ${mistakes} / ${hunger} / ${happy}`).toBe(adult);
            expect(nextForm(c, c.stageStartedAt + (g.youngHours * HOUR - 2 * MINUTE)), `${adult} too early`).toBeNull();
          }
        }
      }
    }
  });

  it("the words' limits are the rules' limits: one step outside each case changes the tier", () => {
    const young = planOf("land").youngOther;
    const adults = planOf("land").adults[young]!;
    const tierAt = (m: number, h: number, p: number): string | null => {
      const c = fresh(young);
      Object.assign(c.counters, { careMistakes: m, hungerCells: h, happyCells: p });
      return nextForm(c, after(c, g.youngHours));
    };
    expect(tierAt(0, 5, 5)).toBe(adults[0]);
    expect(tierAt(1, 5, 5)).toBe(adults[1]);
    expect(tierAt(2, 5, 5)).toBe(adults[2]);
    expect(tierAt(5, 5, 5)).toBe(adults[2]);
    expect(tierAt(6, 5, 5)).toBe(adults[3]);
  });

  it("the special: 4 awake hours with no care, for a baby and for a kid, whatever else it did", () => {
    for (const from of ["blip", planOf("land").kid]) {
      const c = fresh(from);
      c.counters.neglectMinutes = g.neglectHours * 60;
      c.counters.fieldMinutes = { land: 60 };
      c.counters.servings = { meat: 8 };
      expect(nextForm(c, c.stageStartedAt + MINUTE), from).toBe(specialId);
      c.counters.neglectMinutes = g.neglectHours * 60 - 1;
      expect(nextForm(c, c.stageStartedAt + MINUTE), `${from} one minute short`).not.toBe(specialId);
    }
    expect(lineageOf(specialId)).toEqual(["blip", specialId]);
  });

  it("the note is true: a young and an adult never run the neglect clock, and the young grows into its adult, not the special", () => {
    const land = planOf("land");
    const young = fresh(land.youngOther);
    const adult = fresh(land.adults[land.youngOther]![0]!);
    for (const c of [young, adult]) {
      for (let i = 0; i < g.neglectHours * 60 + 1; i++) countNeglectMinute(c); // awake minutes at home with no care
      expect(c.counters.neglectMinutes, c.formId).toBe(0);
    }
    young.counters.neglectMinutes = 999; // even a count that was somehow there decides nothing
    const next = nextForm(young, after(young, g.youngHours));
    expect(next).not.toBeNull();
    expect(next).not.toBe(specialId);
    expect(forms[next!]!.stage).toBe("adult");
    expect(nextForm(adult, adult.stageStartedAt + 999 * HOUR)).toBeNull();
  });
});

describe("the words", () => {
  const land = planOf("land");
  const water = planOf("water");
  const stepOf = (formId: string, stage: string): string => recipeOf(formId)!.steps.find((s) => s.stage === stage)!.text;

  it("are these, for a sample (the numbers come from the tuning, pinned below)", () => {
    expect(recipeText.hatch).toBe("Hatch an egg.");
    expect(stepOf(water.kid, "kid")).toBe(
      "Baby: spend 60 awake minutes in the Water (4 cells of 15 minutes) before another field gets 4. If 6 hours pass first, the field with the most cells wins, and a tie goes to the field of the egg's pattern (speckled Land, striped Water, swirled Sky), even when that field is not in the tie.",
    );
    expect(stepOf(water.young[water.foods[0]]!, "young")).toBe(
      `Kid: feed it more ${foods[water.foods[0]].name} than any other food, counted in whole cells (2 servings make a cell). After 24 hours the food with the most whole cells wins.`,
    );
    expect(foods[water.foods[0]].name).toBe("Seafood");
    expect(stepOf(land.youngOther, "young")).toBe(
      "Kid: feed it pellets and treats only, or keep the top foods tied in whole cells (3 servings against 2 is a tie). After 24 hours, a tie at the top gives this one.",
    );
    const adults = land.adults[land.youngOther]!;
    expect(stepOf(adults[0]!, "adult")).toBe(
      "Young: after 48 hours, with 5 hunger cells (a feeding that fills it up), 5 happy cells (happiness reaching full) and no mistakes. Add no mistake in the baby and kid stages for a Perfect star.",
    );
    expect(stepOf(adults[1]!, "adult")).toBe("Young: after 48 hours, with 1 mistake, or no mistake but fewer than 5 hunger or happy cells.");
    expect(stepOf(adults[2]!, "adult")).toBe("Young: after 48 hours, with 2 to 5 mistakes.");
    expect(stepOf(adults[3]!, "adult")).toBe("Young: after 48 hours, with 6 or more mistakes.");
    expect(recipeText.special).toBe(
      "Leave a baby or a kid with no care for 4 awake hours. Sleep and time away on a job do not count. A meal it eats, a clean-up when there is something to clean, medicine while it is sick, or a pet or a tickle while it is awake counts as care.",
    );
    expect(recipeText.note).toBe(
      "Keep caring as you go: a baby or a kid with no care for 4 awake hours becomes the special form instead. A meal it eats, a clean-up when there is something to clean, medicine while it is sick, or a pet or a tickle while it is awake counts as care.",
    );
  });

  it("the tuning numbers the words read are these (so changing one must change the words with it)", () => {
    expect([g.fieldCellMinutes, g.fieldCellsToKid, g.babyHours, g.kidHours, g.youngHours]).toEqual([15, 4, 6, 24, 48]);
    expect([g.servingsPerFoodCell, g.careCellsMax, g.tier2MaxMistakes, g.tier3MaxMistakes, g.neglectHours]).toEqual([2, 5, 1, 5, 4]);
  });

  it("follow the tuning: the tier lines move with the mistake limits, and the others with their numbers", () => {
    const saved = { ...g };
    try {
      g.tier2MaxMistakes = 2;
      g.tier3MaxMistakes = 7;
      g.careCellsMax = 6;
      g.youngHours = 50;
      expect(recipeText.adult(2)).toBe("Young: after 50 hours, with 2 mistakes, or no mistake but fewer than 6 hunger or happy cells.");
      expect(recipeText.adult(3)).toBe("Young: after 50 hours, with 3 to 7 mistakes.");
      expect(recipeText.adult(4)).toBe("Young: after 50 hours, with 8 or more mistakes.");
      g.fieldCellMinutes = 20;
      g.servingsPerFoodCell = 3;
      g.kidHours = 20;
      expect(recipeText.kid("Water")).toContain("spend 80 awake minutes in the Water (4 cells of 20 minutes)");
      expect(recipeText.young("Seafood")).toContain("(3 servings make a cell). After 20 hours");
      expect(recipeText.youngOther()).toContain("(4 servings against 3 is a tie)");
    } finally {
      Object.assign(g, saved);
    }
    expect(recipeText.adult(3)).toBe("Young: after 48 hours, with 2 to 5 mistakes.");
  });

  it("name no creature: not one form's name is in any step, note or label, so an unraised creature stays hidden", () => {
    const names = Object.values(forms).map((f) => f.name.toLowerCase());
    const strings = [recipeText.hatch, recipeText.special, recipeText.note, recipeText.youngOther(), ...([1, 2, 3, 4] as const).map(recipeText.adult)];
    for (const id of bookIds()) {
      for (const step of recipeOf(id)!.steps) strings.push(step.text);
      strings.push(describeForm(id), cellLabel(false, forms[id]!.name, false));
    }
    for (const text of strings) {
      const lower = text.toLowerCase();
      for (const name of names) expect(new RegExp(`\\b${name}\\b`).test(lower), `"${name}" in "${text}"`).toBe(false);
    }
  });
});

describe("the line for the next creature to find", () => {
  const land = planOf("land");
  const young = land.youngOther;
  const set = (...ids: string[]): Set<string> => new Set(ids);
  const everyId = bookIds();

  it("is the baby for an empty Book (there is no parent to wait for)", () => {
    const next = nextToFind(set())!;
    expect(next.formId).toBe("blip");
    expect(next.label).toBe("the baby");
    expect(next.step).toBe("Hatch an egg.");
  });

  it("is the first kid in Book order once the baby is raised, and its own kid-step is the whole of what is left", () => {
    const next = nextToFind(set("blip"))!;
    expect(next.formId).toBe(land.kid);
    expect(next.label).toBe("a kid in the Land");
    expect(next.step).toBe(recipeOf(land.kid)!.steps[1]!.text);
  });

  it("goes on to the next one whose parent is raised, in Book order", () => {
    expect(nextToFind(set("blip", land.kid))!.formId).toBe(Object.values(land.young)[0]);
    expect(nextToFind(set("blip", land.kid))!.label).toBe("a young in the Land");
    const second = bookPages()[1]!.rows[1]!; // the Land page's four young, in order
    expect(nextToFind(set("blip", land.kid, ...second.slice(0, 2)))!.formId).toBe(second[2]);
  });

  it("is the first creature in Book order that is not raised, even when a later one was raised without its parent (the Land kid is next, not a young whose kid is missing)", () => {
    const next = nextToFind(set("blip", land.kid))!;
    expect(lineageOf(next.formId).at(-2)).toBe(land.kid);
    // a young raised without its kid: the kid comes first in Book order, so the kid is the next to find
    expect(nextToFind(set("blip", young))!.formId).toBe(land.kid);
  });

  it("names a tier 1 adult by its tier and field once the four young of the field are raised", () => {
    const fieldYoung = [...Object.values(land.young), land.youngOther] as string[];
    const next = nextToFind(set("blip", land.kid, ...fieldYoung))!;
    expect(lineageOf(next.formId)).toHaveLength(4);
    expect(adultTier(next.formId)).toBe(1);
    expect(next.label).toBe("a tier 1 adult in the Land");
    expect(next.step).toBe(recipeText.adult(1));
  });

  it("says the special form when it is the one", () => {
    const rest = everyId.filter((id) => id !== specialId);
    const next = nextToFind(new Set(rest))!;
    expect(next.formId).toBe(specialId);
    expect(next.label).toBe("the special form");
    expect(next.step).toBe(recipeText.special);
  });

  it("is null only when every creature is raised, and a bad id in the set changes nothing", () => {
    expect(nextToFind(new Set(everyId))).toBeNull();
    expect(nextToFind(new Set([...everyId, "nobody", "constructor"]))).toBeNull();
    for (const id of everyId) expect(nextToFind(new Set(everyId.filter((i) => i !== id)))!.formId, id).toBeTruthy();
    expect(nextToFind(set("nobody", "constructor"))!.formId).toBe("blip");
    expect(nextText.all).toBe("Every creature is raised.");
    expect(nextText.lead).toBe("Next to find: ");
  });
});

describe("the cell's words", () => {
  it("describeForm says where a creature sits, with no name", () => {
    expect(describeForm("blip")).toBe("the baby");
    expect(describeForm(specialId)).toBe("the special form");
    expect(describeForm(planOf("sky").kid)).toBe("a kid in the Sky");
    expect(describeForm(planOf("water").youngOther)).toBe("a young in the Water");
    expect(describeForm(planOf("land").adults[planOf("land").youngOther]![3]!)).toBe("a tier 4 adult in the Land");
  });

  it("a raised cell starts with the name and says if it has the star; an unraised one starts with the cell's own ??? and holds no name", () => {
    expect(cellLabel(true, "Blip", false)).toBe("Blip, raised");
    expect(cellLabel(true, "Blip", true)).toBe("Blip, raised, Perfect star");
    expect(cellLabel(false, "Blip", false)).toBe("???, not raised yet");
    expect(cellLabel(false, "Blip", true)).toBe("???, not raised yet");
    expect(cellLabel(true, "Blip", true).endsWith(perfectText.star)).toBe(true);
    expect(cardText).toEqual({ notRaised: "Not raised yet", raised: "Raised", done: "Done", close: "Close", hidden: "???" });
  });
});

describe("no word of loss or failure (the copy rule of Spec 8)", () => {
  const banned = /\b(sacrifice|release|lose|lost|loss|delete|die|death|forever|gone|fail|failed|failure|wrong|bad|poor|worse|ruined|miss|missed)\b/i;

  it("none of this slice's strings, for any of the 65 creatures, holds one", () => {
    const strings: string[] = [recipeText.hatch, recipeText.special, recipeText.note, recipeText.youngOther(), nextText.lead, nextText.all, ...Object.values(cardText)];
    for (const tier of [1, 2, 3, 4] as const) strings.push(recipeText.adult(tier));
    for (const id of bookIds()) {
      for (const step of recipeOf(id)!.steps) strings.push(step.text);
      strings.push(describeForm(id), cellLabel(true, forms[id]!.name, false), cellLabel(true, forms[id]!.name, true), cellLabel(false, forms[id]!.name, false));
      const next = nextToFind(new Set(bookIds().filter((i) => i !== id)));
      if (next) strings.push(next.label, next.step);
    }
    expect(strings.length).toBeGreaterThan(300);
    for (const text of strings) expect(banned.test(text), text).toBe(false);
  });
});
