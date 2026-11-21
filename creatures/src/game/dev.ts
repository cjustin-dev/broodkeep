// Developer mode tools. They bend the rules on purpose, so the family can test things
// without waiting days. Nothing here is used in normal play.

import { eggPatterns } from "../data/eggs";
import { getForm } from "../data/forms";
import { makeCreature, evolveTo, simulateTo } from "./sim";
import { clamp, logEvent, newEgg, newSave } from "./state";
import type { Save, Stats } from "./state";
import { HOUR, gameNow } from "./time";
import type { EggPattern } from "./types";

// Jump the game clock forward. The creature then lives through those hours
// (hunger, sleep, poop, sickness, even death) exactly as if you had waited.
export function skipAhead(save: Save, hours: number, realNowMs: number): void {
  save.clockOffsetMs += hours * HOUR;
  logEvent(save, gameNow(save, realNowMs), `Dev: skipped ahead ${hours} hours`);
  simulateTo(save, gameNow(save, realNowMs));
}

// Time multiplier: call this on every tick with the real time that passed since the last tick.
// At 10x, each real second adds nine extra seconds of game time.
export function advanceClock(save: Save, realDeltaMs: number, multiplier: number): void {
  if (multiplier > 1) save.clockOffsetMs += realDeltaMs * (multiplier - 1);
}

export function setStat(save: Save, stat: keyof Stats, value: number): void {
  if (save.creature) save.creature.stats[stat] = clamp(value);
}

export function setSick(save: Save, sick: boolean): void {
  if (save.creature) save.creature.sick = sick;
}

export function setPoop(save: Save, count: number): void {
  if (save.creature) save.creature.poop = Math.max(0, Math.min(5, Math.round(count)));
}

// Replace whatever is happening with a creature of the chosen form (hatch it right now).
export function forceHatch(save: Save, formId: string, nowMs: number): void {
  getForm(formId); // throws on an unknown form BEFORE anything is changed
  simulateTo(save, nowMs);
  save.creature = makeCreature(formId, nowMs);
  save.egg = null;
  save.death = null;
  save.phase = "alive";
  logEvent(save, nowMs, `Dev: hatched ${formId}`);
}

// Change the living creature into any form, and start a fresh stage.
export function forceEvolve(save: Save, formId: string, nowMs: number): void {
  simulateTo(save, nowMs);
  if (save.phase === "alive") evolveTo(save, formId, nowMs);
}

export function killCreature(save: Save, nowMs: number): void {
  simulateTo(save, nowMs);
  if (save.phase !== "alive" || !save.creature) return;
  save.phase = "dead";
  save.death = { at: nowMs, cause: "neglect" };
  save.creature.call = null;
  save.creature.sleep = null;
  logEvent(save, nowMs, "Dev: creature died");
}

export function spawnEgg(save: Save, nowMs: number, pattern?: EggPattern): void {
  save.egg = newEgg(nowMs, pattern ?? eggPatterns[0]);
  save.creature = null;
  save.death = null;
  save.phase = "egg";
  save.lastSimulatedAt = nowMs;
  logEvent(save, nowMs, "Dev: spawned an egg");
}

// Wipe everything and start again. Keeps the settings and the dev clock offset,
// because nowMs is game time (real time plus that offset).
export function resetAll(old: Save, nowMs: number, seed: number): Save {
  const fresh = newSave(nowMs, seed);
  fresh.settings = { ...old.settings };
  fresh.clockOffsetMs = old.clockOffsetMs;
  return fresh;
}
