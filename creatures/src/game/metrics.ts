// The numbers evolution rules are written in. Each one is read from the creature right now.
// "tracked" metrics are counted by the game today. The others belong to systems that come in
// later phases (training today). They read as 0 until then, and dev mode can set them
// (counters.later) so every path in the tree can still be tested. Dev mode can also add to a
// counted one (jobs, battles, stats); the number shown is the real count plus what it added.
// Discipline is the exception: it is a real stat that nothing raises yet, so it is read from the
// stat and dev mode sets it with the Discipline slider.

import { statTotal } from "./combat/stats";
import type { Creature } from "./state";
import type { Metric } from "./types";

export const METRICS: Record<Metric, { label: string; tracked: boolean }> = {
  careMistakes: { label: "care mistakes", tracked: true },
  happinessAvg: { label: "average happiness", tracked: true },
  neglectHours: { label: "hours with a call unanswered", tracked: true },
  discipline: { label: "discipline", tracked: false },
  food: { label: "food eaten", tracked: true },
  berries: { label: "berries eaten", tracked: true },
  meat: { label: "meat eaten", tracked: true },
  fish: { label: "fish eaten", tracked: true },
  candy: { label: "candy eaten", tracked: true },
  training: { label: "training sessions", tracked: false },
  battles: { label: "battles fought", tracked: true },
  wins: { label: "battles won", tracked: true },
  chores: { label: "chores and jobs done", tracked: true },
  strength: { label: "strength", tracked: true },
  defense: { label: "defense", tracked: true },
  spirit: { label: "spirit", tracked: true },
};

export type LaterMetric = "training" | "battles" | "wins" | "chores" | "strength" | "defense" | "spirit";
export const laterMetrics: LaterMetric[] = ["training", "battles", "wins", "chores", "strength", "defense", "spirit"];

// What the game really counted for a metric, before dev mode adds anything. Only training is not counted yet.
export function countedValue(creature: Creature, metric: Metric): number {
  const c = creature.counters;
  switch (metric) {
    case "chores":
      return c.chores ?? 0;
    case "battles":
      return c.battles ?? 0;
    case "wins":
      return c.wins ?? 0;
    case "strength":
      return statTotal(creature, "str"); // the form's base plus what it trained
    case "defense":
      return statTotal(creature, "def");
    case "spirit":
      return statTotal(creature, "spi");
    default:
      return 0;
  }
}

// Average happiness while awake in this stage. A stage with no awake time counts as 50.
export function happinessAverage(counters: Creature["counters"]): number {
  return counters.happinessMinutes === 0 ? 50 : counters.happinessSum / counters.happinessMinutes;
}

// The value of one metric for this creature right now.
export function metricValue(creature: Creature, metric: Metric): number {
  const c = creature.counters;
  switch (metric) {
    case "careMistakes":
      return c.careMistakes;
    case "happinessAvg":
      return happinessAverage(c);
    case "neglectHours":
      return c.neglectMinutes / 60;
    case "discipline":
      return creature.stats.discipline;
    case "food":
      return c.foodEaten.berry + c.foodEaten.meat + c.foodEaten.fish + c.foodEaten.candy;
    case "berries":
      return c.foodEaten.berry;
    case "meat":
      return c.foodEaten.meat;
    case "fish":
      return c.foodEaten.fish;
    case "candy":
      return c.foodEaten.candy;
    default:
      return countedValue(creature, metric) + (c.later?.[metric as LaterMetric] ?? 0); // counted for real, plus whatever dev mode added
  }
}
