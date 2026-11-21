// Picks which form a creature grows into. The rules are written in the data files
// (each form's evolvesTo list). This file only reads them.

import { getForm } from "../data/forms";
import type { Counters } from "./state";
import type { Creature } from "./state";
import type { Evolution, Need } from "./types";
import { MINUTE } from "./time";

// Average happiness while awake in this stage. A stage with no awake time counts as 50.
export function happinessAverage(counters: Counters): number {
  return counters.happinessMinutes === 0 ? 50 : counters.happinessSum / counters.happinessMinutes;
}

export function needMet(need: Need, counters: Counters): boolean {
  if (need.careMistakesMax !== undefined && counters.careMistakes > need.careMistakesMax) return false;
  if (need.careMistakesMin !== undefined && counters.careMistakes < need.careMistakesMin) return false;
  if (need.happinessAvgMin !== undefined && happinessAverage(counters) < need.happinessAvgMin) return false;
  return true;
}

// The evolution that happens now, or null if it is too early or the form has no next stage.
// Paths with a "need" are tried in the order they are listed, and the first match wins.
// If none match, the path with no "need" is the fallback.
export function chooseEvolution(creature: Creature, nowMs: number): Evolution | null {
  const form = getForm(creature.formId);
  const minutesInStage = (nowMs - creature.stageStartedAt) / MINUTE;
  const open = form.evolvesTo.filter((evo) => minutesInStage >= evo.minHours * 60);
  const match = open.find((evo) => evo.need !== undefined && needMet(evo.need, creature.counters));
  return match ?? open.find((evo) => evo.need === undefined) ?? null;
}
