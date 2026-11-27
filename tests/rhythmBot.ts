// The stand-in players for Rhythm Grove (docs/adult-a4-plan.md section 2, decision 8): a model of an average adult's first-day play, used to write the band lines (tools/verify/rhythm-bands.ts)
// and to check that Gold stays about a quarter of runs, and a steady tapper ("a mash") that the stray cost must keep under Silver. They are models, not people. They use the engine only
// through `stepRhythm` and `tapRhythm`, and draw from their own generator, so the engine's songs are untouched.
//
// The stand-in taps each note of the song at the note's time plus a normal draw (its spread grows with the density of the stage's notes: a person is less steady when notes come quickly:
// an assumption, not a measurement), skips a few notes, and now and then taps with no note near. A tap is made at the time the screen shows when it happens (the step it falls in).

import { makeRng } from "../src/game/rng";
import { maxScore, newRhythm, stepRhythm, tapRhythm } from "../src/game/rhythm";
import type { RhythmState } from "../src/game/rhythm";
import type { TrainStage } from "../src/data/training";
import { trainTuning } from "../src/data/training";
import type { FieldId } from "../src/game/types";

export interface Player {
  sigmaMs: number; // the spread of a tap around the note's time
  skip: number; // the share of notes not tapped at all
  strayTaps: number; // how many times in a run it taps with no note near (each with a chance of one in two)
}

export const standIn: Record<TrainStage, Player> = {
  kid: { sigmaMs: 55, skip: 0.03, strayTaps: 2 },
  young: { sigmaMs: 65, skip: 0.03, strayTaps: 2 },
  adult: { sigmaMs: 75, skip: 0.03, strayTaps: 2 },
};

// Run a fresh song with the player tapping at each of `taps` (milliseconds from the start, any order): a tap falls in the step whose end it has not passed.
export function playTaps(field: FieldId, stage: TrainStage, taps: number[]): RhythmState {
  const s = newRhythm(field, stage);
  const todo = [...taps].sort((a, b) => a - b);
  let i = 0;
  while (!s.over) {
    stepRhythm(s, trainTuning.stepMs);
    while (i < todo.length && (todo[i] as number) < s.elapsedMs + trainTuning.stepMs) {
      if (!s.over) tapRhythm(s);
      i += 1;
    }
  }
  return s;
}

// The taps of the stand-in for one seeded run of the song: a normal draw round each note it does not skip, then its stray taps.
export function standInTaps(seed: number, field: FieldId, stage: TrainStage, p: Player = standIn[stage]): number[] {
  const rng = makeRng(seed >>> 0);
  const normal = (): number => Math.sqrt(-2 * Math.log(1 - rng.next())) * Math.cos(2 * Math.PI * rng.next());
  const song = newRhythm(field, stage);
  const taps: number[] = [];
  for (const time of song.times) if (rng.next() >= p.skip) taps.push(time + p.sigmaMs * normal());
  for (let k = 0; k < p.strayTaps; k++) if (rng.next() < 0.5) taps.push(rng.next() * trainTuning.sessionMs);
  return taps.filter((x) => x >= 0);
}

export const playRun = (seed: number, field: FieldId, stage: TrainStage, p: Player = standIn[stage]): RhythmState => playTaps(field, stage, standInTaps(seed, field, stage, p));

// A steady tapper: a tap every `intervalMs` from `phaseMs`, whatever the song is.
export function mash(field: FieldId, stage: TrainStage, intervalMs: number, phaseMs: number): RhythmState {
  const taps: number[] = [];
  for (let x = phaseMs; x < trainTuning.sessionMs; x += intervalMs) taps.push(x);
  return playTaps(field, stage, taps);
}

// The share of the most a song can score, in percent.
export const percentOf = (s: RhythmState): number => (100 * s.score) / maxScore(s);
