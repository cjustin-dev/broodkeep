// Jobs: the creature walks out to a habitat spot, works for a few real minutes and comes home with a
// haul of coins and a material. A job finishes in the simulation, so it also finishes while the app is closed.
// These functions work on a save that is already caught up to "now" (actions.ts does that first).

import { habitatTuning, spots } from "../../data/habitat";
import type { SpotId } from "../../data/habitat";
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
  save.coins += coins;
  save.inventory[spot.material] = (save.inventory[spot.material] ?? 0) + amount;
  c.counters.chores = (c.counters.chores ?? 0) + 1;
  c.job = null;
  save.hauls.push({ spot: job.spot, at: t, coins, material: spot.material, amount });
  if (save.hauls.length > habitatTuning.unseenHaulsMax) save.hauls.splice(0, save.hauls.length - habitatTuning.unseenHaulsMax);
  logEvent(save, t, `Came back from the ${spot.name} with ${coins} coins and ${amount} ${spot.material}`);
}
