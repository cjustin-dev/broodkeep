// The day's count of training sessions (docs/adult-a3-plan.md section 10, decisions 9 and 10): how a stored count is read from storage, which day it counts for and which reward tier the next session earns.
// A file of its own so that state.ts (the loader) can use it: game/training.ts imports state.ts, and a cycle between the two would be fragile.

import { trainTuning } from "../data/training";
import type { Creature } from "./state";
import type { CombatStat } from "./types";

const t = trainTuning;

const STAT_KEYS: CombatStat[] = ["vit", "str", "def", "spi", "spd"];

// A `training` read from storage or the cloud: a whole, well-formed one or nothing at all (never half of it). Other keys are ignored.
export function coerceTraining(value: unknown): Creature["training"] | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const v = value as Record<string, unknown>;
  if (!Object.hasOwn(v, "day") || !Object.hasOwn(v, "sessions")) return undefined;
  const { day, sessions } = v;
  if (typeof day !== "number" || !Number.isInteger(day) || day < 0) return undefined;
  if (typeof sessions !== "object" || sessions === null || Array.isArray(sessions)) return undefined;
  const out: Partial<Record<CombatStat, number>> = {};
  for (const [key, count] of Object.entries(sessions)) {
    if (!STAT_KEYS.includes(key as CombatStat)) return undefined;
    if (typeof count !== "number" || !Number.isInteger(count) || count < 0 || count > t.countMax) return undefined;
    out[key as CombatStat] = count;
  }
  return { day, sessions: out };
}

// The count of a stat's sessions for `today`, and the day it is kept under. A day before today starts again; today adds; tomorrow (a clock set back a day, or a trip west) keeps the
// counts and the day, so a one day set-back never refills the full-reward sessions; more than a day ahead is treated as damaged and starts again, so one device with a wrong clock
// cannot lock the rewards everywhere for years. (A deliberate set-back of two days or more does refill them: the sessions pace the game, they are not a protected score.)
export function trainedToday(c: Creature, stat: CombatStat, today: number): { day: number; count: number } {
  const have = c.training;
  if (!have || have.day < today || have.day > today + 1) return { day: today, count: 0 };
  return { day: have.day, count: have.sessions[stat] ?? 0 };
}

export type Tier = "full" | "half" | "none";

// The reward tier of the next session, from the number already counted today.
export const tierOf = (count: number): Tier => (count < t.full ? "full" : count < t.full + t.half ? "half" : "none");
