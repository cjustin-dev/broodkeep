import { describe, expect, it } from "vitest";
import {
  advanceClock,
  forceEvolve,
  forceHatch,
  killCreature,
  resetAll,
  setCareCounter,
  setFieldMinutes,
  setPlace,
  setPoop,
  setServings,
  setStat,
  skipAhead,
  spawnEgg,
} from "../src/game/dev";
import { forms } from "../src/data/forms";
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
    expect(save.creature?.formId).toBe("pebblin"); // 6 hours is the length of the baby stage
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
    forceEvolve(save, "cragpup", t0 + HOUR);
    expect(save.creature?.formId).toBe("cragpup");
    expect(save.creature?.counters.careMistakes).toBe(0);
    expect(save.creature?.stageStartedAt).toBe(t0 + HOUR);
  });

  it("force hatch makes the chosen form from an egg", () => {
    const t0 = at(8);
    const save = aliveSave("blip", t0);
    spawnEgg(save, t0);
    expect(save.phase).toBe("egg");
    forceHatch(save, "pebblin", t0);
    expect(save.phase).toBe("alive");
    expect(save.creature?.formId).toBe("pebblin");
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

  it("sets the growth numbers whole and between 0 and the top, and they reset at evolution", () => {
    const t0 = at(8);
    const save = aliveSave("blip", t0);
    setFieldMinutes(save, "land", 40.6);
    setFieldMinutes(save, "water", -3);
    setServings(save, "meat", 7);
    setCareCounter(save, "careMistakes", 5000);
    setCareCounter(save, "hungerCells", Number.NaN);
    setCareCounter(save, "happyCells", 40); // the cells stop at the same top as the real count
    const counters = save.creature!.counters;
    expect(counters.fieldMinutes).toEqual({ land: 41, water: 0 });
    expect(counters.servings).toEqual({ meat: 7 });
    expect([counters.careMistakes, counters.hungerCells, counters.happyCells]).toEqual([99, 0, 5]);
    forceEvolve(save, "pebblin", t0 + HOUR);
    expect(save.creature!.counters.fieldMinutes).toEqual({});
    expect(save.creature!.counters.servings).toEqual({});
    expect(save.creature!.counters.careMistakes).toBe(0);
  });

  it("puts the creature in any place, with none of the checks the real action makes", () => {
    const save = aliveSave("blip", at(8));
    setPlace(save, "sky"); // locked, but dev mode may still go
    expect(save.creature!.place).toBe("sky");
    setPlace(save, "home");
    expect(save.creature!.place).toBe("home");
  });

  it("setting growth numbers or a place with no creature does nothing", () => {
    const save = aliveSave("blip", at(8));
    save.creature = null;
    setFieldMinutes(save, "land", 5);
    setServings(save, "meat", 5);
    setCareCounter(save, "careMistakes", 5);
    setPlace(save, "land");
    expect(save.creature).toBeNull();
  });
});
