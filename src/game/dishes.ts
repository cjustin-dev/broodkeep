// The shop's foods, "dishes" (adult track A2.2b, docs/adult-a2-plan.md section 10). A dish is an item the player owns that adds a button to the Feed
// tray. A dish meal is a meal of one of the creature's own field foods (the same hunger, happiness, wellness and digest numbers as that food) that
// counts differently toward the kid's food cells: a booster counts one whole cell, a recipe counts one serving of two foods. It is the player's choice
// each meal: a plain meal still counts 1, so owning a dish never makes anything worse. Only the kid stage counts servings, so only a kid is offered one.
// The care rules (actions.ts, availability.ts), the Growth Forecast (forecast.ts) and the tray (ui/ActionBar.tsx) all ask here.

import { fieldOfForm, planOf } from "../data/fields";
import { getForm } from "../data/forms";
import { foods } from "../data/foods";
import { itemIds, items } from "../data/shop";
import type { ItemId } from "../data/shop";
import { tuning } from "../data/tuning";
import type { Owned } from "./perks";
import type { Creature } from "./state";
import type { FieldId, FoodId } from "./types";

export type DishId = ItemId;

// Every item that is a food, in catalogue order.
export const dishIds: DishId[] = itemIds.filter((id) => items[id].dish !== undefined);

// The dishes this creature is offered: the ones the player owns, in catalogue order, while it is a kid with a field. (The special form is a kid with
// no field, so it has no field foods to count and gets none. An id in `owned` that is not a dish is never offered.)
export function dishesOf(c: Creature, owned: Owned): DishId[] {
  if (getForm(c.formId).stage !== "kid" || !fieldOfForm(c.formId)) return [];
  return dishIds.filter((id) => owned.includes(id));
}

// What eating a dish does: the field food it is a meal of, and how many servings of which foods it counts. Null for an id that is not a dish, or a
// creature with no field.
export interface DishMeal {
  eats: FoodId;
  counts: Array<[FoodId, number]>;
}

export function dishMeal(c: Creature, id: DishId): DishMeal | null {
  const dish = items[id]?.dish;
  const field = fieldOfForm(c.formId);
  if (!dish || !field) return null;
  const plan = planOf(field).foods;
  const eats = plan[dish.food];
  if (dish.also === undefined) return { eats, counts: [[eats, tuning.growth.servingsPerFoodCell]] };
  return {
    eats,
    counts: [
      [eats, 1],
      [plan[dish.also], 1],
    ],
  };
}

// The most servings of `food` one meal can add in this field: a booster owned for its kind counts a whole cell, every other meal (plain or recipe)
// at most 1. The Growth Forecast's bounds (what can still change the leader) use it, so a doubled meal never makes "Locked" untrue.
export function servingsPerMeal(owned: Owned, field: FieldId, food: FoodId): number {
  const kind = planOf(field).foods.indexOf(food);
  const boosted = dishIds.some((id) => {
    const dish = items[id].dish!;
    return dish.food === kind && dish.also === undefined && owned.includes(id);
  });
  return boosted ? tuning.growth.servingsPerFoodCell : 1;
}

// The words of a dish's tray button (its aria-label), worked out from what the meal counts so the label is what the tap does.
export function dishLabel(c: Creature, id: DishId): string {
  const meal = dishMeal(c, id);
  if (!meal) return items[id].name;
  const [[first, n], second] = meal.counts;
  if (second) return `${items[id].name}: ${foods[first].name} and ${foods[second[0]].name}, 1 serving of each`;
  return `${items[id].name}: ${foods[first].name}, counts ${n} servings`;
}
