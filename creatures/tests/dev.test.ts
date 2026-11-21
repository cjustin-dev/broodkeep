import { describe, expect, it } from "vitest";
import {
  advanceClock,
  forceEvolve,
  forceHatch,
  killCreature,
  resetAll,
  setLaterCounter,
  setPoop,
  setStat,
  skipAhead,
  spawnEgg,
} from "../src/game/dev";
import { forms } from "../src/data/forms";
import { metricValue } from "../src/game/metrics";
import { simulateTo } from "../src/game/sim";
import { HOUR, gameNow } from "../src/game/time";
import { aliveSave, at } from "./helpers";

describe("dev tools", () => {
  it("skip ahead shifts the game clock and the creature lives through it", () => {
    const t0 = at(8);
    const save = aliveSave("blip", t0);
    skipAhead(save, 6, t0);
    expect(save.clockOffsetMs).toBe(6 * HOUR);
    expect(gameNow(save, t0)).toBe(t0 + 6 * HOUR);
    expect(save.creature?.formId).toBe("pip"); // 6 hours is the length of the baby stage
  });

  it("time multiplier adds the extra game time, and 1x adds nothing", () => {
    const save = aliveSave("blip", at(8));
    advanceClock(save, 1000, 1);
    expect(save.clockOffsetMs).toBe(0);
    advanceClock(save, 1000, 10);
    expect(save.clockOffsetMs).toBe(9000);
  });

  it("stat editor clamps to 0..100", () => {
    const save = aliveSave("blip", at(8));
    setStat(save, "hunger", 250);
    setStat(save, "energy", -5);
    expect(save.creature?.stats.hunger).toBe(100);
    expect(save.creature?.stats.energy).toBe(0);
    setPoop(save, 99);
    expect(save.creature?.poop).toBe(5);
  });

  it("force evolve changes the form and starts a fresh stage", () => {
    const t0 = at(8);
    const save = aliveSave("blip", t0);
    save.creature!.counters.careMistakes = 4;
    forceEvolve(save, "fennix", t0 + HOUR);
    expect(save.creature?.formId).toBe("fennix");
    expect(save.creature?.counters.careMistakes).toBe(0);
    expect(save.creature?.stageStartedAt).toBe(t0 + HOUR);
  });

  it("force hatch makes the chosen form from an egg", () => {
    const t0 = at(8);
    const save = aliveSave("blip", t0);
    spawnEgg(save, t0);
    expect(save.phase).toBe("egg");
    forceHatch(save, "pip", t0);
    expect(save.phase).toBe("alive");
    expect(save.creature?.formId).toBe("pip");
  });

  it("refuses an unknown form without damaging the save", () => {
    const t0 = at(8);
    const save = aliveSave("blip", t0);
    const before = structuredClone(save);
    expect(() => forceHatch(save, "nope", t0)).toThrow(/Unknown creature form/);
    expect(save).toEqual(before);
    simulateTo(save, t0 + HOUR); // and the game still runs
    expect(save.phase).toBe("alive");
  });

  it("reset after a time skip still hatches the new egg on time", () => {
    const real = at(8);
    const save = aliveSave("blip", real);
    skipAhead(save, 6, real);
    const fresh = resetAll(save, gameNow(save, real), 7);
    expect(fresh.clockOffsetMs).toBe(6 * HOUR);
    simulateTo(fresh, gameNow(fresh, real + 31 * 60_000));
    expect(fresh.phase).toBe("alive");
  });

  it("can kill the creature, and reset keeps the settings", () => {
    const t0 = at(8);
    const save = aliveSave("blip", t0);
    save.settings.sleepStartHour = 22;
    killCreature(save, t0);
    expect(save.phase).toBe("dead");
    const fresh = resetAll(save, t0, 99);
    expect(fresh.phase).toBe("egg");
    expect(fresh.settings.sleepStartHour).toBe(22);
  });

  it("sets the numbers of later systems, whole and between 0 and 999, and they reset at evolution", () => {
    const t0 = at(8);
    const save = aliveSave("fennix", t0);
    setLaterCounter(save, "strength", 40.6);
    setLaterCounter(save, "wins", -3);
    setLaterCounter(save, "battles", 5000);
    setLaterCounter(save, "chores", Number.NaN);
    // The number the tree reads is the typed total. Strength is a real stat now, so what is stored is the part above it.
    const totals = () => (["strength", "wins", "battles", "chores"] as const).map((m) => metricValue(save.creature!, m));
    expect(totals()).toEqual([41, 0, 999, 0]);
    expect(save.creature?.counters.later).toEqual({ strength: 41 - forms.fennix.baseStats.str, wins: 0, battles: 999, chores: 0 });
    forceEvolve(save, "pyrefang", t0 + HOUR);
    expect(save.creature?.counters.later ?? {}).toEqual({});
  });

  it("setting later numbers with no creature does nothing", () => {
    const save = aliveSave("fennix", at(8));
    save.creature = null;
    setLaterCounter(save, "strength", 5);
    expect(save.creature).toBeNull();
  });
});
