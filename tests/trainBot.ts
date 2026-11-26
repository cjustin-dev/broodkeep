// The stand-in player for Bug Catch (docs/adult-a3-plan.md section 10, decision 8): a model of an average adult's first-day play, used to write the band lines (tools/verify/train-bands.ts)
// and to check that Gold stays about a quarter of runs (tests/training.test.ts). It is a model, not a person. It uses the engine only through `step`, `catchBug` and `missTap`, with its
// own generator, so the engine's own sequence is untouched.
//
// What it does: a bug is seen `reactionMs` after it appears (a draw from the range); one thumb taps at most once every `thumbGapMs`; it taps the golden bug first, otherwise the oldest;
// the spot it taps is where the bug was `aimLagMs` ago plus a miss of up to `aimNoise` units in any direction; the tap catches the bug when that spot is within `hitRadius` units of
// the bug (a button 153 units wide, half of it), otherwise it is a miss and the bug is tried again after the thumb gap.

import { trainTuning } from "../src/data/training";
import type { TrainStage } from "../src/data/training";
import { catchBug, missTap, newBugCatch, step } from "../src/game/training";
import type { Bug, BugCatchState } from "../src/game/training";
import { makeRng } from "../src/game/rng";

export interface Model {
  reactionMs: [number, number];
  aimLagMs: number;
  aimNoise: number;
  hitRadius: number;
  thumbGapMs: number;
}

// First tried with a reaction of 330 to 570 ms, a lag of 150, a miss of 70 units and a thumb gap of 250 ms: it caught 98 to 100 percent of every stage's bugs, which no first-day player does.
// These numbers give about 95, 87 and 54 percent for the kid, young and adult rows (tools/verify/train-bands.ts, 2000 runs a stage from seed 1).
export const standIn: Model = { reactionMs: [450, 850], aimLagMs: 200, aimNoise: 115, hitRadius: 76, thumbGapMs: 480 };

// Play one whole run of `stage` from `seed` and return the finished state.
export function playRun(seed: number, stage: TrainStage, model: Model = standIn): BugCatchState {
  const s = newBugCatch(seed, stage);
  const rng = makeRng((seed ^ 0x9e3779b9) >>> 0);
  const readyAt = new Map<number, number>(); // bug id -> the time the player can first tap it
  let nextTap = 0;
  while (!s.over) {
    step(s, trainTuning.stepMs);
    for (const b of s.bugs) if (!readyAt.has(b.id)) readyAt.set(b.id, s.elapsedMs + rng.int(model.reactionMs[0], model.reactionMs[1]));
    if (s.over || s.elapsedMs < nextTap) continue;
    const ready = s.bugs.filter((b) => (readyAt.get(b.id) ?? Infinity) <= s.elapsedMs);
    if (ready.length === 0) continue;
    const target: Bug = ready.find((b) => b.golden) ?? (ready[0] as Bug);
    // the spot aimed at: where the bug was a moment ago, off by a miss in any direction (a point drawn evenly from a disc)
    const angle = rng.next() * 2 * Math.PI;
    const radius = model.aimNoise * Math.sqrt(rng.next());
    const dx = -target.vx * model.aimLagMs + Math.cos(angle) * radius;
    const dy = -target.vy * model.aimLagMs + Math.sin(angle) * radius;
    if (Math.hypot(dx, dy) <= model.hitRadius) catchBug(s, target.id);
    else {
      missTap(s);
      readyAt.set(target.id, s.elapsedMs + model.thumbGapMs); // tried again after the thumb gap
    }
    nextTap = s.elapsedMs + model.thumbGapMs;
  }
  return s;
}

// The scores of `count` runs from seeds `from` upward.
export const scoresOf = (stage: TrainStage, from: number, count: number, model: Model = standIn): number[] =>
  Array.from({ length: count }, (_, i) => playRun(from + i, stage, model).score);
