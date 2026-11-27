// Training: Bug Catch and the session around it (docs/adult-a3-plan.md section 10). Adult Mode only.
// This file is the rules and nothing else, with no screen code and no clock of its own: the engine is a pure function of a seed and the time it is fed, so a whole run is a loop in a test.
// `Game` (ui/game.ts) holds the session, the overlay (ui/TrainGame.tsx) feeds the engine frame times and taps, and `payTraining` is what the end of a run changes in the save.

import { combatTuning } from "../data/combat";
import { getForm } from "../data/forms";
import { materials } from "../data/habitat";
import type { MaterialId } from "../data/habitat";
import { trainGames, trainTuning } from "../data/training";
import type { Band, TrainGameId, TrainStage } from "../data/training";
import { pickups, tapTuning } from "../data/tappables";
import { addBondXp, bondOf } from "./bond";
import { addTrained } from "./combat/stats";
import { rhythmBandOf } from "./rhythm";
import type { RhythmState } from "./rhythm";
import { makeRng } from "./rng";
import type { Rng } from "./rng";
import { logEvent } from "./state";
import type { Creature, Save } from "./state";
import { localDay } from "./time";
import { tierOf, trainedToday } from "./trainingDay";
import type { Tier } from "./trainingDay";
import { stageOrder } from "./types";
import type { CombatStat, FieldId } from "./types";

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

// `lengthMs` is the session's length; a bug tapped in a field (docs/adult-a3-plan.md section 17, decision 8) plays a burst of 10 seconds.
export function newBugCatch(seed: number, stage: TrainStage, lengthMs: number = t.sessionMs): BugCatchState {
  return {
    stage,
    lengthMs,
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

export function pause(s: { paused: boolean; over: boolean }): void {
  if (!s.over) s.paused = true;
}

export function resume(s: { paused: boolean }): void {
  s.paused = false;
}

// Bronze below the Silver line, Silver from it, Gold from the Gold line.
export function bandOf(score: number, stage: TrainStage): Band {
  const row = t.rows[stage];
  return score >= row.goldAt ? "gold" : score >= row.silverAt ? "silver" : "bronze";
}

// ---- paying a run ----

export interface TrainResult {
  game: TrainGameId;
  stat: CombatStat; // the stat the game trains
  counted: boolean; // false for a run with no catch or no note hit: it pays nothing and counts for nothing
  band: Band;
  score: number;
  catches: number; // bugs caught, or notes hit
  tier: Tier;
  points: number; // points of the game's stat really added (0 at the stage cap)
  capped: boolean; // a reward was due and the stat was at its stage cap
  discipline: number; // really added
  bondXp: number; // really added
  level: number | null; // the Bond level reached, or null
  rhythm?: { perfects: number; goods: number; missed: number; strays: number; best: number }; // Rhythm Grove only
}

// The end of every game's session (docs/adult-a4-plan.md section 2, decision 3): the day's count of the game's stat and its tier, the stat's points (never past the stage cap), Discipline and Bond XP by
// band, one log line. `hits` is what the run did (bugs caught, notes hit): a run with none pays nothing and counts for nothing.
function paySession(save: Save, c: Creature, game: TrainGameId, band: Band, score: number, hits: number, nowMs: number): TrainResult {
  const { name, stat, statName } = trainGames[game];
  const result: TrainResult = { game, stat, counted: false, band, score, catches: hits, tier: "none", points: 0, capped: false, discipline: 0, bondXp: 0, level: null };
  if (hits === 0) return result;
  result.counted = true;

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

  logEvent(save, nowMs, `${name}: ${band}, ${score} points, ${result.points} ${statName}, ${result.bondXp} Bond XP`);
  return result;
}

// Apply a finished Bug Catch run to the save, as a player action at `nowMs`. Returns null when there is nobody to pay (no living creature, or it is away). A run with no catch pays nothing and counts for nothing.
export function payTraining(save: Save, c: Creature | null, run: BugCatchState, nowMs: number): TrainResult | null {
  if (save.phase !== "alive" || !c || c.job) return null;
  return paySession(save, c, "bug", bandOf(run.score, run.stage), run.score, run.catches, nowMs);
}

// The same for a finished Rhythm Grove run: Spirit, by the band of its score as a share of the song's most.
export function payRhythm(save: Save, c: Creature | null, run: RhythmState, nowMs: number): TrainResult | null {
  if (save.phase !== "alive" || !c || c.job) return null;
  const result = paySession(save, c, "rhythm", rhythmBandOf(run), run.score, run.perfects + run.goods, nowMs);
  result.rhythm = { perfects: run.perfects, goods: run.goods, missed: run.misses, strays: run.strays, best: run.best };
  return result;
}

// What a burst in a field paid (docs/adult-a3-plan.md section 17, decision 8). No Speed, no Discipline and no day count: the 75 second session is the training.
export interface BurstResult {
  burst: true;
  catches: number;
  bondXp: number; // really added
  level: number | null; // the Bond level reached, or null
  material: MaterialId | null; // the field's pickup material, paid when a golden bug was caught
}

// Apply a finished burst to the save, as a player action at `nowMs`: Bond XP for each bug caught (up to `burstXpMax`) and 1 of the field's pickup material when a golden bug was caught. Returns null
// when there is nobody to pay (no living creature, or it is away). A burst with no catch pays nothing.
export function payBurst(save: Save, c: Creature | null, run: BugCatchState, field: FieldId, nowMs: number): BurstResult | null {
  if (save.phase !== "alive" || !c || c.job) return null;
  const result: BurstResult = { burst: true, catches: run.catches, bondXp: 0, level: null, material: null };
  if (run.catches === 0) return result;
  const xpBefore = bondOf(c).xp;
  result.level = addBondXp(c, Math.min(run.catches, tapTuning.burstXpMax));
  result.bondXp = bondOf(c).xp - xpBefore;
  if (run.goldens > 0) {
    const material = pickups[field].material;
    result.material = material;
    save.inventory[material] = (save.inventory[material] ?? 0) + 1;
  }
  logEvent(save, nowMs, `Bug burst: ${run.catches} caught, ${result.bondXp} Bond XP${result.material ? `, 1 ${result.material}` : ""}`);
  return result;
}

// ---- words (plain, for Adult Mode) ----

const bandName = (band: Band): string => band[0]!.toUpperCase() + band.slice(1);

// The start card's line, from the number of the game's stat's sessions already counted today.
export function startLine(game: TrainGameId, count: number): string {
  const tier = tierOf(count);
  const word = trainGames[game].statName;
  if (tier === "full") return `${word}: full reward, ${count + 1} of ${t.full} today`;
  if (tier === "half") return `${word}: half reward, ${count - t.full + 1} of ${t.half} today`;
  return `${word}: Bond XP only today`;
}

// The result card's lines, one after the other.
export function resultLines(r: TrainResult | BurstResult): string[] {
  if ("burst" in r) {
    if (r.catches === 0) return ["No bugs caught."];
    const lines = [`Caught ${r.catches} ${r.catches === 1 ? "bug" : "bugs"}.`];
    if (r.bondXp > 0) lines.push(`+${r.bondXp} Bond XP`);
    if (r.material) lines.push(`+1 ${materials[r.material].name}`);
    if (r.level !== null) lines.push(`Bond level ${r.level}`);
    return lines;
  }
  if (!r.counted) return [r.game === "bug" ? "No bugs caught: nothing to pay." : "No notes hit: nothing to pay."];
  const word = trainGames[r.game].statName;
  const lines = [r.game === "bug" ? `${bandName(r.band)}: ${r.score} points, ${r.catches} caught` : `${bandName(r.band)}: ${r.score} points, ${r.catches} ${r.catches === 1 ? "note" : "notes"} hit`];
  if (r.rhythm) lines.push(`Perfect ${r.rhythm.perfects}, Good ${r.rhythm.goods}, missed ${r.rhythm.missed}, no note ${r.rhythm.strays}, best streak ${r.rhythm.best}`);
  if (r.points > 0) lines.push(`+${r.points} ${word}`);
  else if (r.tier === "none") lines.push(`Bond XP only now: today's ${word} sessions are used up`);
  else if (r.capped) lines.push(`${word} is as high as it can go for now`);
  else lines.push(`No ${word} from this one: half rewards round down`);
  if (r.discipline > 0) lines.push(`+${r.discipline} Discipline`);
  if (r.bondXp > 0) lines.push(`+${r.bondXp} Bond XP`);
  if (r.level !== null) lines.push(`Bond level ${r.level}`);
  return lines;
}
