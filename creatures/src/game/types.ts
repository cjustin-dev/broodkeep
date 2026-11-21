// Shared shapes for game content (creature forms, foods, eggs).
// The data files in src/data/ are written in these shapes.

export type FoodId = "berry" | "meat" | "fish" | "candy";

export type EggPattern = "speckled" | "striped" | "swirled";

// Life stages, from youngest to oldest.
export type Stage = "baby" | "training" | "rookie" | "champion" | "ultimate";

// The numbers an evolution rule can look at (see src/game/metrics.ts for what each one means).
export type Metric =
  | "careMistakes"
  | "happinessAvg"
  | "neglectHours"
  | "discipline"
  | "food"
  | "berries"
  | "meat"
  | "fish"
  | "candy"
  | "training"
  | "battles"
  | "wins"
  | "chores"
  | "strength"
  | "defense"
  | "spirit";

// Conditions a creature must meet to take an evolution path. Every field is optional, and a
// missing field means "no requirement". For each metric there is a Min and a Max key, so
// { strengthMin: 40, careMistakesMax: 3 } means strength at least 40 and at most 3 care mistakes.
export type Need = { [K in Metric as `${K}Min`]?: number } & { [K in Metric as `${K}Max`]?: number };

// One arrow in the evolution tree.
export interface Evolution {
  to: string; // id of the next form
  minHours: number; // real hours spent in the current stage before this path opens
  need?: Need; // no "need" means this is the fallback path
}

export interface Form {
  id: string;
  stage: Stage;
  name: string;
  // Pixel art: each letter in a row picks a color from the palette. "." is see-through.
  palette: Record<string, string>;
  idle: string[]; // standing picture, a square grid: 16 (baby, in training), 22, 28 or 32 pixels (see art/layout.ts)
  idle2?: string[]; // second drawing of the same size, swapped in while it stands, walks or hops. The two babies have none
  softLook: null; // scary forms get a soft look in Phase 5
  baseStats: { vit: number; str: number; def: number; spi: number; spd: number };
  evolvesTo: Evolution[];
}

export interface Food {
  id: FoodId;
  name: string;
  hunger: number; // how much it fills the creature
  happiness: number;
  wellness: number; // can be negative (candy)
  digestMinutes: [number, number]; // poop appears this long after eating (min and max)
}
