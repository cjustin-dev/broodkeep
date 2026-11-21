// Things the player can do. Each action first catches the simulation up to "now",
// so it always acts on up-to-date stats. nowMs is GAME time (see time.ts), not real time.
// Each action returns a short word saying what happened, so the screen can react.

import { foods } from "../data/foods";
import { tuning } from "../data/tuning";
import { hatchIfReady, simulateTo } from "./sim";
import { makeRng } from "./rng";
import { clamp, logEvent, newEgg } from "./state";
import type { Creature, Save } from "./state";
import { MINUTE } from "./time";
import type { FoodId } from "./types";
import { eggPatterns } from "../data/eggs";

// The living creature, after catching up. Null if there is none (egg, or dead).
function alive(save: Save, nowMs: number): Creature | null {
  simulateTo(save, nowMs);
  return save.phase === "alive" ? save.creature : null;
}

export type FeedResult = "ate" | "full" | "sleeping" | "unavailable";

export function feed(save: Save, foodId: FoodId, nowMs: number): FeedResult {
  const c = alive(save, nowMs);
  if (!c) return "unavailable";
  if (c.sleep) return "sleeping";
  if (c.stats.hunger >= tuning.fullAtHunger) return "full";

  const food = foods[foodId];
  const rng = makeRng(save.rngState);

  if (foodId === "candy") {
    // Too much candy makes the creature sick. Each candy eaten lately adds to the risk.
    c.recentCandy = c.recentCandy.filter((at) => nowMs - at < tuning.sickness.candyWindowMinutes * MINUTE);
    const risk = c.recentCandy.length * tuning.sickness.candyChancePerRecent;
    if (!c.sick && risk > 0 && rng.chance(risk)) {
      c.sick = true;
      logEvent(save, nowMs, "Got sick (too much candy)");
    }
    c.recentCandy.push(nowMs);
  }

  c.stats.hunger = clamp(c.stats.hunger + food.hunger);
  c.stats.happiness = clamp(c.stats.happiness + food.happiness);
  c.stats.wellness = clamp(c.stats.wellness + food.wellness);
  c.counters.foodEaten[foodId] += 1;
  c.digestQueue.push(rng.int(food.digestMinutes[0], food.digestMinutes[1]));
  save.rngState = rng.state();
  logEvent(save, nowMs, `Ate ${food.name}`);
  return "ate";
}

export type CleanResult = "cleaned" | "nothing" | "unavailable";

export function clean(save: Save, nowMs: number): CleanResult {
  const c = alive(save, nowMs);
  if (!c) return "unavailable";
  if (c.poop === 0 && c.stats.hygiene >= 99) return "nothing";
  logEvent(save, nowMs, c.poop > 0 ? `Cleaned up ${c.poop} poop` : "Cleaned the creature");
  c.poop = 0;
  c.stats.hygiene = 100;
  return "cleaned";
}

export type MedicineResult = "cured" | "not-sick" | "unavailable";

// Phase 1 has unlimited medicine. A real supply comes with crafting.
export function giveMedicine(save: Save, nowMs: number): MedicineResult {
  const c = alive(save, nowMs);
  if (!c) return "unavailable";
  if (!c.sick) return "not-sick";
  c.sick = false;
  c.stats.wellness = clamp(Math.max(c.stats.wellness + tuning.medicine.wellnessBoost, tuning.medicine.wellnessFloor));
  c.wellnessZeroMinutes = 0;
  logEvent(save, nowMs, "Took medicine and got better");
  return "cured";
}

export type LightsResult = "napping" | "woke" | "not-tired" | "night" | "unavailable";

// The lights button: put the creature down for a nap, or wake it from one.
export function toggleLights(save: Save, nowMs: number): LightsResult {
  const c = alive(save, nowMs);
  if (!c) return "unavailable";
  if (c.sleep === "night") return "night"; // night sleep follows the clock
  if (c.sleep === "nap") {
    c.sleep = null;
    logEvent(save, nowMs, "Woken from a nap");
    return "woke";
  }
  if (c.stats.energy >= tuning.napBelowEnergy) return "not-tired";
  c.sleep = "nap";
  logEvent(save, nowMs, "Went down for a nap");
  return "napping";
}

export type EggTapResult = "tapped" | "hatched" | "unavailable";

// Tapping the egg saves a little hatching time, up to a limit.
export function tapEgg(save: Save, nowMs: number): EggTapResult {
  simulateTo(save, nowMs);
  const egg = save.egg;
  if (save.phase !== "egg" || !egg) return "unavailable";
  egg.shavedMinutes = Math.min(tuning.egg.maxShaveMinutes, egg.shavedMinutes + tuning.egg.tapShaveMinutes);
  const rng = makeRng(save.rngState);
  const hatched = hatchIfReady(save, rng, nowMs);
  save.rngState = rng.state();
  return hatched ? "hatched" : "tapped";
}

export type TouchKind = "poke" | "pet" | "tickle";
export interface TouchResult {
  gained: number; // happiness gained (0 once the hourly limit is reached)
  asleep: boolean;
}

// Tap reactions. Petting and tickling add happiness, but only up to a limit per hour.
export function touch(save: Save, kind: TouchKind, nowMs: number): TouchResult {
  const c = alive(save, nowMs);
  if (!c) return { gained: 0, asleep: false };
  if (c.sleep) return { gained: 0, asleep: true };
  if (kind === "poke") return { gained: 0, asleep: false };

  const a = c.affection;
  if (nowMs - a.windowStart >= tuning.affection.windowMinutes * MINUTE) {
    a.windowStart = nowMs;
    a.gained = 0;
  }
  const want = kind === "pet" ? tuning.affection.pet : tuning.affection.tickle;
  const gained = Math.max(0, Math.min(want, tuning.affection.maxGainPerWindow - a.gained));
  a.gained += gained;
  c.stats.happiness = clamp(c.stats.happiness + gained);
  return { gained, asleep: false };
}

// After a death: start over with a new egg.
export function startNewEgg(save: Save, nowMs: number): boolean {
  simulateTo(save, nowMs);
  if (save.phase !== "dead") return false;
  const rng = makeRng(save.rngState);
  save.egg = newEgg(nowMs, rng.pick(eggPatterns));
  save.rngState = rng.state();
  save.creature = null;
  save.death = null;
  save.phase = "egg";
  logEvent(save, nowMs, "A new egg appeared");
  return true;
}
