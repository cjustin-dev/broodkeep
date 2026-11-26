// Things the player can do. Each action first catches the simulation up to "now",
// so it always acts on up-to-date stats. nowMs is GAME time (see time.ts), not real time.
// Each action returns a short word saying what happened, so the screen can react.

import { fields } from "../data/fields";
import { getForm } from "../data/forms";
import { foods } from "../data/foods";
import { items } from "../data/shop";
import { spots } from "../data/habitat";
import type { SpotId } from "../data/habitat";
import { tuning } from "../data/tuning";
import { beginFight, fightRefusal, finishFight } from "./combat/fight";
import type { FightRefusal, FightResult } from "./combat/fight";
import type { Battle } from "./combat/battle";
import { cleanRefusal, feedRefusal, goRefusal, lightsRefusal, medicineRefusal } from "./availability";
import type { CleanRefusal, FeedRefusal, GoRefusal, LightsRefusal, MedicineRefusal } from "./availability";
import { dishMeal } from "./dishes";
import type { DishId } from "./dishes";
import { countCareCells, countServing, noteCare } from "./growth";
import { earnBond, isAdultSave, taper } from "./bond";
import { beginJob, endJobEarly, jobRefusal } from "./habitat/jobs";
import { hungerGrace } from "./perks";
import type { JobRefusal } from "./habitat/jobs";
import { noteRequest } from "./requests";
import { retireRefusal } from "./retire";
import type { RetireRefusal } from "./retire";
import { hatchIfReady, simulateTo } from "./sim";
import { makeRng } from "./rng";
import { clamp, logEvent, newEgg } from "./state";
import type { Creature, Save } from "./state";
import { MINUTE } from "./time";
import type { FoodId, Place } from "./types";
import { eggPatterns } from "../data/eggs";

// The living creature, after catching up. Null if there is none (egg, or dead), or if it is away
// working: care needs the creature to be at home.
function alive(save: Save, nowMs: number): Creature | null {
  simulateTo(save, nowMs);
  return save.phase === "alive" && !save.creature?.job ? save.creature : null;
}

// The living creature even if it is away (for the habitat actions).
function aliveOrAway(save: Save, nowMs: number): Creature | null {
  simulateTo(save, nowMs);
  return save.phase === "alive" ? save.creature : null;
}

export type FeedResult = "ate" | "full" | "sleeping" | "unavailable";

// What each reason to refuse is called as a result. (The reasons and their order are in availability.ts. "away" cannot reach these maps:
// alive() has already answered "unavailable" for an away creature.)
const feedWord: Record<FeedRefusal, FeedResult> = { away: "unavailable", "off-menu": "unavailable", asleep: "sleeping", full: "full" };

// `dish` is a shop food the player owns (game/dishes.ts): the meal is `foodId` (the food it is a meal of), counted the dish's way.
export function feed(save: Save, foodId: FoodId, nowMs: number, dish?: DishId): FeedResult {
  const c = alive(save, nowMs);
  if (!c) return "unavailable";
  const refusal = feedRefusal(c, foodId, dish, save.owned);
  if (refusal) return feedWord[refusal];

  const food = foods[foodId];
  const rng = makeRng(save.rngState);
  const hungerBefore = c.stats.hunger;
  const happinessBefore = c.stats.happiness;

  if (foodId === "treat") {
    // Too many treats make the creature sick. Each treat eaten lately adds to the risk.
    c.recentCandy = c.recentCandy.filter((at) => nowMs - at < tuning.sickness.candyWindowMinutes * MINUTE);
    const risk = c.recentCandy.length * tuning.sickness.candyChancePerRecent;
    if (!c.sick && risk > 0 && rng.chance(risk)) {
      c.sick = true;
      logEvent(save, nowMs, "Got sick (too many treats)");
    }
    c.recentCandy.push(nowMs);
  }

  c.stats.hunger = clamp(c.stats.hunger + food.hunger);
  c.stats.happiness = clamp(c.stats.happiness + food.happiness);
  c.stats.wellness = clamp(c.stats.wellness + food.wellness);
  const counts: Array<[FoodId, number]> = (dish !== undefined && dishMeal(c, dish)?.counts) || [[foodId, 1]]; // (a refused dish never gets here)
  for (const [counted, servings] of counts) countServing(c, counted, servings);
  countCareCells(c, hungerBefore, happinessBefore, hungerGrace(save.owned));
  noteCare(c);
  c.digestQueue.push(rng.int(food.digestMinutes[0], food.digestMinutes[1]));
  save.rngState = rng.state();
  logEvent(save, nowMs, `Ate ${dish !== undefined ? items[dish].name : food.name}`);
  noteRequest(save, { kind: "feed", food: foodId }, nowMs); // a dish meal is a meal of its food
  return "ate";
}

export type CleanResult = "cleaned" | "nothing" | "unavailable";

const cleanWord: Record<CleanRefusal, CleanResult> = { away: "unavailable", nothing: "nothing" };

export function clean(save: Save, nowMs: number): CleanResult {
  const c = alive(save, nowMs);
  if (!c) return "unavailable";
  const refusal = cleanRefusal(c);
  if (refusal) return cleanWord[refusal];
  logEvent(save, nowMs, c.poop > 0 ? `Cleaned up ${c.poop} poop` : "Cleaned the creature");
  c.poop = 0;
  c.stats.hygiene = 100;
  noteCare(c);
  return "cleaned";
}

export type MedicineResult = "cured" | "not-sick" | "unavailable";

const medicineWord: Record<MedicineRefusal, MedicineResult> = { away: "unavailable", "not-sick": "not-sick" };

// Phase 1 has unlimited medicine. A real supply comes with crafting.
export function giveMedicine(save: Save, nowMs: number): MedicineResult {
  const c = alive(save, nowMs);
  if (!c) return "unavailable";
  const refusal = medicineRefusal(c);
  if (refusal) return medicineWord[refusal];
  c.sick = false;
  c.stats.wellness = clamp(Math.max(c.stats.wellness + tuning.medicine.wellnessBoost, tuning.medicine.wellnessFloor));
  c.wellnessZeroMinutes = 0;
  noteCare(c);
  logEvent(save, nowMs, "Took medicine and got better");
  return "cured";
}

export type LightsResult = "napping" | "woke" | "not-tired" | "night" | "unavailable";

const lightsWord: Record<LightsRefusal, LightsResult> = { away: "unavailable", night: "night", "not-tired": "not-tired" };

// The lights button: put the creature down for a nap, or wake it from one.
export function toggleLights(save: Save, nowMs: number): LightsResult {
  const c = alive(save, nowMs);
  if (!c) return "unavailable";
  const refusal = lightsRefusal(c);
  if (refusal) return lightsWord[refusal];
  if (c.sleep === "nap") {
    c.sleep = null;
    logEvent(save, nowMs, "Woken from a nap");
    return "woke";
  }
  c.sleep = "nap";
  if (c.place !== "home") {
    c.place = "home"; // it naps in its own bed
    logEvent(save, nowMs, "Went home to nap");
  }
  logEvent(save, nowMs, "Went down for a nap");
  return "napping";
}

export type GoResult = "went" | "already" | "locked" | "sleeping" | "unavailable";

const goWord: Record<GoRefusal, GoResult> = { away: "unavailable", asleep: "sleeping", already: "already", locked: "locked" };

// Take the creature home or to a field. Only an open field can be visited, and only a creature that is awake and at home
// in the app (not away on a job).
export function goTo(save: Save, place: Place, nowMs: number): GoResult {
  const c = alive(save, nowMs);
  if (!c) return "unavailable";
  const refusal = goRefusal(c, place);
  if (refusal) return goWord[refusal];
  c.place = place;
  logEvent(save, nowMs, place === "home" ? "Went home" : `Went to the ${fields[place].name} field`);
  return "went";
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
  gained: number; // happiness gained (0 once the hourly limit is reached; in Adult Mode it only gets smaller, see game/bond.ts)
  asleep: boolean;
  levelUp?: number; // the Bond level just reached (Adult Mode); the key exists only when there is one
}

// Tap reactions. Petting and tickling add happiness, but only up to a limit per hour. In Adult Mode the limit is a taper that never reaches 0, and a pet or a tickle also earns
// Bond XP (docs/adult-a3-plan.md section 4); Kid Mode is the old rule, unchanged.
export function touch(save: Save, kind: TouchKind, nowMs: number): TouchResult {
  const c = alive(save, nowMs);
  if (!c) return { gained: 0, asleep: false };
  if (c.sleep) return { gained: 0, asleep: true };
  if (kind === "poke") return { gained: 0, asleep: false };
  noteCare(c); // a pet or a tickle is care even when the hourly happiness limit gives nothing more

  const a = c.affection;
  const adult = isAdultSave(save);
  // (In Adult Mode a clock that went back also restarts the window: the difference would stay negative until the clock caught up with the old end.)
  if (nowMs - a.windowStart >= tuning.affection.windowMinutes * MINUTE || (adult && nowMs < a.windowStart)) {
    a.windowStart = nowMs;
    a.gained = 0;
  }
  const want = kind === "pet" ? tuning.affection.pet : tuning.affection.tickle;
  const gained = adult ? taper(want, a.gained) : Math.max(0, Math.min(want, tuning.affection.maxGainPerWindow - a.gained));
  const underOldLimit = a.gained < tuning.affection.maxGainPerWindow; // (what the window had gained before this touch)
  a.gained += gained;
  const happinessBefore = c.stats.happiness;
  c.stats.happiness = clamp(c.stats.happiness + gained);
  // A "happy cell" counts toward growth when a touch takes happiness up to 100. The Adult taper never reaches 0, so without this a held finger would take it up to 100 again after each minute's
  // small decay and earn a cell a minute (5 cells in one hold, against about 1 an hour under the old limit; docs/decisions.md, A3.1). Past the old limit a touch still pays happiness but earns no cell.
  // (Kid Mode pays nothing past the limit, so there it changes nothing.)
  countCareCells(c, c.stats.hunger, underOldLimit ? happinessBefore : 100, hungerGrace(save.owned)); // (hunger did not change, so it cannot count, mat or no mat)
  const levelUp = adult ? earnBond(c, kind, nowMs) : null;
  if (levelUp !== null) {
    logEvent(save, nowMs, `Bond level ${levelUp}`);
    return { gained, asleep: false, levelUp };
  }
  return { gained, asleep: false };
}

// A new egg takes the creature's place (after a death, or when a grown-up retires).
function putInNewEgg(save: Save, nowMs: number): void {
  const rng = makeRng(save.rngState);
  save.egg = newEgg(nowMs, rng.pick(eggPatterns));
  save.rngState = rng.state();
  save.creature = null;
  save.death = null;
  save.phase = "egg";
  logEvent(save, nowMs, "A new egg appeared");
}

// After a death: start over with a new egg.
export function startNewEgg(save: Save, nowMs: number): boolean {
  simulateTo(save, nowMs);
  if (save.phase !== "dead") return false;
  putInNewEgg(save, nowMs);
  return true;
}

export type RetireResult = "retired" | RetireRefusal;

// A grown-up creature retires to the Book as a completed life, and the next egg starts. The Book, coins, bag and settings stay as they are.
// The rule is game/retire.ts: it reads the creature itself after the catch-up (alive() would hide an away creature as "unavailable").
export function retireCreature(save: Save, nowMs: number): RetireResult {
  simulateTo(save, nowMs);
  const refusal = retireRefusal(save);
  if (refusal) return refusal;
  const c = save.creature!; // retireRefusal found it
  // After a clock set back, game time can be earlier than the hatch time: the record never runs backwards.
  save.retired.push({ formId: c.formId, bornAt: c.bornAt, retiredAt: Math.max(nowMs, c.bornAt) });
  logEvent(save, nowMs, `${getForm(c.formId).name} retired`);
  putInNewEgg(save, nowMs);
  return "retired";
}

export type StartJobResult = "started" | JobRefusal | "unavailable";

// Send the creature to work at a habitat spot.
export function startJob(save: Save, spotId: SpotId, nowMs: number): StartJobResult {
  const c = aliveOrAway(save, nowMs);
  if (!c || !spots[spotId]) return "unavailable";
  const refusal = jobRefusal(c, spotId);
  if (refusal) return refusal;
  beginJob(save, c, spotId, nowMs);
  return "started";
}

export type CallBackResult = "called" | "nothing";

// Bring the creature home early. It brings back what the time earned (callBackHaul, rounded down), and the energy it spent is not given back.
export function callBack(save: Save, nowMs: number): CallBackResult {
  const c = aliveOrAway(save, nowMs);
  if (!c?.job) return "nothing";
  endJobEarly(save, c, nowMs);
  return "called";
}

// The player has seen the oldest finished job. Returns false if there was none.
export function dismissHaul(save: Save): boolean {
  return save.hauls.shift() !== undefined;
}

export type StartFightResult = { status: "started"; battle: Battle } | { status: FightRefusal | "unavailable" };

// Send the creature into a fight against a wild creature. The fight itself is not saved: it lives in the screen,
// and endFight puts its result into the save. Leaving without ending it costs the energy and nothing else.
export function startFight(save: Save, nowMs: number): StartFightResult {
  const c = aliveOrAway(save, nowMs);
  if (!c) return { status: "unavailable" };
  const refusal = fightRefusal(c);
  if (refusal) return { status: refusal };
  return { status: "started", battle: beginFight(save, c, nowMs) };
}

// Put a finished fight into the save. Returns what it paid, or null if the fight is not over or the creature is gone.
export function endFight(save: Save, battle: Battle, nowMs: number): FightResult | null {
  const c = aliveOrAway(save, nowMs);
  if (!c) return null;
  return finishFight(save, c, battle, nowMs);
}
