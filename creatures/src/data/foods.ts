// Foods the creature can eat. Phase 1 has unlimited food. Crops and cooking come later.
import type { Food, FoodId } from "../game/types";

export const foods: Record<FoodId, Food> = {
  berry: { id: "berry", name: "Berry", hunger: 20, happiness: 2, wellness: 3, digestMinutes: [60, 90] },
  meat: { id: "meat", name: "Meat", hunger: 35, happiness: 3, wellness: 0, digestMinutes: [90, 130] },
  fish: { id: "fish", name: "Fish", hunger: 25, happiness: 5, wellness: 0, digestMinutes: [70, 100] },
  // Big happiness, but bad for wellness, and too many in a row make the creature sick.
  candy: { id: "candy", name: "Candy", hunger: 8, happiness: 25, wellness: -8, digestMinutes: [40, 60] },
};

export const foodIds = Object.keys(foods) as FoodId[];
