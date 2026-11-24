// The simulation: moves the save forward in time, one minute at a time.
// The same code runs while the app is open and when catching up after it was closed.
// Whole minutes only, with randomness from the saved seed, so any way of splitting
// up the same stretch of time gives the identical result.

import { eggPatterns, hatchTable } from "../data/eggs";
import { getForm } from "../data/forms";
import { tuning } from "../data/tuning";
import { discover } from "./book";
import { stepCare } from "./care";
import { maxHp } from "./combat/stats";
import { stepRecovery } from "./combat/recovery";
import { stepJob } from "./habitat/jobs";
import { stepRequests } from "./requests";
import { countFieldMinute, countNeglectMinute, nextForm } from "./growth";
import { makeRng } from "./rng";
import type { Rng } from "./rng";
import { freshCounters, logEvent } from "./state";
import type { Creature, Save } from "./state";
import { MINUTE } from "./time";
import type { EggPattern } from "./types";

// Bring the save up to date with nowMs. Returns how many minutes of time were covered.
export function simulateTo(save: Save, nowMs: number): number {
  if (nowMs < save.lastSimulatedAt) {
    // The device clock went backwards. A small step back is ignored: time carries on
    // once the clock catches up. A big step back means the clock was wrong, so start
    // again from the new time (otherwise the creature would freeze for years).
    if (save.lastSimulatedAt - nowMs > tuning.clockRewindToleranceMinutes * MINUTE) {
      save.lastSimulatedAt = nowMs;
      logEvent(save, nowMs, "The clock went back: carrying on from the new time");
    }
    return 0;
  }
  const steps = Math.floor((nowMs - save.lastSimulatedAt) / MINUTE);
  if (steps <= 0) return 0;

  const rng = makeRng(save.rngState);
  let done = 0;
  for (; done < steps && save.phase !== "dead"; done++) {
    save.lastSimulatedAt += MINUTE;
    stepMinute(save, rng, save.lastSimulatedAt);
  }
  // Once the creature is dead nothing can change any more, so skip straight to the end.
  // That also keeps a very long absence quick: a creature cannot live long unattended.
  save.lastSimulatedAt += (steps - done) * MINUTE;
  save.rngState = rng.state();
  return steps;
}

// t is the END of the minute being simulated.
function stepMinute(save: Save, rng: Rng, t: number): void {
  if (save.phase === "egg") {
    hatchIfReady(save, rng, t);
  } else if (save.phase === "alive" && save.creature) {
    stepCare(save, rng, t);
    if (save.phase === "alive") {
      stepJob(save, rng, t); // before evolving, so a job finished this minute counts toward the next form
      if (save.creature) {
        stepRecovery(save.creature);
        countFieldMinute(save.creature);
        countNeglectMinute(save.creature);
      }
      evolveIfReady(save, t);
      stepRequests(save, rng, t); // the request board (Adult Mode only); it reads the generator and never advances it
    }
  }
}

// Hatches the egg once enough time has passed (taps count as saved time).
// Also called right after a tap, so the last tap hatches the egg at once.
export function hatchIfReady(save: Save, rng: Rng, t: number): boolean {
  const egg = save.egg;
  if (save.phase !== "egg" || !egg) return false;
  const waited = (t - egg.startedAt) / MINUTE + egg.shavedMinutes;
  if (waited < tuning.egg.minutes) return false;
  const babyId = rng.pick(hatchTable[egg.pattern] ?? hatchTable[eggPatterns[0]!]);
  save.creature = makeCreature(babyId, t, egg.pattern);
  save.egg = null;
  save.phase = "alive";
  logEvent(save, t, `The egg hatched into ${getForm(babyId).name}`);
  discover(save, babyId, t);
  return true;
}

export function makeCreature(formId: string, t: number, eggPattern: EggPattern = eggPatterns[0]!): Creature {
  return {
    formId,
    eggPattern,
    place: "home",
    bornAt: t,
    stageStartedAt: t,
    stats: { ...tuning.newborn },
    sleep: null,
    sick: false,
    poop: 0,
    digestQueue: [],
    call: null,
    callMinutes: 0,
    wellnessZeroMinutes: 0,
    recentCandy: [],
    affection: { windowStart: t, gained: 0 },
    counters: freshCounters(),
  };
}

function evolveIfReady(save: Save, t: number): void {
  const c = save.creature;
  if (!c) return;
  const next = nextForm(c, t);
  if (next) evolveTo(save, next, t);
}

// Change form and start a new stage. Care stats stay as they are.
export function evolveTo(save: Save, formId: string, t: number): void {
  const c = save.creature;
  if (!c) return;
  const from = getForm(c.formId).name;
  const hpShare = c.hp === undefined ? null : c.hp / maxHp(c); // a hurt creature stays as hurt, in proportion
  c.formId = getForm(formId).id;
  c.stageStartedAt = t;
  c.counters = freshCounters();
  c.callMinutes = 0; // an unanswered call that was nearly a mistake does not carry into the new stage's count
  // Half the trained points carry over (plan 7.1), and the ladder starts again.
  if (c.trained) c.trained = Object.fromEntries(Object.entries(c.trained).map(([stat, points]) => [stat, Math.floor(points / 2)]));
  delete c.rung;
  if (hpShare !== null) c.hp = Math.min(maxHp(c), Math.round(hpShare * maxHp(c)));
  logEvent(save, t, `${from} evolved into ${getForm(formId).name}`);
  discover(save, c.formId, t);
}
