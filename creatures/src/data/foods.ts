// Foods the creature can eat. Foods are unlimited for now. Crops and cooking come later.
// Pellets and the treat are for everyone. Each field has three foods of its own (growth.ts counts them toward the young).
import type { Food, FoodId } from "../game/types";

export const foods: Record<FoodId, Food> = {
  pellet: { id: "pellet", name: "Pellets", hunger: 20, happiness: 1, wellness: 2, digestMinutes: [60, 90] },
  // Big happiness, but bad for wellness, and too many in a row make the creature sick.
  treat: { id: "treat", name: "Treat", hunger: 8, happiness: 25, wellness: -8, digestMinutes: [40, 60] },
  // Land
  meat: { id: "meat", name: "Meat", hunger: 35, happiness: 3, wellness: 0, digestMinutes: [90, 130] },
  carrot: { id: "carrot", name: "Carrot", hunger: 20, happiness: 2, wellness: 3, digestMinutes: [60, 90] },
  worm: { id: "worm", name: "Worm", hunger: 25, happiness: 5, wellness: 0, digestMinutes: [70, 100] },
  // Water (the same numbers as the Land food in the same place: filling, light and green, small and cheerful)
  seafood: { id: "seafood", name: "Seafood", hunger: 35, happiness: 3, wellness: 0, digestMinutes: [90, 130] },
  seaweed: { id: "seaweed", name: "Seaweed", hunger: 20, happiness: 2, wellness: 3, digestMinutes: [60, 90] },
  shrimp: { id: "shrimp", name: "Shrimp", hunger: 25, happiness: 5, wellness: 0, digestMinutes: [70, 100] },
  // Sky (the same numbers again: a filling roast, light grain, a small sweet)
  chicken: { id: "chicken", name: "Chicken", hunger: 35, happiness: 3, wellness: 0, digestMinutes: [90, 130] },
  corn: { id: "corn", name: "Corn", hunger: 20, happiness: 2, wellness: 3, digestMinutes: [60, 90] },
  syrup: { id: "syrup", name: "Syrup", hunger: 25, happiness: 5, wellness: 0, digestMinutes: [70, 100] },
};

export const foodIds = Object.keys(foods) as FoodId[];
