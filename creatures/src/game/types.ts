// Shared shapes for game content (creature forms, foods, eggs).
// The data files in src/data/ are written in these shapes.

export type FoodId = "berry" | "meat" | "fish" | "candy";

export type EggPattern = "speckled" | "striped" | "swirled";

// Life stages, from youngest to oldest. Phase 1 only uses the first three.
export type Stage = "baby" | "training" | "rookie" | "champion" | "ultimate";

// Conditions a creature must meet to take an evolution path.
// Every field is optional. A missing field means "no requirement".
// Later phases add more (strength, battles, jobs), so new fields go here.
export interface Need {
  careMistakesMax?: number;
  careMistakesMin?: number;
  happinessAvgMin?: number; // average happiness (0 to 100) while awake in this stage
}

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
  idle: string[];
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
