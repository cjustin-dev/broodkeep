import { describe, expect, it } from "vitest";
import { feed, tapEgg } from "../src/game/actions";
import { setSick, setStat } from "../src/game/dev";
import { simulateTo } from "../src/game/sim";
import { newSave } from "../src/game/state";
import { HOUR, MINUTE } from "../src/game/time";
import { aliveSave, at, careForUntil } from "./helpers";

describe("catching up on time", () => {
  it("gives exactly the same result however the time is split up", () => {
    const t0 = at(8);
    const one = aliveSave("blip", t0);
    // Leave poop lying around so that chance events (sickness) are part of the test.
    feed(one, "berry", t0);
    feed(one, "berry", t0);
    const pieces = structuredClone(one);

    simulateTo(one, t0 + 30 * HOUR);

    let t = t0;
    for (const step of [7.5 * MINUTE, 1 * HOUR + 13 * MINUTE, 59 * 1000, 11 * HOUR, 90 * MINUTE]) {
      t += step;
      simulateTo(pieces, t);
    }
    simulateTo(pieces, t0 + 30 * HOUR);

    expect(pieces).toEqual(one);
  });

  it("only simulates whole minutes and keeps the leftover seconds", () => {
    const t0 = at(8);
    const save = aliveSave("blip", t0);
    expect(simulateTo(save, t0 + 90 * 1000)).toBe(1);
    expect(save.lastSimulatedAt).toBe(t0 + MINUTE);
    expect(simulateTo(save, t0 + 119 * 1000)).toBe(0);
    expect(simulateTo(save, t0 + 120 * 1000)).toBe(1);
  });

  it("handles a very long absence quickly, and splitting it up changes nothing", () => {
    const t0 = at(8);
    const one = aliveSave("blip", t0);
    const two = structuredClone(one);
    const tenYears = t0 + 3650 * 24 * HOUR;
    simulateTo(one, tenYears);
    simulateTo(two, t0 + 15 * 24 * HOUR);
    simulateTo(two, tenYears);
    expect(one.phase).toBe("dead");
    expect(one.lastSimulatedAt).toBe(tenYears);
    expect(two).toEqual(one);
  });

  it("carries on from a saved game exactly as if it had never been stored", () => {
    const t0 = at(8);
    const live = aliveSave("blip", t0);
    feed(live, "berry", t0);
    feed(live, "berry", t0);
    simulateTo(live, t0 + 5 * HOUR);
    const stored = JSON.parse(JSON.stringify(live)); // what IndexedDB would keep
    simulateTo(live, t0 + 40 * HOUR);
    simulateTo(stored, t0 + 40 * HOUR);
    expect(stored).toEqual(live);
  });

  it("ignores a small step back of the clock until it catches up", () => {
    const t0 = at(8);
    const steady = aliveSave("blip", t0);
    const wobbly = structuredClone(steady);
    simulateTo(steady, t0 + 3 * HOUR);
    simulateTo(wobbly, t0 + 3 * HOUR);
    expect(simulateTo(wobbly, t0 + 3 * HOUR - 10 * MINUTE)).toBe(0);
    expect(wobbly.lastSimulatedAt).toBe(t0 + 3 * HOUR);
    simulateTo(steady, t0 + 5 * HOUR);
    simulateTo(wobbly, t0 + 5 * HOUR);
    expect(wobbly).toEqual(steady); // no minute was counted twice
  });

  it("starts over from the new time if the clock jumps far back", () => {
    const t0 = at(8);
    const save = aliveSave("blip", t0);
    simulateTo(save, t0 + 3 * HOUR);
    expect(simulateTo(save, t0)).toBe(0);
    expect(save.lastSimulatedAt).toBe(t0);
    expect(save.log.some((entry) => entry.text.includes("clock went back"))).toBe(true);
    expect(simulateTo(save, t0 + 10 * MINUTE)).toBe(10); // and time moves on again
  });
});

describe("egg", () => {
  it("hatches into a baby after 30 minutes", () => {
    const t0 = at(8);
    const save = newSave(t0, 5);
    save.egg!.pattern = "speckled";
    simulateTo(save, t0 + 29 * MINUTE);
    expect(save.phase).toBe("egg");
    simulateTo(save, t0 + 30 * MINUTE);
    expect(save.phase).toBe("alive");
    expect(save.creature?.formId).toBe("blip");
    expect(save.egg).toBeNull();
  });

  it("each egg pattern hatches the baby the table says, and a swirled egg can be either", () => {
    const hatched = (pattern: "speckled" | "striped" | "swirled", seed: number): string | undefined => {
      const t0 = at(8);
      const save = newSave(t0, seed);
      save.egg!.pattern = pattern;
      simulateTo(save, t0 + 30 * MINUTE);
      return save.creature?.formId;
    };
    for (let seed = 1; seed <= 30; seed++) {
      expect(hatched("speckled", seed)).toBe("blip");
      expect(hatched("striped", seed)).toBe("drip");
    }
    const swirled = new Set(Array.from({ length: 30 }, (_, i) => hatched("swirled", i + 1)));
    expect(swirled).toEqual(new Set(["blip", "drip"]));
  });

  it("hatches sooner with taps, but taps can only save so much", () => {
    const t0 = at(8);
    const save = newSave(t0, 5);
    for (let i = 0; i < 60; i++) tapEgg(save, t0);
    expect(save.egg?.shavedMinutes).toBe(10);
    simulateTo(save, t0 + 19 * MINUTE);
    expect(save.phase).toBe("egg");
    simulateTo(save, t0 + 20 * MINUTE);
    expect(save.phase).toBe("alive");
  });

  it("the tap that finishes the wait hatches the egg at once", () => {
    const t0 = at(8);
    const save = newSave(t0, 5);
    simulateTo(save, t0 + 20 * MINUTE);
    const results: string[] = [];
    for (let i = 0; i < 20; i++) results.push(tapEgg(save, t0 + 20 * MINUTE));
    expect(results.slice(0, 19).every((r) => r === "tapped")).toBe(true);
    expect(results[19]).toBe("hatched");
  });
});

describe("sleep", () => {
  it("sleeps at night and wakes in the morning", () => {
    const save = aliveSave("blip", at(18));
    simulateTo(save, at(21));
    expect(save.creature?.sleep).toBe("night");
    simulateTo(save, at(7, 0, 6));
    expect(save.creature?.sleep).toBeNull();
  });

  it("follows the sleeping hours from Settings, even when they cross midnight", () => {
    const save = aliveSave("blip", at(8));
    save.settings = { sleepStartHour: 23, sleepEndHour: 9 };
    simulateTo(save, at(8, 30));
    expect(save.creature?.sleep).toBe("night"); // 08:30 is before 09:00
    simulateTo(save, at(9, 30));
    expect(save.creature?.sleep).toBeNull();
  });

  it("never counts bedtime as neglect, even if it gets very hungry in its sleep", () => {
    const save = aliveSave("blip", at(19, 59));
    simulateTo(save, at(20, 30));
    setStat(save, "hunger", 10);
    simulateTo(save, at(6, 30, 6));
    expect(save.creature?.sleep).toBe("night");
    expect(save.creature?.stats.hunger).toBe(0);
    expect(save.creature?.counters.careMistakes).toBe(0);
    expect(save.creature?.call).toBeNull();
  });

  it("falls asleep at exactly the start hour and wakes at exactly the end hour", () => {
    const save = aliveSave("blip", at(19, 50));
    simulateTo(save, at(19, 59));
    expect(save.creature?.sleep).toBeNull();
    simulateTo(save, at(20, 0));
    expect(save.creature?.sleep).toBe("night");
    simulateTo(save, at(6, 59, 6));
    expect(save.creature?.sleep).toBe("night");
    simulateTo(save, at(7, 0, 6));
    expect(save.creature?.sleep).toBeNull();
  });

  it("never sleeps if the start and end hours are the same", () => {
    const save = aliveSave("blip", at(8));
    save.settings = { sleepStartHour: 7, sleepEndHour: 7 };
    simulateTo(save, at(3, 0, 6));
    expect(save.creature?.sleep).toBeNull();
  });

  it("loses hunger much more slowly while asleep", () => {
    const awake = aliveSave("blip", at(8));
    simulateTo(awake, at(10));
    const asleep = aliveSave("blip", at(20, 30));
    simulateTo(asleep, at(22, 30));
    const lostAwake = 70 - awake.creature!.stats.hunger;
    const lostAsleep = 70 - asleep.creature!.stats.hunger;
    expect(lostAsleep).toBeLessThan(lostAwake / 2);
  });
});

describe("neglect", () => {
  it("counts a care mistake for every hour a call goes unanswered", () => {
    const save = aliveSave("blip", at(8));
    setStat(save, "hunger", 10);
    simulateTo(save, at(8, 5)); // the call starts
    expect(save.creature?.call).toBe("hungry");
    const before = save.creature!.counters.careMistakes;
    simulateTo(save, at(9, 5));
    expect(save.creature!.counters.careMistakes).toBe(before + 1);
  });

  it("an ignored creature dies after about two days, whatever time of day it hatched", () => {
    for (const hatchHour of [8, 14, 21]) {
      const t0 = at(hatchHour);
      const save = aliveSave("blip", t0);
      simulateTo(save, t0 + 5 * 24 * HOUR);
      expect(save.phase).toBe("dead");
      const hours = (save.death!.at - t0) / HOUR;
      expect(hours, `hatched at ${hatchHour}:00`).toBeGreaterThan(40);
      expect(hours, `hatched at ${hatchHour}:00`).toBeLessThan(56);
    }
  });

  it("dies of hunger when nobody ever feeds it", () => {
    const save = aliveSave("blip", at(8));
    simulateTo(save, at(8) + 5 * 24 * HOUR);
    expect(save.death?.cause).toBe("hunger");
  });

  it("dies of sickness when it is fed and clean but never given medicine", () => {
    const t0 = at(8);
    const save = aliveSave("blip", t0);
    setSick(save, true);
    for (let t = t0; t < t0 + 3 * 24 * HOUR && save.phase === "alive"; t += 30 * MINUTE) {
      setStat(save, "hunger", 100);
      setStat(save, "hygiene", 100);
      setStat(save, "energy", 100);
      simulateTo(save, t + 30 * MINUTE);
    }
    expect(save.phase).toBe("dead");
    expect(save.death?.cause).toBe("sickness");
  });

  it("does not change anything once it is dead", () => {
    const t0 = at(8);
    const save = aliveSave("blip", t0);
    simulateTo(save, t0 + 5 * 24 * HOUR);
    const snapshot = structuredClone(save.creature);
    simulateTo(save, t0 + 8 * 24 * HOUR);
    expect(save.creature).toEqual(snapshot);
  });
});

describe("good care", () => {
  it("keeps a creature healthy for a week and grows it up", () => {
    const t0 = at(8);
    const save = aliveSave("blip", t0);
    careForUntil(save, t0, t0 + 7 * 24 * HOUR);
    expect(save.phase).toBe("alive");
    expect(save.creature?.formId).toBe("lumiwing"); // baby 6 h, training 24 h, rookie 72 h, then a champion
    expect(save.creature?.counters.careMistakes).toBeLessThanOrEqual(3);
    expect(save.creature?.stats.wellness).toBeGreaterThan(50);
    for (const name of ["Pip", "Fennix", "Lumiwing"]) {
      expect(save.log.some((entry) => entry.text.includes(`evolved into ${name}`)), name).toBe(true);
    }
  });

  it("evolves from a baby to Pip after 6 hours and Pip to Fennix 24 hours later", () => {
    const t0 = at(8);
    const save = aliveSave("blip", t0);
    simulateTo(save, t0 + 5 * HOUR + 59 * MINUTE);
    expect(save.creature?.formId).toBe("blip");
    simulateTo(save, t0 + 6 * HOUR);
    expect(save.creature?.formId).toBe("pip");
    expect(save.creature?.counters.careMistakes).toBe(0); // counters start fresh each stage
    simulateTo(save, t0 + 29 * HOUR + 59 * MINUTE);
    expect(save.creature?.formId).toBe("pip");
    simulateTo(save, t0 + 30 * HOUR);
    expect(save.creature?.formId).toBe("fennix");
  });
});
