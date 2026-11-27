// Field tappables (docs/adult-a3-plan.md section 17): things that turn up on the ground while the creature is out in a field, for the player to tap. Every number is a starting value, tuned
// like the rest of tuning.ts.

import type { FieldId } from "../game/types";
import type { MaterialId } from "./habitat";

export type TapKind = "sparkle" | "rustle" | "bug" | "pickup";

// The fixed order the draw walks and ties are broken in.
export const tapKinds: readonly TapKind[] = ["sparkle", "rustle", "bug", "pickup"];

export const tapTuning = {
  delayMs: [20_000, 40_000] as [number, number], // from the start of one spawn to the start of the next (the spec's 20 to 40 seconds), counted on unblocked field time
  clockCapMs: 2000, // the most one step adds to the field clock, so a page that was hidden cannot bank time
  most: 4, // tappables showing at once (the spec's "3 to 5"); a spawn that finds this many waits for room
  lifeMs: 90_000, // a tappable nobody taps is gone after this much unblocked field time, with no cost
  weights: { sparkle: 4, rustle: 3, bug: 3, pickup: 2 } as Record<TapKind, number>,
  sparkleMaterialChance: 1 / 2, // of a sparkle's pay; the rest is 1 coin
  rustleXp: 3, // Bond XP for a rustle that is a moment together
  rustleGiftChance: 1 / 2, // of a rustle; the rest is the Bond moment
  burstMs: 10_000, // a bug's Bug Catch burst (the spec's 10 seconds)
  burstXpMax: 6, // the most Bond XP a burst pays, one for each bug caught
  size: 8, // a tappable is an 8 x 8 picture
  pad: 8, // how far past the picture a touch still counts, in game pixels (24 pixels across: 48 CSS pixels at 2 CSS pixels a game pixel)
  band: { xMin: 12, xMax: 108, yMin: 96, yMax: 109 }, // where a tappable's top left corner can be: ground in all three field pictures (docs/adult-a3-plan.md decision 7)
  tries: 6, // placements tried for a spawn before it waits for the next step
  gap: 2, // the least space between two tappables' pictures, in game pixels
};

// The pickup that is each field's own: its name and the material it pays (the material of the real habitat spot that matches it: Trees, Pond, Rock pile).
export const pickups: Record<FieldId, { name: string; article: string; material: MaterialId }> = {
  land: { name: "acorn", article: "an", material: "wood" },
  water: { name: "shell", article: "a", material: "fish" },
  sky: { name: "crystal", article: "a", material: "stone" },
};
