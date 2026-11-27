// Stack & Balance: every number (docs/adult-a4-plan.md section 6). All are starting values, tuned like the rest of tuning.ts.
// The band lines are not guessed: tools/verify/stack-bands.ts prints the score percentiles of the stand-in player's runs (tests/stackBot.ts), and the lines below are written from them.

import type { TrainStage } from "./training";

export interface StackRow {
  speed: number; // units a second the moving block's centre travels
  perfectU: number; // a drop this close (in units) to the centre of the block below is Perfect, for a full-width block
  silverAt: number; // the score where Silver starts
  goldAt: number;
}

export const stackTuning = {
  // The field is `trainTuning.field` (1000) units wide. The moving block's centre sweeps lo to hi; the base is startW wide with its centre at baseX.
  lo: 150,
  hi: 850,
  baseX: 500,
  startW: 300, // every width is even, so every edge is a whole unit
  blockH: 50, // the height of a block in the picture, in field units
  laneTop: 300, // the picture: the top block's upper edge is this far down the field, with the moving block above it
  wobblePct: 35, // a drop is Good when at least this percent of the coming block overlaps the one below (and at least minW units)
  minW: 20,
  growFrom: 2, // from this Perfect in a row, the coming block grows
  growBy: 30,
  dropGapMs: 400, // the next block comes this long after a drop: longer than a Perfect window is wide, so one crossing gives one Perfect
  perfectPts: 20,
  goodPts: 10,
  comboPts: 5, // a Perfect scores this much more for each Perfect before it in the combo ...
  comboMax: 5, // ... up to this many
  standPts: 5, // a second the stack stands (counted from the first block on the base)

  rows: {
    kid: { speed: 260, perfectU: 29, silverAt: 1000, goldAt: 1460 },
    young: { speed: 320, perfectU: 36, silverAt: 1000, goldAt: 1620 },
    adult: { speed: 360, perfectU: 40, silverAt: 800, goldAt: 1660 },
  } as Record<TrainStage, StackRow>,
};
