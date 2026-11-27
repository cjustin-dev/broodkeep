// Care rules: what happens to a living creature during ONE minute of game time.
// The simulation (sim.ts) calls stepCare once for every minute that passes,
// whether the app is open or was closed for a week.

import { tuning } from "../data/tuning";
import type { Rng } from "./rng";
import { clamp, logEvent } from "./state";
import type { CallKind, Creature, Save } from "./state";
import { bedFactor } from "./perks";
import type { Owned } from "./perks";
import { hourOf, isNightHour, realClock } from "./time";

// Stat loss per awake minute, worked out from "hours to empty" in tuning.ts.
const perMinute = (hours: number): number => 100 / (hours * 60);
const rate = {
  hunger: perMinute(tuning.emptyAfterAwakeHours.hunger),
  happiness: perMinute(tuning.emptyAfterAwakeHours.happiness),
  energy: perMinute(tuning.emptyAfterAwakeHours.energy),
  hygiene: perMinute(tuning.emptyAfterAwakeHours.hygiene),
};

// `clockMs` is the real-clock moment whose hour of day this minute reads (bedtime): by default this minute's own time on the real clock; the dev tools pass the real now for a stretch they compress.
export function stepCare(save: Save, rng: Rng, t: number, clockMs: number = realClock(save, t)): void {
  const c = save.creature;
  if (!c) return;
  updateSleep(save, c, t, clockMs);
  const asleep = c.sleep !== null;
  decayStats(c, asleep, save.owned);
  digest(save, c, t);
  checkSickness(save, c, rng, asleep, t);
  updateWellness(save, c, asleep, t);
  if (save.phase !== "alive") return; // it may have just died
  updateCalls(save, c, asleep, t);
}

// Night sleep follows the real clock, not the sped-up game clock (dev mode). Naps end when energy is full.
function updateSleep(save: Save, c: Creature, t: number, clockMs: number): void {
  const { sleepStartHour, sleepEndHour } = save.settings;
  const night = isNightHour(hourOf(clockMs), sleepStartHour, sleepEndHour);
  if (night) {
    if (c.sleep !== "night") {
      c.sleep = "night";
      if (c.place !== "home") {
        c.place = "home"; // it sleeps in its own bed
        logEvent(save, t, "Went home to sleep");
      }
      logEvent(save, t, "Fell asleep for the night");
    }
  } else if (c.sleep === "night") {
    c.sleep = null;
    logEvent(save, t, "Woke up");
  } else if (c.sleep === "nap" && c.stats.energy >= tuning.napWakeAtEnergy) {
    c.sleep = null;
    logEvent(save, t, "Woke up from a nap");
  }
}

// The four stats that change by themselves every minute (wellness has its own rules, see updateWellness).
export type DrainStat = "hunger" | "happiness" | "hygiene" | "energy";

// What ONE minute does to a stat before it is held between 0 and 100: negative while it runs down, positive for energy while asleep. `owned` is the
// shop's list (save.owned): a Comfy Bed slows happiness while the creature sleeps at home (not while away on a job, where it is not in its bed).
// decayStats uses this, and so does the adult HUD (game/hud.ts) for "empty in", so what the screen says is what the simulation does.
export function statChangePerMinute(c: Creature, stat: DrainStat, asleep: boolean, owned: Owned = []): number {
  const slow = asleep ? tuning.asleepDecayFactor : 1;
  switch (stat) {
    case "hunger":
      return -rate.hunger * slow;
    case "happiness":
      return -rate.happiness * slow * (asleep && !c.job ? bedFactor(owned) : 1);
    case "hygiene":
      return -((rate.hygiene + c.poop * tuning.poopHygieneDrainPerMinute) * slow);
    case "energy":
      return asleep ? tuning.sleepEnergyPerMinute : -rate.energy;
  }
}

function decayStats(c: Creature, asleep: boolean, owned: Owned): void {
  const s = c.stats;
  for (const stat of ["hunger", "happiness", "hygiene", "energy"] as const) {
    s[stat] = clamp(s[stat] + statChangePerMinute(c, stat, asleep, owned));
  }
}

// Food turns into poop after a while.
function digest(save: Save, c: Creature, t: number): void {
  if (c.digestQueue.length === 0) return;
  c.digestQueue = c.digestQueue.map((minutes) => minutes - 1);
  const done = c.digestQueue.filter((minutes) => minutes <= 0).length;
  if (done === 0) return;
  c.digestQueue = c.digestQueue.filter((minutes) => minutes > 0);
  c.poop = Math.min(tuning.maxPoop, c.poop + done);
  logEvent(save, t, `Pooped (${c.poop} on the floor)`);
}

// Poop left lying around, or a filthy creature, can make it sick. Only while awake.
function checkSickness(save: Save, c: Creature, rng: Rng, asleep: boolean, t: number): void {
  if (c.sick || asleep) return;
  let chance = 0;
  if (c.poop >= 2) chance += (c.poop - 1) * tuning.sickness.perExtraPoopChance;
  if (c.stats.hygiene <= 0) chance += tuning.sickness.hygieneZeroChance;
  if (chance > 0 && rng.chance(chance)) {
    c.sick = true;
    logEvent(save, t, "Got sick (dirty surroundings)");
  }
}

function updateWellness(save: Save, c: Creature, asleep: boolean, t: number): void {
  const s = c.stats;
  const w = tuning.wellness;
  let drain = 0;
  if (c.sick) drain += w.sickDrain;
  if (s.hunger <= 0) drain += w.starvingDrain;
  if (s.hygiene <= 0) drain += w.dirtyDrain;
  if (s.energy <= 0) drain += w.exhaustedDrain;
  if (drain > 0) {
    s.wellness -= drain * (asleep ? w.asleepDrainFactor : 1);
  } else if (!c.sick && s.hunger > w.healthyHungerAbove && s.hygiene > w.healthyHygieneAbove) {
    s.wellness += w.regen;
  }
  s.wellness = clamp(s.wellness);

  if (!c.sick && s.wellness < w.sickBelow) {
    c.sick = true;
    logEvent(save, t, "Got sick (wellness too low)");
  }

  if (s.wellness <= 0) {
    c.wellnessZeroMinutes += 1;
    if (c.wellnessZeroMinutes >= tuning.deathAfterWellnessZeroMinutes) {
      const cause = s.hunger <= 0 ? "hunger" : c.sick ? "sickness" : "neglect";
      save.phase = "dead";
      save.death = { at: t, cause };
      c.call = null;
      c.sleep = null;
      logEvent(save, t, `Died (${cause})`);
    }
  } else {
    c.wellnessZeroMinutes = 0;
  }
}

// The one thing the creature wants most right now, if anything.
export function wantedCall(c: Creature): CallKind | null {
  const k = tuning.calls;
  if (c.sick) return "sick";
  if (c.stats.hunger < k.hungryBelow) return "hungry";
  if (c.poop >= k.dirtyPoopAtLeast || c.stats.hygiene < k.dirtyHygieneBelow) return "dirty";
  if (c.stats.happiness < k.sadBelow) return "sad";
  if (c.stats.energy < k.sleepyBelow) return "sleepy";
  return null;
}

// A call that goes unanswered for too long is a care mistake.
// Calls do not run while asleep, so bedtime never counts as neglect. The unanswered
// timer starts over after waking (it is not paused), which is the gentler choice.
function updateCalls(save: Save, c: Creature, asleep: boolean, t: number): void {
  if (asleep) {
    c.call = null;
    c.callMinutes = 0;
    return;
  }
  const want = wantedCall(c);
  if (want !== c.call) {
    c.call = want;
    c.callMinutes = 0;
    if (want) logEvent(save, t, `Calling: ${want}`);
  } else if (want) {
    c.callMinutes += 1;
    if (c.callMinutes >= tuning.calls.patienceMinutes) {
      c.callMinutes = 0;
      c.counters.careMistakes += 1;
      c.counters.mistakeLog = [...(c.counters.mistakeLog ?? []), { at: t, call: want }].slice(-tuning.calls.mistakeLogMax);
      logEvent(save, t, `Care mistake: "${want}" went unanswered (${c.counters.careMistakes} this stage)`);
    }
  }
}
