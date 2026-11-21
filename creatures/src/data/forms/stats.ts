// Base stats are not written by hand: a stage sets the total (the budget) and the role sets how it is split.
// The care tier an adult was raised to does not change its stats.
import type { CombatStat, Role, Stage } from "../../game/types";

// The average total of the old forms at the stage each one became, worked out from the old data on 2026-11-21 so fights stay
// about where they were: baby 19.5, training 28.7 (now kid), rookie 43.8 (now young), champion and ultimate together 92.6 (now adult).
export const stageBudget: Record<Stage, number> = { baby: 20, kid: 29, young: 44, adult: 93 };

export const STATS: CombatStat[] = ["vit", "str", "def", "spi", "spd"];

// How each role splits a budget, in parts of a hundred (each row adds up to 100).
export const roleParts: Record<Role, Record<CombatStat, number>> = {
  fighter: { vit: 22, str: 30, def: 18, spi: 10, spd: 20 },
  tank: { vit: 28, str: 17, def: 30, spi: 9, spd: 16 },
  caster: { vit: 20, str: 10, def: 14, spi: 38, spd: 18 },
  quick: { vit: 20, str: 20, def: 12, spi: 14, spd: 34 },
};

// Whole numbers that add up to the budget exactly: each stat is rounded down, then the leftover points go to the
// stats with the biggest fractions (ties go to the earlier stat in the list above).
export function derivedStats(stage: Stage, role: Role): Record<CombatStat, number> {
  const budget = stageBudget[stage];
  const exact = STATS.map((stat) => (budget * roleParts[role][stat]) / 100);
  const whole = exact.map(Math.floor);
  let left = budget - whole.reduce((sum, n) => sum + n, 0);
  const byFraction = STATS.map((_, i) => i).sort((a, b) => exact[b]! - whole[b]! - (exact[a]! - whole[a]!) || a - b);
  for (const i of byFraction) {
    if (left <= 0) break;
    whole[i] = whole[i]! + 1;
    left -= 1;
  }
  return Object.fromEntries(STATS.map((stat, i) => [stat, whole[i]!])) as Record<CombatStat, number>;
}
