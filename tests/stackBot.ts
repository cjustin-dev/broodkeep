// The stand-in players for Stack & Balance (docs/adult-a4-plan.md section 6, decision 5): a model of an average adult's first-day play, used to write the band lines (tools/verify/stack-bands.ts)
// and to check that a steady tapper and a player who drops once and waits stay under Silver. They are models, not people. They use the engine only through `stepStack` and `dropStack`, and draw from
// their own generator, so the engine stays free of random draws.
//
// The stand-in waits for the moving block's centre to cross the top block's centre, then drops with a normal timing error (its spread grows with the stage: an assumption, not a measurement), waits
// at least `pauseMs` between drops, and now and then (`misjudge`) drops at a random moment up to 800 ms after the crossing instead. A drop is made at the time the screen shows when it happens.

import { stackTuning } from "../src/data/stack";
import { trainTuning } from "../src/data/training";
import type { TrainStage } from "../src/data/training";
import { makeRng } from "../src/game/rng";
import { blockX, dropStack, newStack, scoreOf, stepStack } from "../src/game/stack";
import type { StackState } from "../src/game/stack";

export interface Player {
  sigmaMs: number; // the spread of a drop around the moment the block is over the one below
  misjudge: number; // the share of drops made at a random moment instead
  pauseMs: number; // the least time between one drop and the next
}

export const standIn: Record<TrainStage, Player> = {
  kid: { sigmaMs: 55, misjudge: 0.03, pauseMs: 500 },
  young: { sigmaMs: 65, misjudge: 0.03, pauseMs: 500 },
  adult: { sigmaMs: 75, misjudge: 0.03, pauseMs: 500 },
};

const STEP = trainTuning.stepMs;

// The first whole step at or after `from` where the moving block's centre has reached or passed `x` (null when the run ends first).
function crossing(stage: TrainStage, x: number, from: number, lengthMs: number): number | null {
  for (let t = from; t + STEP <= lengthMs; t += STEP) {
    const a = blockX({ elapsedMs: t, stage }) - x;
    const b = blockX({ elapsedMs: t + STEP, stage }) - x;
    if (a === 0) return t;
    if (a * b < 0) return t + STEP;
  }
  return null;
}

// One seeded run of the stand-in.
export function playRun(seed: number, stage: TrainStage, p: Player = standIn[stage]): StackState {
  const rng = makeRng(seed >>> 0);
  const normal = (): number => Math.sqrt(-2 * Math.log(1 - rng.next())) * Math.cos(2 * Math.PI * rng.next());
  const s = newStack(stage);
  const plan = (from: number): number | null => {
    const top = s.blocks[s.blocks.length - 1]!;
    const at = crossing(stage, top.x, from, s.lengthMs);
    if (at === null) return null;
    const late = rng.next() < p.misjudge ? Math.floor((rng.next() * 800) / STEP) * STEP : Math.round((p.sigmaMs * normal()) / STEP) * STEP;
    return Math.max(at + late, from);
  };
  let tapAt = plan(0);
  while (!s.over) {
    stepStack(s, STEP);
    if (s.over) break;
    while (tapAt !== null && tapAt <= s.elapsedMs && !s.over) {
      dropStack(s);
      tapAt = plan(s.elapsedMs + p.pauseMs);
    }
  }
  return s;
}

// A run where the player drops at each of `drops` (milliseconds from the start, any order): a drop falls in the step whose end it has not passed.
export function playDrops(stage: TrainStage, drops: number[]): StackState {
  const s = newStack(stage);
  const todo = [...drops].sort((a, b) => a - b);
  let i = 0;
  while (!s.over) {
    stepStack(s, STEP);
    while (i < todo.length && (todo[i] as number) < s.elapsedMs + STEP) {
      if (!s.over) dropStack(s);
      i += 1;
    }
  }
  return s;
}

// A steady tapper: a drop every `intervalMs` from `phaseMs`, whatever the block is doing.
export function mash(stage: TrainStage, intervalMs: number, phaseMs: number): StackState {
  const drops: number[] = [];
  for (let x = phaseMs; x < trainTuning.sessionMs; x += intervalMs) drops.push(x);
  return playDrops(stage, drops);
}

// The first whole step at which a drop is Perfect for a full-width block on the base (the moving block is within `perfectU` of the base's centre), or null.
export function firstPerfectStep(stage: TrainStage): number | null {
  const u = stackTuning.rows[stage].perfectU;
  for (let t = 0; t < trainTuning.sessionMs; t += STEP) if (Math.abs(blockX({ elapsedMs: t, stage }) - stackTuning.baseX) <= u) return t;
  return null;
}

// The best score of a player who drops once, at the best moment, and then waits.
export function waitingScore(stage: TrainStage): number {
  const at = firstPerfectStep(stage) as number;
  return scoreOf(playDrops(stage, [at]));
}
