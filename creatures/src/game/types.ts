// Shared shapes for game content (creature forms, foods, eggs, fields).
// The data files in src/data/ are written in these shapes.

// Pellets and the treat are for every creature. Each field adds three foods of its own (Land has meat, carrot and worm).
export type FoodId = "pellet" | "treat" | "meat" | "carrot" | "worm";

export type EggPattern = "speckled" | "striped" | "swirled";

// The three outdoor places (fields). A creature is either at home or in one of them.
export type FieldId = "land" | "water" | "sky";
export type Place = "home" | FieldId;

// Life stages, from youngest to oldest. The egg is not a stage: it is a phase of the save.
export type Stage = "baby" | "kid" | "young" | "adult";

// The five combat stats of a form (see Form.baseStats).
export type CombatStat = "vit" | "str" | "def" | "spi" | "spd";

// The stages in order, so one can be compared with another by position.
export const stageOrder: Stage[] = ["baby", "kid", "young", "adult"];

// How a form spends its stat budget: the stage sets the total, the role sets the split (see data/forms/stats.ts).
export type Role = "fighter" | "tank" | "caster" | "quick";

// A face is not drawn into the picture. The engine stamps it from the pattern file (data/face-patterns.json) at this anchor:
// the left eye's top left pixel and the top row of the mouth (null: no mouth to stamp).
export interface MouthPattern {
  x?: number; // left column; centered when missing. Either way the mouth must be centered on the picture
  dy: number; // rows below (or above, if negative) the anchor's mouth row
  rows: string[];
}
export interface Face {
  x: number;
  y: number;
  mouth: number | null;
  mouths?: Record<string, MouthPattern>; // replaces a pattern of the stage's style, by name (neutral, flat, smile, frown, yawn)
}

// What a data file writes for a form. The game adds the stats and the soft look (see data/forms/index.ts).
export interface FormSource {
  id: string;
  stage: Stage;
  name: string;
  role: Role;
  // Pixel art: each letter in a row picks a color from the palette. "." is see-through. The drawing has no face (see Face).
  palette: Record<string, string>;
  idle: string[]; // standing picture, a square grid: 20 (baby), 24 (kid), 36 (young) or 48 (adult) pixels (see art/layout.ts)
  idle2: string[]; // second drawing of the same size and with the same face, swapped in while it stands, walks or hops
  face: Face;
}

export interface Form extends FormSource {
  softLook: null; // scary forms get a soft look in Phase 5
  baseStats: Record<CombatStat, number>; // worked out from the stage and role (see data/forms/stats.ts)
}

export interface Food {
  id: FoodId;
  name: string;
  hunger: number; // how much it fills the creature
  happiness: number;
  wellness: number; // can be negative (the treat)
  digestMinutes: [number, number]; // poop appears this long after eating (min and max)
}
