// Training: Bug Catch and the session around it (docs/adult-a3-plan.md section 10). Adult Mode only.
// This file is the rules and nothing else, with no screen code and no clock of its own: the engine is a pure function of a seed and the time it is fed, so a whole run is a loop in a test.
// `Game` (ui/game.ts) holds the session, the overlay (ui/TrainGame.tsx) feeds the engine frame times and taps, and `payTraining` is what the end of a run changes in the save.

import { combatTuning } from "../data/combat";
import { getForm } from "../data/forms";
import { trainTuning } from "../data/training";
import type { Band, TrainStage } from "../data/training";
import { addBondXp, bondOf } from "./bond";
import { addTrained } from "./combat/stats";
import { makeRng } from "./rng";
import type { Rng } from "./rng";
import { logEvent } from "./state";
import type { Creature, Save } from "./state";
import { localDay } from "./time";
import { tierOf, trainedToday } from "./trainingDay";
import type { Tier } from "./trainingDay";
import { stageOrder } from "./types";
import type { CombatStat } from "./types";

// (the day's count rules live in trainingDay.ts, which the loader in state.ts can import without a cycle)
export { coerceTraining, tierOf, trainedToday } from "./trainingDay";
export type { Tier } from "./trainingDay";

const t = trainTuning;

// ---- who may train ----

export type TrainRefusal = "busy" | "asleep" | "sick" | "too-young";

// Why this creature cannot train right now, or null if it can. The same four reasons as a fight, in the same order, and no `tired`: a session costs no energy (spec 4).
export function trainRefusal(c: Creature): TrainRefusal | null {
  if (c.job) return "busy";
  if (c.sleep) return "asleep";
  if (c.sick) return "sick";
  if (stageOrder.indexOf(getForm(c.formId).stage) < stageOrder.indexOf(combatTuning.minStage)) return "too-young";
  return null;
}

// The stage a session is played at, from the creature's form. Only meaningful once `trainRefusal` is null (a baby has no row).
export const trainStageOf = (c: Creature): TrainStage => getForm(c.formId).stage as TrainStage;

// ---- the engine ----

export interface Bug {
  id: number;
  x: number; // field units, the bug's middle
  y: number;
  vx: number; // units a millisecond
  vy: number;
  legMs: number; // how much longer it flies on this heading
  ageMs: number;
  golden: boolean;
}

export interface BugCatchState {
  stage: TrainStage;
  lengthMs: number;
  elapsedMs: number; // whole steps only
  carryMs: number; // time fed but not yet a whole step
  rng: number; // the generator's state (plain data, so a state can be copied and compared)
  nextId: number;
  spawnInMs: number;
  bugs: Bug[];
  score: number;
  catches: number;
  goldens: number;
  misses: number;
  streak: number; // catches since the last miss, this one included
  paused: boolean;
  over: boolean;
}

export function newBugCatch(seed: number, stage: TrainStage): BugCatchState {
  return {
    stage,
    lengthMs: t.sessionMs,
    elapsedMs: 0,
    carryMs: 0,
    rng: seed >>> 0,
    nextId: 1,
    spawnInMs: t.firstSpawnMs,
    bugs: [],
    score: 0,
    catches: 0,
    goldens: 0,
    misses: 0,
    streak: 0,
    paused: false,
    over: false,
  };
}

// Point a bug along a new heading, at the speed of its kind, and say how long it flies that way.
function heading(b: Bug, rng: Rng, speed: number): void {
  const angle = rng.next() * 2 * Math.PI;
  const perMs = (speed * (b.golden ? t.goldenSpeed : 1)) / 1000;
  b.vx = Math.cos(angle) * perMs;
  b.vy = Math.sin(angle) * perMs;
  b.legMs = rng.int(t.legMs[0], t.legMs[1]);
}

// One step of `stepMs`: the bugs fly (and bounce off the inside edge), a bug whose time is up is gone, a spawn happens when its timer is out and there is room, and the clock moves on.
// Says whether the set of bugs changed.
function advance(s: BugCatchState, rng: Rng): boolean {
  const row = t.rows[s.stage];
  const lo = t.edge;
  const hi = t.field - t.edge;
  let changed = false;
  for (const b of s.bugs) {
    b.x += b.vx * t.stepMs;
    b.y += b.vy * t.stepMs;
    if (b.x < lo) {
      b.x = lo;
      b.vx = Math.abs(b.vx);
    } else if (b.x > hi) {
      b.x = hi;
      b.vx = -Math.abs(b.vx);
    }
    if (b.y < lo) {
      b.y = lo;
      b.vy = Math.abs(b.vy);
    } else if (b.y > hi) {
      b.y = hi;
      b.vy = -Math.abs(b.vy);
    }
    b.ageMs += t.stepMs;
    b.legMs -= t.stepMs;
    if (b.legMs <= 0) heading(b, rng, row.speed);
  }
  const before = s.bugs.length;
  s.bugs = s.bugs.filter((b) => b.ageMs < row.lifeMs); // a bug whose time is up is gone: not a catch, not a miss
  if (s.bugs.length !== before) changed = true;

  s.spawnInMs = Math.max(0, s.spawnInMs - t.stepMs); // (at the cap the timer waits at 0 and the bug comes on the first step there is room)
  if (s.spawnInMs === 0 && s.bugs.length < row.most) {
    const b: Bug = { id: s.nextId++, x: rng.int(lo, hi), y: rng.int(lo, hi), vx: 0, vy: 0, legMs: 0, ageMs: 0, golden: false };
    b.golden = rng.chance(row.goldenChance);
    heading(b, rng, row.speed);
    s.bugs.push(b);
    s.spawnInMs = row.gapMs;
    changed = true;
  }

  s.elapsedMs += t.stepMs;
  if (s.elapsedMs >= s.lengthMs) s.over = true;
  return changed;
}

// Feed the engine the time since the last call. Each call counts at most `frameCapMs` (a page that stalled for seconds does not jump the bugs) and the engine moves in whole steps of
// `stepMs` (the same seed gives the same run at any frame rate). Nothing moves while paused or over. Says whether the set of bugs changed or the run ended, so the screen knows to redraw its list.
export function step(s: BugCatchState, dtMs: number): boolean {
  if (s.over || s.paused) return false;
  s.carryMs += Number.isFinite(dtMs) ? Math.min(Math.max(dtMs, 0), t.frameCapMs) : 0;
  if (s.carryMs < t.stepMs) return false;
  const rng = makeRng(s.rng);
  let changed = false;
  while (s.carryMs >= t.stepMs && !s.over) {
    s.carryMs -= t.stepMs;
    if (advance(s, rng)) changed = true;
  }
  s.rng = rng.state();
  return changed || s.over;
}

// The player caught a bug. Returns the points it scored, or null when there was nothing to catch (no such bug, paused or over).
export function catchBug(s: BugCatchState, id: number): number | null {
  if (s.over || s.paused) return null;
  const i = s.bugs.findIndex((b) => b.id === id);
  if (i < 0) return null;
  const bug = s.bugs[i] as Bug;
  s.bugs.splice(i, 1);
  s.streak += 1;
  const points = (bug.golden ? t.goldenPoints : t.catchPoints) * (s.streak >= t.streakFrom ? t.streakFactor : 1);
  s.score += points;
  s.catches += 1;
  if (bug.golden) s.goldens += 1;
  return points;
}

// A tap on the field with no bug under it. It costs no points, only the streak. Says whether it counted (not while paused or over).
export function missTap(s: BugCatchState): boolean {
  if (s.over || s.paused) return false;
  s.streak = 0;
  s.misses += 1;
  return true;
}

export function pause(s: BugCatchState): void {
  if (!s.over) s.paused = true;
}

export function resume(s: BugCatchState): void {
  s.paused = false;
}

// Bronze below the Silver line, Silver from it, Gold from the Gold line.
export function bandOf(score: number, stage: TrainStage): Band {
  const row = t.rows[stage];
  return score >= row.goldAt ? "gold" : score >= row.silverAt ? "silver" : "bronze";
}

// ---- paying a run ----

export interface TrainResult {
  counted: boolean; // false for a run with no catch: it pays nothing and counts for nothing
  band: Band;
  score: number;
  catches: number;
  tier: Tier;
  points: number; // Speed points really added (0 at the stage cap)
  capped: boolean; // a reward was due and the stat was at its stage cap
  discipline: number; // really added
  bondXp: number; // really added
  level: number | null; // the Bond level reached, or null
}

// Apply a finished run to the save, as a player action at `nowMs`. Returns null when there is nobody to pay (no living creature, or it is away). A run with no catch pays nothing and counts for nothing.
export function payTraining(save: Save, c: Creature | null, run: BugCatchState, nowMs: number): TrainResult | null {
  if (save.phase !== "alive" || !c || c.job) return null;
  const band = bandOf(run.score, run.stage);
  const result: TrainResult = { counted: false, band, score: run.score, catches: run.catches, tier: "none", points: 0, capped: false, discipline: 0, bondXp: 0, level: null };
  if (run.catches === 0) return result;
  result.counted = true;

  const stat: CombatStat = "spd";
  const day = trainedToday(c, stat, localDay(nowMs));
  result.tier = tierOf(day.count);
  const full = t.points[band];
  const want = result.tier === "full" ? full : result.tier === "half" ? Math.floor(full / 2) : 0;
  if (want > 0) {
    result.points = addTrained(c, stat, want);
    result.capped = result.points === 0;
  }
  const kept = c.training && c.training.day === day.day ? c.training.sessions : {};
  c.training = { day: day.day, sessions: { ...kept, [stat]: Math.min(day.count + 1, t.countMax) } };

  const disciplineBefore = c.stats.discipline;
  c.stats.discipline = Math.min(t.disciplineMax, disciplineBefore + t.discipline[band]);
  result.discipline = c.stats.discipline - disciplineBefore;

  const xpBefore = bondOf(c).xp;
  result.level = addBondXp(c, t.bondXp[band]);
  result.bondXp = bondOf(c).xp - xpBefore;

  logEvent(save, nowMs, `Bug Catch: ${band}, ${run.score} points, ${result.points} Speed, ${result.bondXp} Bond XP`);
  return result;
}

// ---- words (plain, for Adult Mode) ----

const bandName = (band: Band): string => band[0]!.toUpperCase() + band.slice(1);

// The start card's line, from the number of Speed sessions already counted today.
export function startLine(count: number): string {
  const tier = tierOf(count);
  if (tier === "full") return `Speed: full reward, ${count + 1} of ${t.full} today`;
  if (tier === "half") return `Speed: half reward, ${count - t.full + 1} of ${t.half} today`;
  return "Speed: Bond XP only today";
}

// The result card's lines, one after the other.
export function resultLines(r: TrainResult): string[] {
  if (!r.counted) return ["No bugs caught: nothing to pay."];
  const lines = [`${bandName(r.band)}: ${r.score} points, ${r.catches} caught`];
  if (r.points > 0) lines.push(`+${r.points} Speed`);
  else if (r.tier === "none") lines.push("Bond XP only now: today's Speed sessions are used up");
  else if (r.capped) lines.push("Speed is as high as it can go for now");
  else lines.push("No Speed from this one: half rewards round down");
  if (r.discipline > 0) lines.push(`+${r.discipline} Discipline`);
  if (r.bondXp > 0) lines.push(`+${r.bondXp} Bond XP`);
  if (r.level !== null) lines.push(`Bond level ${r.level}`);
  return lines;
}
