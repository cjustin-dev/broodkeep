// Egg patterns, and which baby each pattern can hatch into.
// Every egg hatches into Blip: the baby has no field. The pattern still matters: it names the field a baby grows toward
// if it was never taken to one (speckled Land, striped Water, swirled Sky; see game/growth.ts).
import type { EggPattern, FieldId } from "../game/types";

export const eggPatterns: EggPattern[] = ["speckled", "striped", "swirled"];

export const hatchTable: Record<EggPattern, string[]> = {
  speckled: ["blip"],
  striped: ["blip"],
  swirled: ["blip"],
};

export const eggField: Record<EggPattern, FieldId> = {
  speckled: "land",
  striped: "water",
  swirled: "sky",
};
