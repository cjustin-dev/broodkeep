// Bug Catch and the training session: every number (docs/adult-a3-plan.md section 10). All are starting values, tuned like the rest of tuning.ts.
// The band lines are not guessed: tools/verify/train-bands.ts prints the score percentiles of the stand-in player's seeded runs, and the lines below are written from them.

import type { CombatStat, Stage } from "../game/types";

// The stages that can train (a baby is too small, like a fight).
export type TrainStage = Exclude<Stage, "baby">;
export type Band = "bronze" | "silver" | "gold";

// One row of the field for a stage. Speeds are in field units a second (the field is `trainTuning.field` units a side).
export interface BugRow {
  speed: number;
  gapMs: number; // between one spawn and the next
  most: number; // bugs on the field at once
  lifeMs: number; // how long a bug stays before it is gone
  goldenChance: number; // of a spawn
  silverAt: number; // the score where Silver starts
  goldAt: number; // the score where Gold starts
}

// The training games (docs/adult-a4-plan.md section 2, decision 2): the name on the card, the stat it trains and that stat's word. The day's count is kept per stat.
export type TrainGameId = "bug" | "rhythm" | "stack";

export const trainGames: Record<TrainGameId, { name: string; stat: CombatStat; statName: string }> = {
  bug: { name: "Bug Catch", stat: "spd", statName: "Speed" },
  rhythm: { name: "Rhythm Grove", stat: "spi", statName: "Spirit" },
  stack: { name: "Stack & Balance", stat: "str", statName: "Strength" },
};

export const trainGameIds = Object.keys(trainGames) as TrainGameId[];

export const trainTuning = {
  sessionMs: 75_000, // the spec says 60 to 90 seconds
  stepMs: 10, // the engine moves in whole steps of this, whatever the frame rate
  frameCapMs: 100, // the most one call to `step` counts, so a stalled page cannot jump the bugs
  field: 1000, // the field is a square of this many units a side
  edge: 60, // a bug is placed and bounces at least this far inside the edge
  firstSpawnMs: 400,
  legMs: [600, 1200] as [number, number], // a bug flies straight for this long, then takes a new heading
  goldenSpeed: 1.5, // times the row's speed
  catchPoints: 10,
  goldenPoints: 30,
  streakFrom: 5, // the catch (counting since the last miss, this one included) from which a catch scores double
  streakFactor: 2,

  // Rewards (spec 4): the first `full` sessions a stat has today pay in full, the next `half` in half (rounded down), then Bond XP only.
  full: 3,
  half: 3,
  // The count kept per stat stops here, which is full + half: "this many or more".
  countMax: 6,
  points: { bronze: 1, silver: 1, gold: 2 } as Record<Band, number>, // Speed points for a full-reward session
  bondXp: { bronze: 10, silver: 20, gold: 30 } as Record<Band, number>,
  discipline: { bronze: 1, silver: 1, gold: 2 } as Record<Band, number>,
  disciplineMax: 100,

  rows: {
    kid: { speed: 160, gapMs: 1400, most: 3, lifeMs: 5000, goldenChance: 0.12, silverAt: 650, goldAt: 690 },
    young: { speed: 220, gapMs: 1100, most: 4, lifeMs: 4200, goldenChance: 0.14, silverAt: 790, goldAt: 840 },
    adult: { speed: 280, gapMs: 700, most: 5, lifeMs: 3600, goldenChance: 0.15, silverAt: 850, goldAt: 910 },
  } as Record<TrainStage, BugRow>,
};
