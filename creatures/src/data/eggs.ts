// Egg patterns, and which baby each pattern can hatch into.
// One of the listed forms is picked at random. The swirled egg can be either.
import type { EggPattern } from "../game/types";

export const eggPatterns: EggPattern[] = ["speckled", "striped", "swirled"];

export const hatchTable: Record<EggPattern, string[]> = {
  speckled: ["blip"],
  striped: ["drip"],
  swirled: ["blip", "drip"],
};
