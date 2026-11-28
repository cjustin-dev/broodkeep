// A4.3 (docs/adult-a4-plan.md section 10, edge case 2): a fight in Kid Mode, and one that never passes a timing, is the same as it was before timed combat, and so is what it pays.
// The expected lines are in tests/fixtures/combat-golden.json, written by tools/verify/combat-golden.ts from the engine of origin/main 6408759.
import { describe, expect, it } from "vitest";
import { goldenFights, goldenPayouts, goldenRoster, goldenStarts, goldenThresholds } from "./combatGolden";
import golden from "./fixtures/combat-golden.json";

describe("fights as they were before timed combat", () => {
  it("draws the wild creature from the recorded roster of forms (if this fails the roster changed, and the starts and payouts below change with it: they have to be recorded again on the engine of that day, and the change said out loud)", () => {
    expect(goldenRoster()).toEqual(golden.roster);
  });

  it("plays the 14 recorded fights round by round as recorded: every blow, both HP, both meters and the random state", () => {
    expect(golden.fights).toHaveLength(14);
    expect(goldenFights()).toEqual(golden.fights);
  });

  it("starts the 22 recorded fights as recorded: the wild creature, both sides' numbers, the sulk chance and the seeds at every rung of three stages, the sulk chance at three disciplines, and every reason a fight is refused", () => {
    expect(golden.starts).toHaveLength(22);
    expect(goldenStarts()).toEqual(golden.starts);
  });

  it("pays and changes the save for the 24 recorded finished fights as recorded: the result, coins, materials, ladder, counters, trained points, HP, the creature's stats, its sleep and sickness, the request board and the random state", () => {
    expect(golden.payouts).toHaveLength(24);
    expect(goldenPayouts()).toEqual(golden.payouts);
  });

  it("pays the coins and the dropped material of the 40 recorded wins (20 seeds at the first rung and at the boss) as recorded", () => {
    expect(golden.thresholds).toHaveLength(40);
    expect(goldenThresholds()).toEqual(golden.thresholds);
  });

  it("has recorded fights worth comparing with: a sulk, a guard, a special, a crit, a capped crit chance, a knockout of each side, a long fight, a boss, a win with HP left, a loss, all three trained stats, and each refusal", () => {
    const lines = golden.fights.flat();
    for (const part of ["-sulk-", "-guard-", "-special-", "!"]) expect(lines.some((l) => l.includes(part))).toBe(true);
    expect(lines.some((l) => /m-\w+-\d+!?K/.test(l))).toBe(true); // a blow from the player's side that ended a fight
    expect(lines.some((l) => /f-\w+-\d+!?K/.test(l))).toBe(true); // and one from the wild creature's
    expect(Math.max(...golden.fights.map((f) => f.length))).toBeGreaterThanOrEqual(10);
    expect(golden.fights.slice(12).flat().filter((l) => l.includes("!")).length).toBeGreaterThanOrEqual(4); // speed 40 and 30: the crit chance sits at its cap, and crits land
    expect(golden.starts.some((l) => l.includes("|5,true|"))).toBe(true);
    expect(golden.starts).toEqual(expect.arrayContaining(["discipline 10|0.3", "discipline 45|0.05", "discipline 60|0"]));
    expect(golden.starts).toEqual(expect.arrayContaining(["refused tired|tired", "refused asleep|asleep", "refused sick|sick", "refused baby|too-young"]));
    const paid = golden.payouts.join("\n");
    expect(golden.payouts.some((l) => l.includes('"won":true') && l.includes('"boss":true'))).toBe(true); // a boss won (paid double, the ladder starts again)
    expect(golden.payouts.some((l) => l.includes('"won":false'))).toBe(true);
    expect(golden.payouts.some((l) => l.includes("|hurt|") && l.includes('"won":true') && /hp (\d+)\/(\d+) -> \1\|/.test(l) && !/hp (\d+)\/\1 /.test(l))).toBe(true); // a win that keeps the HP it had, less than full
    for (const stat of ["str", "def", "spi"]) expect(paid).toContain(`"stat":"${stat}"`);
    expect(new Set(golden.thresholds.map((l) => l.split("|")[3])).size).toBeGreaterThanOrEqual(3); // no drop, and at least two materials
    expect(new Set(golden.thresholds.filter((l) => l.startsWith("1|")).map((l) => l.split("|")[2])).size).toBeGreaterThanOrEqual(3); // three different coin amounts at the first rung
  });
});
