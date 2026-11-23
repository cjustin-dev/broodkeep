// Why a button did nothing, in words (Adult Mode shows these as a note over the room). Pure, no screen code, so tests can read every sentence.
// Every number comes from the rule that refused: the thresholds from tuning.ts, habitat.ts and combat.ts, the creature's own stats shown
// rounded down like the header (so "food is 94" and "refuses food at 95" never contradict each other). The away, night and nap pieces are the
// context line's own (hud.ts), so the two never word the same fact differently.

import { combatTuning } from "../data/combat";
import { fields } from "../data/fields";
import { habitatTuning, spots } from "../data/habitat";
import type { SpotId } from "../data/habitat";
import { specialId } from "../data/special";
import { tuning } from "../data/tuning";
import { cleanAtHygiene } from "./availability";
import type { CleanRefusal, FeedRefusal, GoRefusal, LightsRefusal, MedicineRefusal } from "./availability";
import type { FightRefusal } from "./combat/fight";
import type { JobRefusal } from "./habitat/jobs";
import { backText, napText, shownValue, stageLabel, wakeText } from "./hud";
import type { Creature, Save } from "./state";
import type { Place, Stage } from "./types";

export const stageWord = (stage: Stage): string => stage[0]!.toUpperCase() + stage.slice(1);

// "Away at Pond: back in 2:31. Care waits until it is home."
function awayReason(c: Creature, nowMs: number): string {
  if (!c.job) return "Away: care waits until it is home.";
  return `Away at ${spots[c.job.spot].name}: ${backText(c.job, nowMs)}. Care waits until it is home.`;
}

// "Asleep: wakes 7 am (in 2:14)." or "Napping: wakes when rested (energy 41 of 100)."
function asleepReason(save: Save, c: Creature, nowMs: number): string {
  if (c.sleep === "nap") return `Napping: ${napText(c)}.`;
  const wake = wakeText(save, nowMs);
  return wake === null ? "Asleep." : `Asleep: ${wake}.`;
}

export function feedReason(save: Save, c: Creature, code: FeedRefusal, nowMs: number): string {
  if (code === "away") return awayReason(c, nowMs);
  if (code === "asleep") return asleepReason(save, c, nowMs);
  if (code === "off-menu") return "That food is not on its menu.";
  return `Not hungry: food is ${shownValue(c.stats.hunger)} of 100. It refuses food at ${tuning.fullAtHunger} or more.`;
}

export function cleanReason(c: Creature, code: CleanRefusal, nowMs: number): string {
  if (code === "away") return awayReason(c, nowMs);
  return `Nothing to clean: no poop, and hygiene is ${shownValue(c.stats.hygiene)} (cleaning starts below ${cleanAtHygiene}).`;
}

export function lightsReason(save: Save, c: Creature, code: LightsRefusal, nowMs: number): string {
  if (code === "away") return awayReason(c, nowMs);
  if (code === "night") {
    const wake = wakeText(save, nowMs);
    return wake === null ? "Night sleep follows the clock." : `Night sleep follows the clock: ${wake}.`;
  }
  return `Not tired: energy is ${shownValue(c.stats.energy)}. It naps below ${tuning.napBelowEnergy}.`;
}

export function medicineReason(c: Creature, code: MedicineRefusal, nowMs: number): string {
  if (code === "away") return awayReason(c, nowMs);
  return "Not sick: medicine only works on a sick creature.";
}

export function goReason(save: Save, c: Creature, code: GoRefusal, place: Place, nowMs: number): string {
  if (code === "away") return awayReason(c, nowMs);
  if (code === "asleep") return asleepReason(save, c, nowMs);
  if (code === "already") return place === "home" ? "Already at home." : `Already at the ${fields[place].name} field.`;
  return `The ${place === "home" ? "home" : fields[place].name} field is not open yet.`;
}

// A trip to a spot needs the spot's cost on top of the floor the energy may not fall below.
export const energyNeededForSpot = (spot: SpotId): number => spots[spot].energyCost + habitatTuning.energyFloor;
export const energyNeededForFight = (): number => combatTuning.energyCost + combatTuning.energyFloor;

export function spotReason(save: Save, c: Creature, code: JobRefusal, spot: SpotId, nowMs: number): string {
  const name = spots[spot].name;
  if (code === "busy") return awayReason(c, nowMs);
  if (code === "asleep") return asleepReason(save, c, nowMs);
  if (code === "sick") return "Sick: it needs medicine before it can work.";
  if (code === "too-young") {
    const opens = `Too young for ${name}: it opens at ${stageWord(spots[spot].minStage)}`;
    return c.formId === specialId ? `${opens}, and a Special grows no further.` : `${opens} (now: ${stageLabel(c)}).`;
  }
  return `Too tired for ${name}: it needs energy ${energyNeededForSpot(spot)} to go (it has ${shownValue(c.stats.energy)}).`;
}

export function fightReason(save: Save, c: Creature, code: FightRefusal, nowMs: number): string {
  if (code === "busy") return awayReason(c, nowMs);
  if (code === "asleep") return asleepReason(save, c, nowMs);
  if (code === "sick") return "Sick: it needs medicine before it can fight.";
  if (code === "too-young") return `Too young to fight: it starts at ${stageWord(combatTuning.minStage)} (now: ${stageLabel(c)}).`;
  return `Too tired to fight: it needs energy ${energyNeededForFight()} (it has ${shownValue(c.stats.energy)}).`;
}
