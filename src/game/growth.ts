// Growing up, the Paradise way (docs/paradise-plan.md section 2). The tree itself is data (data/fields.ts); this file counts
// the cells and picks the form a creature grows into. It replaces the old evolution rules.
//
//   baby   the first field to collect 4 cells (15 awake minutes in a field is 1 cell) gives the kid. After 6 hours a baby
//          grows up anyway, into the kid of the field with the most cells.
//   kid    after 24 hours the food eaten most (2 servings make 1 cell, whole cells compared) gives the young.
//   (special) a baby or a kid with no care for 4 awake hours becomes the special creature instead, at once, and it stays that.
//   young  after 48 hours the care gives the adult: tier 1 for 5 hunger cells, 5 happy cells and no mistakes, else by mistakes.
//   adult  stays.

import { eggField } from "../data/eggs";
import { fieldOfForm, openFieldIds, planOf } from "../data/fields";
import { getForm } from "../data/forms";
import { specialId } from "../data/special";
import { tuning } from "../data/tuning";
import type { Creature } from "./state";
import { MINUTE } from "./time";
import type { FieldId, FoodId } from "./types";

const g = tuning.growth;

export type Tier = 1 | 2 | 3 | 4;

export const fieldCells = (c: Creature, field: FieldId): number => Math.floor((c.counters.fieldMinutes[field] ?? 0) / g.fieldCellMinutes);
export const foodCells = (c: Creature, food: FoodId): number => Math.floor((c.counters.servings[food] ?? 0) / g.servingsPerFoodCell);

// Tier 1 is the grandest adult, tier 4 the scruffiest.
export function tierOf(c: Creature): Tier {
  const mistakes = c.counters.careMistakes;
  if (mistakes === 0 && c.counters.hungerCells >= g.careCellsMax && c.counters.happyCells >= g.careCellsMax) return 1;
  if (mistakes <= g.tier2MaxMistakes) return 2;
  if (mistakes <= g.tier3MaxMistakes) return 3;
  return 4;
}

// The tier of a form that is one of the tiers of an adult in the tree, or null.
export function adultTier(formId: string): Tier | null {
  for (const id of openFieldIds) {
    for (const tiers of Object.values(planOf(id).adults)) {
      const at = tiers.indexOf(formId);
      if (at >= 0) return (at + 1) as Tier;
    }
  }
  return null;
}

// The foods this creature is offered: pellets and the treat for everyone, and the three foods of its own field once it has one
// (a baby has none yet).
export function menuOf(c: Creature): FoodId[] {
  const field = fieldOfForm(c.formId);
  return ["pellet", ...(field ? planOf(field).foods : []), "treat"];
}

// ---- counting (the callers are the simulation and the actions) ----

// One awake minute of a baby in a field. Away on a job, asleep, at home and every other stage count nothing.
export function countFieldMinute(c: Creature): void {
  if (c.place === "home" || c.sleep !== null || c.job) return;
  if (getForm(c.formId).stage !== "baby") return;
  c.counters.fieldMinutes[c.place] = (c.counters.fieldMinutes[c.place] ?? 0) + 1;
}

// ---- neglect (the special) ----

// Only a baby or a kid can turn into the special, and the special itself is a kid-sized form that must not turn into itself again.
export const canBecomeSpecial = (c: Creature): boolean => c.formId !== specialId && ["baby", "kid"].includes(getForm(c.formId).stage);

// One awake minute without care. Asleep and away on a job count nothing: sleeping hours do not run the clock, and a creature on a job is out of reach.
// (A clean-up or medicine still counts as care while it sleeps: those buttons work then.)
export function countNeglectMinute(c: Creature): void {
  if (c.sleep !== null || c.job || !canBecomeSpecial(c)) return;
  c.counters.neglectMinutes = (c.counters.neglectMinutes ?? 0) + 1;
}

// Call when the player looked after the creature: a meal eaten, a clean-up, medicine, a pet or a tickle. It starts the count again.
export function noteCare(c: Creature): void {
  c.counters.neglectMinutes = 0;
}

function pickSpecial(c: Creature): string | null {
  return canBecomeSpecial(c) && (c.counters.neglectMinutes ?? 0) >= g.neglectHours * 60 ? specialId : null;
}

// A meal eaten. Only the kid stage counts them. `servings` is how many it counts: 1 for a plain meal, more for a shop dish (game/dishes.ts); anything
// under 1 (or not a number) counts nothing, so a bad value can never take a serving away.
export function countServing(c: Creature, food: FoodId, servings = 1): void {
  if (getForm(c.formId).stage !== "kid" || !(servings >= 1)) return;
  c.counters.servings[food] = (c.counters.servings[food] ?? 0) + servings;
}

// Call after anything that fills hunger or happiness, with the values from before. A hunger cell is a feeding that took
// hunger from below the full line to the line or above. A happy cell is happiness reaching 100 from below. Young stage only.
// `grace` (the Feeding Mat, game/perks.ts) lets a meal count when it ends that far under the line; the meal must still have raised hunger, so a pet
// at hunger 92 (which calls this with hunger unchanged) counts nothing.
export function countCareCells(c: Creature, hungerBefore: number, happinessBefore: number, grace = 0): void {
  if (getForm(c.formId).stage !== "young") return;
  if (hungerBefore < tuning.fullAtHunger && c.stats.hunger > hungerBefore && c.stats.hunger + grace >= tuning.fullAtHunger) {
    c.counters.hungerCells = Math.min(g.careCellsMax, c.counters.hungerCells + 1);
  }
  if (happinessBefore < 100 && c.stats.happiness >= 100) {
    c.counters.happyCells = Math.min(g.careCellsMax, c.counters.happyCells + 1);
  }
}

// ---- choosing ----

// The field with the most cells, if one is ahead; otherwise (none yet, which is a tie of all, or a tie at the top) the field of its
// egg pattern. Only open fields count: a field with no plan can never be the kid's, and a tie whose egg pattern points at a
// locked field goes to the first open one. (All three fields are open now, so the egg pattern always decides a tie.)
function netField(c: Creature): FieldId {
  const cells = openFieldIds.map((id) => ({ id, cells: fieldCells(c, id) }));
  const best = Math.max(...cells.map((f) => f.cells));
  const top = cells.filter((f) => f.cells === best);
  if (top.length === 1) return top[0]!.id;
  const egg = eggField[c.eggPattern];
  return openFieldIds.includes(egg) ? egg : openFieldIds[0]!;
}

function pickKid(c: Creature, timeUp: boolean): string | null {
  const reached = openFieldIds.filter((id) => fieldCells(c, id) >= g.fieldCellsToKid).sort((a, b) => fieldCells(c, b) - fieldCells(c, a));
  if (reached[0]) return planOf(reached[0]).kid;
  return timeUp ? planOf(netField(c)).kid : null;
}

// The food eaten most, in whole cells. A tie at the top gives the fourth young, and so does no field food at all (a three way tie).
function pickYoung(c: Creature): string | null {
  const field = fieldOfForm(c.formId);
  if (!field) return null;
  const plan = planOf(field);
  const cells = plan.foods.map((food) => ({ food, cells: foodCells(c, food) }));
  const best = Math.max(...cells.map((f) => f.cells));
  const top = cells.filter((f) => f.cells === best);
  if (top.length > 1) return plan.youngOther;
  return plan.young[top[0]!.food] ?? plan.youngOther;
}

function pickAdult(c: Creature): string | null {
  const field = fieldOfForm(c.formId);
  return field ? (planOf(field).adults[c.formId]?.[tierOf(c) - 1] ?? null) : null;
}

// The form that would win if the time were up right now (for the dev tree viewer), or null for an adult.
export function leadingForm(c: Creature): string | null {
  switch (getForm(c.formId).stage) {
    case "baby":
      return pickSpecial(c) ?? pickKid(c, true);
    case "kid":
      return pickSpecial(c) ?? pickYoung(c);
    case "young":
      return pickAdult(c);
    default:
      return null;
  }
}

// How long the creature stays in a stage at most, in hours (null: for ever).
export function stageHours(c: Creature): number | null {
  if (c.formId === specialId) return null; // a kid by size, but it grows no further
  switch (getForm(c.formId).stage) {
    case "baby":
      return g.babyHours;
    case "kid":
      return g.kidHours;
    case "young":
      return g.youngHours;
    default:
      return null;
  }
}

// The form it grows into now, or null if it is too early or it is an adult.
export function nextForm(c: Creature, nowMs: number): string | null {
  const hours = (nowMs - c.stageStartedAt) / MINUTE / 60;
  switch (getForm(c.formId).stage) {
    case "baby":
      return pickSpecial(c) ?? pickKid(c, hours >= g.babyHours);
    case "kid":
      return pickSpecial(c) ?? (hours >= g.kidHours ? pickYoung(c) : null);
    case "young":
      return hours >= g.youngHours ? pickAdult(c) : null;
    default:
      return null;
  }
}
