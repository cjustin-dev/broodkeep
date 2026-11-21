// Egg patterns, and which baby each pattern can hatch into.
// One of the listed forms is picked at random. Phase 2 adds Drip to the striped egg.
import type { EggPattern } from "../game/types";

export const eggPatterns: EggPattern[] = ["speckled", "striped", "swirled"];

export const hatchTable: Record<EggPattern, string[]> = {
  speckled: ["blip"],
  striped: ["blip"],
  swirled: ["blip"],
};
