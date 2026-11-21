import { afterEach, describe, expect, it } from "vitest";
import { forms } from "../src/data/forms";
import { chooseEvolution, needMet } from "../src/game/evolution";
import { happinessAverage } from "../src/game/metrics";
import { makeCreature } from "../src/game/sim";
import { HOUR } from "../src/game/time";
import type { Form } from "../src/game/types";
import { aliveSave, at } from "./helpers";

// A made-up form with three paths, to test the picking rules.
const testForm: Form = {
  ...forms.blip!,
  id: "testform",
  evolvesTo: [
    { to: "pip", minHours: 6, need: { careMistakesMax: 1 } },
    { to: "fennix", minHours: 6, need: { careMistakesMin: 4 } },
    { to: "blip", minHours: 6 }, // fallback
  ],
};

afterEach(() => {
  delete forms.testform;
});

describe("needMet", () => {
  it("passes with no requirements", () => {
    expect(needMet({}, makeCreature("blip", 0))).toBe(true);
  });

  it("checks care mistakes at both ends", () => {
    const c = makeCreature("blip", 0);
    c.counters.careMistakes = 2;
    expect(needMet({ careMistakesMax: 2 }, c)).toBe(true);
    expect(needMet({ careMistakesMax: 1 }, c)).toBe(false);
    expect(needMet({ careMistakesMin: 2 }, c)).toBe(true);
    expect(needMet({ careMistakesMin: 3 }, c)).toBe(false);
  });

  it("checks average happiness, and treats no data as 50", () => {
    const c = makeCreature("blip", 0);
    expect(happinessAverage(c.counters)).toBe(50);
    c.counters.happinessSum = 80 * 10;
    c.counters.happinessMinutes = 10;
    expect(needMet({ happinessAvgMin: 80 }, c)).toBe(true);
    expect(needMet({ happinessAvgMin: 81 }, c)).toBe(false);
  });
});

describe("chooseEvolution", () => {
  it("waits until the stage is long enough", () => {
    const save = aliveSave("blip", at(8));
    expect(chooseEvolution(save.creature!, at(8) + 5 * HOUR)).toBeNull();
    expect(chooseEvolution(save.creature!, at(8) + 6 * HOUR)?.to).toBe("pip");
  });

  it("returns nothing for a form with no next stage", () => {
    const save = aliveSave("hollowking", at(8));
    expect(chooseEvolution(save.creature!, at(8) + 500 * HOUR)).toBeNull();
  });

  it("takes the first matching path, otherwise the fallback", () => {
    forms.testform = testForm;
    const save = aliveSave("testform", at(8));
    const later = at(8) + 7 * HOUR;
    const c = save.creature!;

    c.counters.careMistakes = 0;
    expect(chooseEvolution(c, later)?.to).toBe("pip");

    c.counters.careMistakes = 2; // too many for the first path, too few for the second
    expect(chooseEvolution(c, later)?.to).toBe("blip");

    c.counters.careMistakes = 5;
    expect(chooseEvolution(c, later)?.to).toBe("fennix");
  });
});
