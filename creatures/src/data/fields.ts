// The growth tree (docs/paradise-plan.md sections 1 and 4). Which form follows which is written here and read by game/growth.ts.
//
//   baby (Blip)  --the first field to reach 4 cells-->  that field's kid
//   kid          --the food eaten most (whole cells)-->  one of 4 young   (a tie, or no field food, gives the fourth)
//   young        --care: cells and mistakes-->           one of 4 adults, tier 1 (best care) to tier 4
//
// A field with `plan: null` is locked: it shows in the picker but a creature cannot be taken there yet (Water and Sky wait
// for their slices). Each field adds three foods to the game (data/foods.ts).
import type { FieldId, FoodId } from "../game/types";

export interface FieldPlan {
  kid: string;
  foods: [FoodId, FoodId, FoodId]; // the field's own foods: the only ones that count toward its young
  young: Partial<Record<FoodId, string>>; // the young that follows each of those foods
  youngOther: string; // the fourth young: pellets only, the treat, a tie, or no field food at all
  adults: Record<string, [string, string, string, string]>; // by young id: tiers 1, 2, 3 and 4
}

export interface Field {
  id: FieldId;
  name: string;
  plan: FieldPlan | null;
}

export const fields: Record<FieldId, Field> = {
  land: {
    id: "land",
    name: "Land",
    plan: {
      kid: "pebblin",
      foods: ["meat", "carrot", "worm"],
      young: { meat: "cragpup", carrot: "dugling", worm: "frillet" },
      youngOther: "sporeling",
      adults: {
        cragpup: ["gravelhorn", "cindermane", "scrapjaw", "gutterfang"],
        dugling: ["moonlop", "barrowbun", "tuskmole", "mudlop"],
        frillet: ["sunfrill", "plateback", "bogviper", "slugwyrm"],
        sporeling: ["hollowbloom", "potterling", "needlecap", "mossheap"],
      },
    },
  },
  water: { id: "water", name: "Water", plan: null },
  sky: { id: "sky", name: "Sky", plan: null },
};

export const fieldIds = Object.keys(fields) as FieldId[];

// The fields a creature can be taken to, in the order above.
export const openFieldIds: FieldId[] = fieldIds.filter((id) => fields[id].plan !== null);

// The plan of an open field. (A locked field has none, so asking for it is a mistake.)
export function planOf(id: FieldId): FieldPlan {
  const plan = fields[id].plan;
  if (!plan) throw new Error(`The ${id} field is locked`);
  return plan;
}

// Which field a form belongs to (its kid, its young, or one of its adults), or null for the baby and unknown ids.
export function fieldOfForm(formId: string): FieldId | null {
  for (const id of openFieldIds) {
    const plan = planOf(id);
    const young = [...Object.values(plan.young), plan.youngOther];
    if (plan.kid === formId || young.includes(formId) || Object.values(plan.adults).some((tiers) => tiers.includes(formId))) return id;
  }
  return null;
}
