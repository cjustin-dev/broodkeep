// The habitat: the places a creature can be sent to work, and what it brings back.
// First-guess numbers, like everything in tuning.ts. Plan section 7.3: babies and in training forms do
// light jobs only, and the heavier spots open as the creature grows.

import type { Stage } from "../game/types";

export type MaterialId = "fiber" | "herb" | "wood" | "fish" | "stone";
export type SpotId = "meadow" | "herbs" | "trees" | "pond" | "rocks";

// Materials are only collected for now. Crafting (Phase 4) is what uses them up.
export const materials: Record<MaterialId, { name: string }> = {
  fiber: { name: "Fiber" },
  herb: { name: "Herbs" },
  wood: { name: "Wood" },
  fish: { name: "Fish" },
  stone: { name: "Stone" },
};
export const materialIds = Object.keys(materials) as MaterialId[];

export interface Spot {
  id: SpotId;
  name: string;
  material: MaterialId;
  minStage: Stage; // the youngest stage that may work here
  minutes: number; // real minutes the job takes
  energyCost: number; // taken from the creature's energy when it sets off
  coins: [number, number]; // a haul has this many coins (lowest, highest)
  amount: [number, number]; // and this many of the material
}

export const spots: Record<SpotId, Spot> = {
  meadow: { id: "meadow", name: "Bug meadow", material: "fiber", minStage: "baby", minutes: 3, energyCost: 5, coins: [1, 2], amount: [1, 2] },
  herbs: { id: "herbs", name: "Herb patch", material: "herb", minStage: "baby", minutes: 3, energyCost: 5, coins: [1, 2], amount: [1, 2] },
  trees: { id: "trees", name: "Trees", material: "wood", minStage: "rookie", minutes: 5, energyCost: 10, coins: [2, 3], amount: [1, 2] },
  pond: { id: "pond", name: "Pond", material: "fish", minStage: "rookie", minutes: 6, energyCost: 10, coins: [2, 4], amount: [1, 2] },
  rocks: { id: "rocks", name: "Rock pile", material: "stone", minStage: "champion", minutes: 8, energyCost: 15, coins: [3, 5], amount: [1, 3] },
};
export const spotIds = Object.keys(spots) as SpotId[];

export const habitatTuning = {
  // A creature only sets off if it would still have at least this much energy afterwards.
  energyFloor: 20,
  // Finished jobs the player has not looked at yet. Past this many, the oldest are forgotten
  // (the coins and materials are already in the bag; only the "welcome back" card is dropped).
  unseenHaulsMax: 5,
};
