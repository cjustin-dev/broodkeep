// Picks which form a creature grows into. The rules are written in the data files
// (each form's evolvesTo list). This file only reads them.

import { getForm } from "../data/forms";
import { METRICS, metricValue } from "./metrics";
import type { Creature } from "./state";
import type { Evolution, Metric, Need } from "./types";
import { MINUTE } from "./time";

const metricKeys = Object.keys(METRICS) as Metric[];

// One line of a rule, ready to show: "strength 12 of at least 40".
export interface NeedRow {
  metric: Metric;
  label: string;
  have: number;
  min?: number;
  max?: number;
  pass: boolean;
  tracked: boolean; // false: the system that counts this does not exist yet, so it reads 0
}

export function describeNeed(need: Need, creature: Creature): NeedRow[] {
  const rows: NeedRow[] = [];
  for (const metric of metricKeys) {
    const min = need[`${metric}Min`];
    const max = need[`${metric}Max`];
    if (min === undefined && max === undefined) continue;
    const have = metricValue(creature, metric);
    const pass = (min === undefined || have >= min) && (max === undefined || have <= max);
    rows.push({ metric, label: METRICS[metric].label, have, min, max, pass, tracked: METRICS[metric].tracked });
  }
  return rows;
}

// One rule as a line of text for the dev tree viewer, e.g. "✗ strength: 12 (need at least 40)".
export function ruleText(row: NeedRow): string {
  const want =
    row.min !== undefined && row.max !== undefined
      ? `${row.min} to ${row.max}`
      : row.min !== undefined
        ? `at least ${row.min}`
        : `at most ${row.max}`;
  const have = String(Math.round(row.have * 100) / 100); // 72.5, 69.96, 50
  return `${row.pass ? "✓" : "✗"} ${row.label}: ${have} (need ${want})${row.tracked ? "" : ", not in the game yet"}`;
}

export function needMet(need: Need, creature: Creature): boolean {
  return describeNeed(need, creature).every((row) => row.pass);
}

// Paths with a "need" are tried in the order they are listed, and the first match wins.
// If none match, the path with no "need" is the fallback.
function pickPath(paths: Evolution[], creature: Creature): Evolution | null {
  const match = paths.find((evo) => evo.need !== undefined && needMet(evo.need, creature));
  return match ?? paths.find((evo) => evo.need === undefined) ?? null;
}

// The evolution that happens now, or null if it is too early or the form has no next stage.
export function chooseEvolution(creature: Creature, nowMs: number): Evolution | null {
  const form = getForm(creature.formId);
  const minutesInStage = (nowMs - creature.stageStartedAt) / MINUTE;
  return pickPath(
    form.evolvesTo.filter((evo) => minutesInStage >= evo.minHours * 60),
    creature,
  );
}

// Every path out of the creature's form with how each rule stands, for the dev tree viewer.
export interface PathStatus {
  evo: Evolution;
  hoursInStage: number;
  rows: NeedRow[]; // empty for the fallback
  fallback: boolean;
  leading: boolean; // the path that would win if the time were up
}

export function describePaths(creature: Creature, nowMs: number): PathStatus[] {
  const form = getForm(creature.formId);
  const leading = pickPath(form.evolvesTo, creature);
  const hoursInStage = (nowMs - creature.stageStartedAt) / MINUTE / 60;
  return form.evolvesTo.map((evo) => ({
    evo,
    hoursInStage,
    rows: evo.need ? describeNeed(evo.need, creature) : [],
    fallback: evo.need === undefined,
    leading: evo === leading,
  }));
}
