// Checks on the content files, so a typo in a creature, an egg or the growth tree is caught right away.
import { describe, expect, it } from "vitest";
import { eggField, eggPatterns, hatchTable } from "../src/data/eggs";
import { fieldIds, fieldOfForm, fields, openFieldIds, planOf } from "../src/data/fields";
import { forms } from "../src/data/forms";
import { STATS, roleParts, stageBudget } from "../src/data/forms/stats";
import { foodIds, foods } from "../src/data/foods";
import { stageOrder } from "../src/game/types";
import type { Role, Stage } from "../src/game/types";
import { withLockedField } from "./helpers";

// How big each stage's picture is: the baby is small and each later stage grows (docs/paradise-plan.md section 1).
const SIZE_OF_STAGE: Record<Stage, number> = { baby: 20, kid: 24, young: 36, adult: 48 };
// Letters the game stamps faces with. A drawing is body only, so it must not use these (K and T may be body colors, like an outline).
const FACE_ONLY = "IWAPUM";

describe("creature forms", () => {
  for (const form of Object.values(forms)) {
    describe(form.id, () => {
      it("is the size of its stage, square, and even so the creature has a whole pixel middle", () => {
        const size = SIZE_OF_STAGE[form.stage];
        expect(size % 2).toBe(0);
        for (const [name, rows] of [["first", form.idle], ["second", form.idle2]] as const) {
          expect(rows.length, name).toBe(size);
          for (const row of rows) expect(row.length, name).toBe(size);
        }
      });

      it("only uses palette letters, and no letter that is kept for faces", () => {
        for (const rows of [form.idle, form.idle2]) {
          for (const ch of rows.join("")) {
            if (ch === ".") continue;
            expect(form.palette[ch], `letter ${ch}`).toBeDefined();
            expect(FACE_ONLY.includes(ch), `face letter ${ch} in a body`).toBe(false);
          }
        }
      });

      it("has a second drawing that differs from the first (otherwise it would not move)", () => {
        expect(form.idle2).not.toEqual(form.idle);
      });

      it("has a face anchor that leaves room for both eyes, and a mouth row inside the picture", () => {
        const size = SIZE_OF_STAGE[form.stage];
        expect(form.face.x).toBeGreaterThanOrEqual(0);
        expect(form.face.y).toBeGreaterThanOrEqual(0);
        expect(form.face.x * 2 + 5, "the eyes (at most 5 wide) do not overlap").toBeLessThanOrEqual(size);
        if (form.face.mouth !== null) {
          expect(form.face.mouth).toBeGreaterThan(form.face.y);
          expect(form.face.mouth).toBeLessThan(size);
        }
      });

      it("has valid colors, and a role with stats that add up to the budget of its stage", () => {
        for (const color of Object.values(form.palette)) expect(color).toMatch(/^#[0-9a-f]{6}$/i);
        expect(Object.keys(roleParts)).toContain(form.role as Role);
        const total = STATS.reduce((sum, stat) => sum + form.baseStats[stat], 0);
        expect(total).toBe(stageBudget[form.stage]);
        for (const stat of STATS) expect(form.baseStats[stat], stat).toBeGreaterThanOrEqual(1);
      });
    });
  }

  it("is keyed by its own id", () => {
    for (const [key, form] of Object.entries(forms)) expect(form.id).toBe(key);
  });

  it("has one baby, and every other form belongs to a field", () => {
    const babies = Object.values(forms).filter((f) => f.stage === "baby");
    expect(babies.map((f) => f.id)).toEqual(["blip"]);
    for (const form of Object.values(forms)) {
      if (form.stage !== "baby") expect(fieldOfForm(form.id), form.id).not.toBeNull();
      else expect(fieldOfForm(form.id), form.id).toBeNull();
    }
  });
});

describe("stat budgets", () => {
  it("every stage has the budget worked out from the old forms (docs/paradise-plan.md section 2)", () => {
    // Averages of the old forms at the stage each one became: baby 19.5, training 28.7, rookie 43.8, champion and ultimate 92.6.
    expect(stageBudget).toEqual({ baby: 20, kid: 29, young: 44, adult: 93 });
  });

  it("every role splits a hundred parts, and the stage budgets grow with the stage", () => {
    for (const [role, parts] of Object.entries(roleParts)) {
      expect(STATS.reduce((sum, stat) => sum + parts[stat], 0), role).toBe(100);
    }
    const budgets = stageOrder.map((stage) => stageBudget[stage]);
    expect([...budgets].sort((a, b) => a - b)).toEqual(budgets);
  });
});

describe("the growth tree", () => {
  it("has three fields, and all of them have a plan", () => {
    expect(fieldIds).toEqual(["land", "water", "sky"]);
    expect(openFieldIds).toEqual(["land", "water", "sky"]);
  });

  it("refuses the plan of a locked field, and has it back afterwards", () => {
    withLockedField("sky", () => expect(() => planOf("sky")).toThrow());
    expect(() => planOf("sky")).not.toThrow();
  });

  for (const id of openFieldIds) {
    describe(`the ${id} field`, () => {
      const plan = planOf(id);

      it("starts with a kid and ends in adults, every one of which exists at the right stage", () => {
        expect(forms[plan.kid]?.stage).toBe("kid");
        const young = [...Object.values(plan.young), plan.youngOther];
        for (const yid of young) expect(forms[yid as string]?.stage, String(yid)).toBe("young");
        expect(new Set(young).size, "four different young").toBe(4);
        expect(Object.keys(plan.adults).sort()).toEqual([...young].sort());
        for (const tiers of Object.values(plan.adults)) {
          expect(tiers).toHaveLength(4);
          for (const aid of tiers) expect(forms[aid]?.stage, aid).toBe("adult");
        }
      });

      it("gives every adult to exactly one young, and every form of the field is reachable", () => {
        const all = Object.values(plan.adults).flat();
        expect(new Set(all).size).toBe(all.length);
        const inField = Object.values(forms).filter((f) => f.stage !== "baby" && fieldOfForm(f.id) === id).map((f) => f.id);
        expect(inField.sort()).toEqual([plan.kid, ...Object.values(plan.young), plan.youngOther, ...all].sort());
        expect(inField).toHaveLength(1 + 4 + 16);
      });

      it("has three foods of its own that exist, each leading to its own young", () => {
        expect(plan.foods).toHaveLength(3);
        expect(new Set(plan.foods).size).toBe(3);
        for (const food of plan.foods) {
          expect(foods[food], food).toBeDefined();
          expect(plan.young[food], food).toBeDefined();
          expect(plan.young[food]).not.toBe(plan.youngOther);
        }
        expect(Object.keys(plan.young).sort()).toEqual([...plan.foods].sort());
      });
    });
  }

  it("keeps the fields' own foods apart from each other, from pellets and from the treat", () => {
    const own = openFieldIds.flatMap((id) => planOf(id).foods);
    expect(new Set(own).size).toBe(own.length);
    expect(own).not.toContain("pellet");
    expect(own).not.toContain("treat");
    for (const id of foodIds) expect(id === "pellet" || id === "treat" || own.includes(id), `${id} belongs to a field`).toBe(true);
  });

  it("names every field", () => {
    for (const id of fieldIds) expect(fields[id].name.length).toBeGreaterThan(0);
  });
});

describe("eggs and foods", () => {
  it("every egg pattern hatches into a baby that exists, and names a field", () => {
    for (const pattern of eggPatterns) {
      expect(hatchTable[pattern].length).toBeGreaterThan(0);
      for (const id of hatchTable[pattern]) expect(forms[id]?.stage).toBe("baby");
      expect(fieldIds).toContain(eggField[pattern]);
    }
    expect(new Set(eggPatterns.map((p) => eggField[p])).size, "each pattern names a different field").toBe(3);
  });

  it("every food has sensible numbers", () => {
    for (const food of Object.values(foods)) {
      expect(food.digestMinutes[0]).toBeLessThanOrEqual(food.digestMinutes[1]);
      expect(food.hunger).toBeGreaterThan(0);
    }
  });
});
