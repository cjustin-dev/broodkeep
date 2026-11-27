// Stack & Balance: the moving block and the landing (docs/adult-a4-plan.md section 6). Adult Mode only, like the other training games.
// This file is the rules and nothing else, with no screen code and no clock of its own: the moving block is a function of the time it is fed, a run is a function of that time and the drops it
// is given, and there is no random draw at all, so a whole run is a loop in a test. `payStack` (game/training.ts) is what the end of a run changes in the save.

import { stackTuning } from "../data/stack";
import { trainTuning } from "../data/training";
import type { Band, TrainStage } from "../data/training";

const t = trainTuning;
const k = stackTuning;

export interface StackBlock {
  x: number; // the centre, in whole units across the field
  w: number; // the width, always even
}

export type StackJudge = "perfect" | "good" | "wobble" | "topple";

// What was last said about a drop, for the screen's one line. `n` counts them, so the screen can tell a new one from the one it has already shown.
export interface StackSaid {
  n: number;
  judge: StackJudge;
  combo: number; // the combo after a Perfect
  trimmedPct: number; // the share of the coming block's width that was cut off after a Good, in whole percent
}

export interface StackState {
  stage: TrainStage;
  lengthMs: number;
  elapsedMs: number; // whole steps only
  carryMs: number; // time fed but not yet a whole step
  blocks: StackBlock[]; // from the base up: blocks[0] is the base the stack stands on, never trimmed
  w: number; // the width of the block that is coming
  standMs: number; // how long the stack has stood since the first block landed on the base
  readyAt: number; // the elapsed time from which the next drop counts
  blockPoints: number; // the points of the blocks placed
  perfects: number;
  goods: number;
  badDrops: number; // 0, 1 (forgiven) or 2 (the stack fell)
  recovered: boolean; // the one forgiven bad drop has been used
  toppled: boolean;
  combo: number; // Perfects in a row
  best: number; // the longest combo
  said: StackSaid | null;
  paused: boolean;
  over: boolean;
}

// A run at `stage`. `lengthMs` is the session's length.
export function newStack(stage: TrainStage, lengthMs: number = t.sessionMs): StackState {
  return {
    stage,
    lengthMs,
    elapsedMs: 0,
    carryMs: 0,
    blocks: [{ x: k.baseX, w: k.startW }],
    w: k.startW,
    standMs: 0,
    readyAt: 0,
    blockPoints: 0,
    perfects: 0,
    goods: 0,
    badDrops: 0,
    recovered: false,
    toppled: false,
    combo: 0,
    best: 0,
    said: null,
    paused: false,
    over: false,
  };
}

// The height of the stack: the blocks placed on the base.
export const heightOf = (s: Pick<StackState, "blocks">): number => s.blocks.length - 1;

// The centre of the moving block at the time the run shows: a triangle wave between `lo` and `hi` that starts at `lo` going right, at the stage's speed, in whole units. It depends on the time and the
// stage and nothing else.
export function blockX(s: Pick<StackState, "elapsedMs" | "stage">): number {
  const range = k.hi - k.lo;
  const period = (2 * range * 1000) / k.rows[s.stage].speed;
  const phase = (s.elapsedMs % period) / period;
  return Math.round(k.lo + range * (phase < 0.5 ? phase * 2 : 2 - phase * 2));
}

// The score: the blocks' points plus the seconds the stack has stood. Read when it is needed, never kept, so the order of events cannot change it.
export const scoreOf = (s: Pick<StackState, "blockPoints" | "standMs">): number => s.blockPoints + Math.floor(s.standMs / 1000) * k.standPts;

// The widest drop in time that counts as Perfect for a full-width block, in whole milliseconds (the start card says it).
export const perfectWindowMs = (stage: TrainStage): number => Math.round((k.rows[stage].perfectU * 1000) / k.rows[stage].speed);

// Feed the engine the time since the last call. Each call counts at most `frameCapMs` (a page that stalled for seconds does not jump the block) and the engine moves in whole steps of `stepMs`
// (the same drops at the same times give the same run at any frame rate). Nothing moves while paused or over. Says whether the run ended in this call.
export function stepStack(s: StackState, dtMs: number): boolean {
  if (s.over || s.paused) return false;
  s.carryMs += Number.isFinite(dtMs) ? Math.min(Math.max(dtMs, 0), t.frameCapMs) : 0;
  while (s.carryMs >= t.stepMs && !s.over) {
    s.carryMs -= t.stepMs;
    s.elapsedMs += t.stepMs;
    if (s.blocks.length > 1) s.standMs += t.stepMs;
    if (s.elapsedMs >= s.lengthMs) s.over = true;
  }
  return s.over;
}

export interface StackDrop {
  judge: StackJudge;
}

const say = (s: StackState, judge: StackJudge, trimmedPct = 0): void => {
  s.said = { n: (s.said?.n ?? 0) + 1, judge, combo: s.combo, trimmedPct };
};

// The player dropped the block, at the time the screen shows (`elapsedMs`): the moving block is where `blockX` puts it. A drop before the next block has come (`readyAt`) does nothing, and neither does
// one while paused or over: null. Otherwise the next block comes `dropGapMs` later and the drop lands (`landAt`).
export function dropStack(s: StackState): StackDrop | null {
  if (s.over || s.paused || s.elapsedMs < s.readyAt) return null;
  s.readyAt = s.elapsedMs + k.dropGapMs;
  return landAt(s, blockX(s));
}

// The landing rules for a block whose centre is `x`, on the top block:
//  - Perfect: its centre is within `perfectU` of the top block's (never more than half the narrower of the two): it snaps into place with its width kept, and a streak makes the next block wider.
//  - Good: enough of it overlaps (`wobblePct` of its width and `minW` units): the overhang is cut off.
//  - Bad: little or no overlap. The first one in a run is forgiven (the block is lost); the second makes the stack fall and the run ends.
export function landAt(s: StackState, x: number): StackDrop {
  const top = s.blocks[s.blocks.length - 1] as StackBlock;
  const w = s.w;
  const left = Math.max(x - w / 2, top.x - top.w / 2);
  const overlap = Math.max(0, Math.min(x + w / 2, top.x + top.w / 2) - left);

  if (Math.abs(x - top.x) <= Math.min(k.rows[s.stage].perfectU, Math.floor(Math.min(w, top.w) / 2))) {
    s.perfects += 1;
    s.combo += 1;
    s.best = Math.max(s.best, s.combo);
    s.blockPoints += k.perfectPts + k.comboPts * Math.min(s.combo - 1, k.comboMax);
    s.blocks.push({ x: top.x, w });
    if (s.combo >= k.growFrom) s.w = Math.min(k.startW, w + k.growBy);
    say(s, "perfect");
    return { judge: "perfect" };
  }
  if (overlap * 100 >= k.wobblePct * w && overlap >= k.minW) {
    const width = overlap - (overlap % 2);
    s.goods += 1;
    s.combo = 0;
    s.blockPoints += k.goodPts;
    s.blocks.push({ x: left + width / 2, w: width });
    s.w = width;
    say(s, "good", Math.round((100 * (w - width)) / w));
    return { judge: "good" };
  }
  s.combo = 0;
  s.badDrops += 1;
  if (!s.recovered) {
    s.recovered = true;
    say(s, "wobble");
    return { judge: "wobble" };
  }
  s.toppled = true;
  s.over = true;
  say(s, "topple");
  return { judge: "topple" };
}

// ---- the band ----

// Bronze below the Silver line, Silver from it, Gold from the Gold line.
export function stackBandOf(score: number, stage: TrainStage): Band {
  const row = k.rows[stage];
  return score >= row.goldAt ? "gold" : score >= row.silverAt ? "silver" : "bronze";
}

// ---- words ----

// The one line over the field, in words: "Perfect, combo 4", "Good, trimmed 12 percent", the wobble and the fall.
export function saidLine(said: StackSaid): string {
  switch (said.judge) {
    case "perfect":
      return `Perfect, combo ${said.combo}`;
    case "good":
      return `Good, trimmed ${said.trimmedPct} percent`;
    case "wobble":
      return "Wobble, steadied. One more and it falls";
    default:
      return "It fell";
  }
}
