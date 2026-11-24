// Jobs: the creature walks out to a habitat spot, works for a few real minutes and comes home with a
// haul of coins and a material. A job finishes in the simulation, so it also finishes while the app is closed.
// These functions work on a save that is already caught up to "now" (actions.ts does that first).

import { habitatTuning, spots } from "../../data/habitat";
import type { SpotId } from "../../data/habitat";
import { noteRequest } from "../requests";
import type { Rng } from "../rng";
import { logEvent } from "../state";
import type { Creature, Save } from "../state";
import { MINUTE } from "../time";
import { stageOrder } from "../types";
import { getForm } from "../../data/forms";

export type JobRefusal = "busy" | "asleep" | "sick" | "too-young" | "tired";

// Why this creature cannot go to this spot right now, or null if it can.
export function jobRefusal(c: Creature, spotId: SpotId): JobRefusal | null {
  const spot = spots[spotId];
  if (c.job) return "busy";
  if (c.sleep) return "asleep";
  if (c.sick) return "sick";
  if (stageOrder.indexOf(getForm(c.formId).stage) < stageOrder.indexOf(spot.minStage)) return "too-young";
  if (c.stats.energy - spot.energyCost < habitatTuning.energyFloor) return "tired";
  return null;
}

// Send the creature out. The caller has already checked jobRefusal.
export function beginJob(save: Save, c: Creature, spotId: SpotId, nowMs: number): void {
  const spot = spots[spotId];
  c.stats.energy -= spot.energyCost;
  c.job = { spot: spotId, startedAt: nowMs, endsAt: nowMs + spot.minutes * MINUTE };
  logEvent(save, nowMs, `Set off to the ${spot.name}`);
}

// Called for every simulated minute while the creature is alive. t is the END of that minute.
export function stepJob(save: Save, rng: Rng, t: number): void {
  const c = save.creature;
  const job = c?.job;
  if (!c || !job) return;
  const spot = spots[job.spot];
  // A job is never more than its own length away. If the device clock was set back far enough for the game to start
  // again from the new time (see simulateTo), its old finishing time would be hours or years ahead and keep the creature out.
  const latest = t + spot.minutes * MINUTE;
  if (job.endsAt > latest) {
    job.endsAt = latest;
    job.startedAt = latest - spot.minutes * MINUTE;
  }
  if (t < job.endsAt) return;
  const coins = rng.int(spot.coins[0], spot.coins[1]);
  const amount = rng.int(spot.amount[0], spot.amount[1]);
  c.counters.chores = (c.counters.chores ?? 0) + 1;
  c.job = null;
  bringHome(save, job.spot, t, coins, amount);
  logEvent(save, t, `Came back from the ${spot.name} with ${coins} coins and ${amount} ${spot.material}`);
  noteRequest(save, { kind: "job", spot: job.spot }, t); // a finished job only: a call back does not come through here
}

// Put a haul into the bag and into the "welcome back" list (the oldest card is forgotten past the limit; its coins are already in the bag).
function bringHome(save: Save, spotId: SpotId, at: number, coins: number, amount: number): void {
  const material = spots[spotId].material;
  save.coins += coins;
  save.inventory[material] = (save.inventory[material] ?? 0) + amount;
  save.hauls.push({ spot: spotId, at, coins, material, amount });
  if (save.hauls.length > habitatTuning.unseenHaulsMax) save.hauls.splice(0, save.hauls.length - habitatTuning.unseenHaulsMax);
}

// What calling the creature back at nowMs brings home: the middle of each range times the share of the job already done, rounded down.
// Whole numbers all the way (milliseconds, and the two ends of a range added up), so a third of a job that pays 3 is 1 and never 0.9999.
// The share is clamped: a clock set back (nowMs before the start) earns nothing, and past the end it earns the whole middle.
export function callBackHaul(job: NonNullable<Creature["job"]>, nowMs: number): { coins: number; amount: number } {
  const spot = spots[job.spot];
  const { done, total } = jobTime(job, nowMs);
  if (total === 0) return { coins: 0, amount: 0 };
  const share = (range: [number, number]): number => Math.floor(((range[0] + range[1]) * done) / (2 * total));
  return { coins: share(spot.coins), amount: share(spot.amount) };
}

// How much of the job is done at nowMs, in milliseconds out of its whole length. A job with no length (a hand-made save) is 0 of 0.
function jobTime(job: NonNullable<Creature["job"]>, nowMs: number): { done: number; total: number } {
  const total = job.endsAt - job.startedAt;
  if (!(total > 0)) return { done: 0, total: 0 };
  return { done: Math.min(total, Math.max(0, nowMs - job.startedAt)), total };
}

// The share of the job that is done, 0 to 1, for the progress bar (the same clamp the haul uses).
export function jobProgress(job: NonNullable<Creature["job"]>, nowMs: number): number {
  const { done, total } = jobTime(job, nowMs);
  return total === 0 ? 0 : done / total;
}

// Bring the creature home early with what the time earned (callBackHaul). The energy it spent is not given back, and the job does not count
// as a chore. A call back that earned nothing leaves no "welcome back" card. The caller has already caught the save up to nowMs.
export function endJobEarly(save: Save, c: Creature, nowMs: number): void {
  const job = c.job;
  if (!job) return;
  const spot = spots[job.spot];
  const { coins, amount } = callBackHaul(job, nowMs);
  c.job = null;
  if (coins + amount > 0) {
    bringHome(save, job.spot, nowMs, coins, amount);
    logEvent(save, nowMs, `Called back from the ${spot.name} early with ${coins} coins and ${amount} ${spot.material}`);
  } else {
    logEvent(save, nowMs, `Called back from the ${spot.name} early`);
  }
}
