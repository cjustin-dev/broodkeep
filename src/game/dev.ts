// Developer mode tools. They bend the rules on purpose, so the family can test things
// without waiting days. Nothing here is used in normal play.

import { eggPatterns } from "../data/eggs";
import { getForm } from "../data/forms";
import { combatTuning } from "../data/combat";
import { tuning } from "../data/tuning";
import { discover } from "./book";
import { rungOf } from "./combat/fight";
import { currentHp, maxHp } from "./combat/stats";
import { makeCreature, evolveTo, simulateTo } from "./sim";
import { clamp, logEvent, newEgg, newSave } from "./state";
import type { Save, Stats } from "./state";
import { HOUR, gameNow } from "./time";
import type { EggPattern, FieldId, FoodId, Place } from "./types";

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

const wholeNumber = (value: number, max: number): number => (Number.isFinite(value) ? Math.max(0, Math.min(max, Math.round(value))) : 0);

// Set the numbers growth reads (docs/paradise-plan.md section 2), so every path in the tree can be tested without waiting.
// They reset at each evolution, like the real ones.
export function setFieldMinutes(save: Save, field: FieldId, minutes: number): void {
  if (save.creature) save.creature.counters.fieldMinutes[field] = wholeNumber(minutes, 999);
}

export function setServings(save: Save, food: FoodId, servings: number): void {
  if (save.creature) save.creature.counters.servings[food] = wholeNumber(servings, 99);
}

export function setCareCounter(save: Save, which: "hungerCells" | "happyCells" | "careMistakes", value: number): void {
  if (save.creature) save.creature.counters[which] = wholeNumber(value, which === "careMistakes" ? 99 : tuning.growth.careCellsMax);
}

// Move the creature to a place without the checks the real action makes (a sleeping creature, a locked field).
export function setPlace(save: Save, place: Place): void {
  if (save.creature) save.creature.place = place;
}

// Set battle HP as a share of the maximum (0 to 100). Full means "never hurt".
export function setHpPercent(save: Save, percent: number): void {
  const c = save.creature;
  if (!c) return;
  const share = Math.min(100, Math.max(0, Number.isFinite(percent) ? percent : 100)) / 100;
  if (share >= 1) delete c.hp;
  else c.hp = Math.round(maxHp(c) * share);
}

export function hpPercent(save: Save): number {
  const c = save.creature;
  return c ? Math.round((currentHp(c) / maxHp(c)) * 100) : 100;
}

// Put the creature on a rung of the fight ladder (1 up to the boss), so the boss can be tested without winning up to it.
export function setRung(save: Save, rung: number): void {
  const c = save.creature;
  if (!c) return;
  const top = combatTuning.ladder.length;
  const next = Math.min(top, Math.max(1, Math.round(Number.isFinite(rung) ? rung : 1)));
  if (next === 1) delete c.rung;
  else c.rung = next;
}

export function rungNumber(save: Save): number {
  return save.creature ? rungOf(save.creature) : 1;
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
  save.creature = makeCreature(formId, nowMs, save.egg?.pattern ?? save.creature?.eggPattern);
  save.egg = null;
  save.death = null;
  save.phase = "alive";
  logEvent(save, nowMs, `Dev: hatched ${formId}`);
  discover(save, formId, nowMs); // by itself: the kid and the young it would have grown from were not raised
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
