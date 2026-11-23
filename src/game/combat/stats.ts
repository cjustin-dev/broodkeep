// Combat stats: a form's base stats plus the points a creature has trained, and the HP that follows from them.

import { combatTuning } from "../../data/combat";
import { getForm } from "../../data/forms";
import type { Creature } from "../state";
import type { CombatStat } from "../types";

// What a creature's stat is right now: its form's base plus what it trained.
export function statTotal(c: Creature, stat: CombatStat): number {
  return getForm(c.formId).baseStats[stat] + (c.trained?.[stat] ?? 0);
}

export function maxHp(c: Creature): number {
  return Math.round(statTotal(c, "vit") * combatTuning.hpPerVit);
}

// Battle HP right now (a creature that never fought is at full HP).
export function currentHp(c: Creature): number {
  const max = maxHp(c);
  return Math.min(max, Math.max(0, c.hp ?? max));
}

// Add trained points to a stat, never past the cap for its stage. Returns how many were really added.
export function addTrained(c: Creature, stat: CombatStat, points: number): number {
  const cap = combatTuning.trainedCap[getForm(c.formId).stage];
  const have = c.trained?.[stat] ?? 0;
  const next = Math.min(cap, have + points);
  if (next > have) c.trained = { ...c.trained, [stat]: next };
  return Math.max(0, next - have);
}
