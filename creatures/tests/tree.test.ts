// Checks on the whole evolution tree (all 20 forms), and on how its rules read a creature.
import { describe, expect, it } from "vitest";
import { hatchTable } from "../src/data/eggs";
import { forms } from "../src/data/forms";
import { chooseEvolution, describeNeed, describePaths, needMet, ruleText } from "../src/game/evolution";
import { METRICS, metricValue } from "../src/game/metrics";
import type { LaterMetric } from "../src/game/metrics";
import { makeCreature } from "../src/game/sim";
import type { Creature } from "../src/game/state";
import { HOUR } from "../src/game/time";
import type { Metric, Need, Stage } from "../src/game/types";
import { at } from "./helpers";

const stages: Stage[] = ["baby", "training", "rookie", "champion", "ultimate"];
const hoursForStage: Record<Stage, number | null> = { baby: 6, training: 24, rookie: 72, champion: 120, ultimate: null };
const all = Object.values(forms);

// A creature whose numbers sit exactly on a rule: a Min is met with the smallest value, a Max with 0.
function creatureMeeting(need: Need, formId = "blip"): Creature {
  const c = makeCreature(formId, 0);
  for (const metric of Object.keys(METRICS) as Metric[]) {
    const min = need[`${metric}Min`];
    const value = min ?? (need[`${metric}Max`] !== undefined ? 0 : undefined);
    if (value === undefined) continue;
    switch (metric) {
      case "careMistakes":
        c.counters.careMistakes = value;
        break;
      case "happinessAvg":
        c.counters.happinessMinutes = 100;
        c.counters.happinessSum = value * 100;
        break;
      case "neglectHours":
        c.counters.neglectMinutes = value * 60;
        break;
      case "discipline":
        c.stats.discipline = value;
        break;
      case "food":
        c.counters.foodEaten.berry = value;
        break;
      case "berries":
        c.counters.foodEaten.berry = value;
        break;
      case "meat":
        c.counters.foodEaten.meat = value;
        break;
      case "fish":
        c.counters.foodEaten.fish = value;
        break;
      case "candy":
        c.counters.foodEaten.candy = value;
        break;
      default:
        c.counters.later = { ...c.counters.later, [metric as LaterMetric]: value };
    }
  }
  return c;
}

describe("the tree's shape", () => {
  it("has the 20 forms from the plan: 2 babies, 3 in training, 5 rookies, 5 champions, 5 ultimates", () => {
    expect(all).toHaveLength(20);
    const count = (stage: Stage): number => all.filter((f) => f.stage === stage).length;
    expect(stages.map(count)).toEqual([2, 3, 5, 5, 5]);
  });

  it("every path leads one stage up, to a form that exists", () => {
    for (const form of all) {
      for (const evo of form.evolvesTo) {
        const target = forms[evo.to];
        expect(target, `${form.id} -> ${evo.to}`).toBeDefined();
        expect(stages.indexOf(target!.stage), `${form.id} -> ${evo.to}`).toBe(stages.indexOf(form.stage) + 1);
      }
    }
  });

  it("every form below ultimate has paths, with exactly one fallback and it comes last", () => {
    for (const form of all) {
      if (form.stage === "ultimate") {
        expect(form.evolvesTo, form.id).toEqual([]);
        continue;
      }
      const noNeed = form.evolvesTo.filter((evo) => evo.need === undefined);
      expect(noNeed, `${form.id} fallbacks`).toHaveLength(1);
      expect(form.evolvesTo[form.evolvesTo.length - 1]?.need, `${form.id} fallback is last`).toBeUndefined();
    }
  });

  it("every path opens after its stage's length (6, 24, 72 and 120 hours)", () => {
    for (const form of all) for (const evo of form.evolvesTo) expect(evo.minHours, `${form.id} -> ${evo.to}`).toBe(hoursForStage[form.stage]);
  });

  it("every form can be reached: babies from an egg, everything else from a path", () => {
    const hatchable = new Set(Object.values(hatchTable).flat());
    const pointedAt = new Set(all.flatMap((f) => f.evolvesTo.map((evo) => evo.to)));
    for (const form of all) {
      const reachable = form.stage === "baby" ? hatchable.has(form.id) : pointedAt.has(form.id);
      expect(reachable, form.id).toBe(true);
    }
  });

  it("every rule only uses real metrics, with whole non-negative numbers", () => {
    for (const form of all) {
      for (const evo of form.evolvesTo) {
        for (const [key, value] of Object.entries(evo.need ?? {})) {
          const metric = key.replace(/(Min|Max)$/, "");
          expect(Object.keys(METRICS), `${form.id} -> ${evo.to}: ${key}`).toContain(metric);
          expect(key).toMatch(/(Min|Max)$/);
          expect(Number.isFinite(value) && value >= 0, `${form.id} -> ${evo.to}: ${key}`).toBe(true);
        }
      }
    }
  });
});

describe("no path is dead", () => {
  it("a creature that sits exactly on a path's rule takes that path, not an earlier one", () => {
    for (const form of all) {
      for (const evo of form.evolvesTo) {
        if (!evo.need) continue;
        const c = creatureMeeting(evo.need, form.id);
        expect(needMet(evo.need, c), `${form.id} -> ${evo.to} meets its own rule`).toBe(true);
        const picked = describePaths(c, at(8) + 500 * HOUR).find((p) => p.leading);
        expect(picked?.evo, `${form.id} -> ${evo.to} is shadowed by an earlier path`).toBe(evo);
      }
    }
  });

  it("a creature that meets no rule takes the fallback", () => {
    for (const form of all) {
      if (form.evolvesTo.length === 0) continue;
      const c = makeCreature(form.id, 0);
      const picked = chooseEvolution(c, 500 * HOUR);
      expect(picked?.need, form.id).toBeUndefined();
    }
  });
});

describe("the plan's examples", () => {
  const stageEnd = (id: string): number => forms[id]!.evolvesTo[0]!.minHours * HOUR;
  const picked = (c: Creature): string | undefined => chooseEvolution(c, stageEnd(c.formId))?.to;

  it("a baby: neglect gives Smudge, lots of feeding gives Nubbin, otherwise Pip", () => {
    const c = makeCreature("blip", 0);
    expect(picked(c)).toBe("pip");
    c.counters.foodEaten.meat = 5;
    expect(picked(c)).toBe("nubbin");
    c.counters.careMistakes = 3;
    expect(picked(c)).toBe("smudge"); // neglect comes first
  });

  it("a Drip only grows into Nubbin through training, as in the plan (feeding does not count for it)", () => {
    const c = makeCreature("drip", 0);
    c.counters.foodEaten.meat = 8;
    expect(picked(c)).toBe("pip");
    c.counters.later = { training: 3 };
    expect(picked(c)).toBe("nubbin");
  });

  it("a Smudge that turned around becomes Mothlet, and one that did not becomes Grumblot", () => {
    const c = makeCreature("smudge", 0);
    expect(picked(c)).toBe("grumblot");
    c.counters.happinessMinutes = 100;
    c.counters.happinessSum = 8000;
    expect(picked(c)).toBe("mothlet");
    c.counters.careMistakes = 2;
    expect(picked(c)).toBe("grumblot");
  });

  it("a well loved Mothlet becomes Lumiwing and a neglected one Gloomtoad", () => {
    const c = makeCreature("mothlet", 0);
    c.counters.happinessMinutes = 100;
    c.counters.happinessSum = 9000;
    expect(picked(c)).toBe("lumiwing");
    c.counters.careMistakes = 4;
    expect(picked(c)).toBe("gloomtoad");
  });

  it("a neglected Gloomtoad becomes Hollowking", () => {
    const c = makeCreature("gloomtoad", 0);
    c.counters.careMistakes = 6;
    c.counters.neglectMinutes = 10 * 60;
    expect(picked(c)).toBe("hollowking");
  });

  it("a strong Pyrefang is Solarion with good care and Dreadmaw with many mistakes", () => {
    const c = makeCreature("pyrefang", 0);
    c.counters.later = { strength: 40 };
    expect(picked(c)).toBe("solarion");
    c.counters.careMistakes = 8;
    expect(picked(c)).toBe("dreadmaw");
  });
});

describe("how rules read a creature", () => {
  it("a save from before Phase 2 (no `later` counters) reads the later metrics as 0", () => {
    const c = makeCreature("fennix", 0);
    delete c.counters.later;
    for (const metric of ["training", "battles", "wins", "chores", "strength", "defense", "spirit"] as const) {
      expect(metricValue(c, metric), metric).toBe(0);
    }
    expect(needMet({ strengthMin: 1 }, c)).toBe(false);
    expect(needMet({ strengthMax: 0 }, c)).toBe(true);
  });

  it("adds up food, and reads the later metrics from counters.later", () => {
    const c = makeCreature("blip", 0);
    c.counters.foodEaten = { berry: 1, meat: 2, fish: 3, candy: 4 };
    expect(metricValue(c, "food")).toBe(10);
    c.counters.later = { wins: 7 };
    expect(metricValue(c, "wins")).toBe(7);
    expect(metricValue(c, "battles")).toBe(0);
  });

  it("reads neglect as hours and discipline from the stat", () => {
    const c = makeCreature("blip", 0);
    c.counters.neglectMinutes = 90;
    expect(metricValue(c, "neglectHours")).toBe(1.5);
    c.stats.discipline = 61;
    expect(metricValue(c, "discipline")).toBe(61);
  });

  it("describeNeed gives one line per rule with pass or fail, and marks systems that do not exist yet", () => {
    const c = makeCreature("fennix", 0);
    c.counters.later = { strength: 12, wins: 5 };
    const rows = describeNeed({ strengthMin: 20, winsMin: 5, careMistakesMax: 3 }, c);
    expect(rows.map((r) => [r.metric, r.have, r.pass, r.tracked])).toEqual([
      ["careMistakes", 0, true, true],
      ["wins", 5, true, false],
      ["strength", 12, false, false],
    ]);
  });

  it("describePaths lists every path, says which would win, and how long the stage has run", () => {
    const c = makeCreature("blip", at(8));
    c.counters.foodEaten.berry = 5;
    const paths = describePaths(c, at(8) + 3 * HOUR);
    expect(paths.map((p) => p.evo.to)).toEqual(["smudge", "nubbin", "nubbin", "pip"]);
    expect(paths.map((p) => p.leading)).toEqual([false, true, false, false]);
    expect(paths[3]?.fallback).toBe(true);
    expect(paths[0]?.hoursInStage).toBeCloseTo(3);
  });

  it("ruleText says pass or fail, what is needed, and flags systems that do not exist yet", () => {
    const c = makeCreature("fennix", 0);
    c.counters.later = { strength: 12 };
    c.counters.happinessMinutes = 10;
    c.counters.happinessSum = 725; // 72.5 average
    const [careRow, happyRow, strengthRow] = describeNeed({ careMistakesMax: 3, happinessAvgMin: 70, strengthMin: 40 }, c);
    expect(ruleText(careRow!)).toBe("✓ care mistakes: 0 (need at most 3)");
    expect(ruleText(happyRow!)).toBe("✓ average happiness: 72.5 (need at least 70)");
    expect(ruleText(strengthRow!)).toBe("✗ strength: 12 (need at least 40), not in the game yet");
    c.counters.happinessSum = 699.6; // 69.96, which must not show as 70
    expect(ruleText(describeNeed({ happinessAvgMin: 70 }, c)[0]!)).toBe("✗ average happiness: 69.96 (need at least 70)");
    const [both] = describeNeed({ careMistakesMin: 1, careMistakesMax: 4 }, c);
    expect(ruleText(both!)).toBe("✗ care mistakes: 0 (need 1 to 4)");
  });
});
