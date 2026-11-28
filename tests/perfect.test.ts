// The Perfect star (game/perfect.ts, Spec 8 part 2, docs/adult-a4-plan.md section 14): the lifetime mistake count, who earns the star, what the dev panel and the
// loader do to it, and its words. The screen side (the Book and the Forecast) is checked by tools/verify/recipes-browser.mjs.
import { describe, expect, it } from "vitest";
import { planOf } from "../src/data/fields";
import { forms } from "../src/data/forms";
import { specialId } from "../src/data/special";
import { retireCreature } from "../src/game/actions";
import { forceEvolve, forceHatch, killCreature, skipAhead } from "../src/game/dev";
import { forecast } from "../src/game/forecast";
import { awardPerfect, isPerfectGrowUp, lifeMistakes, perfectLine, perfectText, recordFinishedStage } from "../src/game/perfect";
import { evolveTo, makeCreature, simulateTo } from "../src/game/sim";
import { isSave, migrateSave, newSave } from "../src/game/state";
import type { Creature, Save } from "../src/game/state";
import { HOUR, MINUTE } from "../src/game/time";
import { aliveSave, at } from "./helpers";

const T = at(10); // ten in the morning on the player's clock: awake
const clone = (save: Save): Save => JSON.parse(JSON.stringify(save)) as Save;

// Land's plan: its kid, a young and that young's four adults (tier 1 first).
const land = planOf("land");
const kid = land.kid;
const young = land.youngOther;
const adults = land.adults[young]!;

// A save with a creature of this form a minute before its stage ends, with the care counters given: one step of the clock grows it up.
function aboutToGrow(formId: string, hours: number, set: (c: Creature) => void): Save {
  const save = newSave(T - 2 * MINUTE, 7);
  forceHatch(save, formId, T - 2 * MINUTE);
  const c = save.creature!;
  c.stageStartedAt = T - 2 * MINUTE - hours * HOUR;
  c.bornAt = c.stageStartedAt;
  set(c);
  return save;
}
const tierOneYoung = (c: Creature): void => {
  c.counters.hungerCells = 5;
  c.counters.happyCells = 5;
};
const grownUp = (save: Save): Save => {
  simulateTo(save, T);
  return save;
};

describe("the lifetime count, `lifeMistakes`", () => {
  const withStage = (formId: string, set: Partial<Creature> & { mistakes?: unknown }): Creature => {
    const c = makeCreature(formId, T);
    delete c.pastMistakes;
    if (set.pastMistakes !== undefined) c.pastMistakes = set.pastMistakes;
    if ("mistakes" in set) c.counters.careMistakes = set.mistakes as number;
    return c;
  };

  it("is the stage's own count for a baby, whatever is stored, and 0 for a baby that has made none", () => {
    expect(lifeMistakes(makeCreature("blip", T))).toBe(0);
    expect(lifeMistakes(withStage("blip", { mistakes: 2 }))).toBe(2);
    expect(lifeMistakes(withStage("blip", { mistakes: 2, pastMistakes: 9 }))).toBe(2);
    expect(lifeMistakes(withStage("blip", { mistakes: 1, pastMistakes: "x" as unknown as number }))).toBe(1);
  });

  it("adds the earlier stages to this one for a kid, a young and an adult", () => {
    expect(lifeMistakes(withStage(kid, { pastMistakes: 2, mistakes: 1 }))).toBe(3);
    expect(lifeMistakes(withStage(young, { pastMistakes: 0, mistakes: 0 }))).toBe(0);
    expect(lifeMistakes(withStage(adults[0]!, { pastMistakes: 4, mistakes: 3 }))).toBe(7);
  });

  it("is unknown (null) when the earlier stages left no whole number, for a kid, a young and an adult, and never throws", () => {
    for (const stageForm of [kid, young, adults[0]!]) {
      for (const bad of [undefined, -3, Number.NaN, 1.5, "2", null, Infinity, {}, []]) {
        const c = withStage(stageForm, { mistakes: 1 });
        if (bad !== undefined) c.pastMistakes = bad as unknown as number;
        expect(lifeMistakes(c), `${stageForm} ${String(bad)}`).toBeNull();
      }
    }
  });

  it("is unknown when the stage's own count is not a whole number of 0 or more, for a baby too", () => {
    for (const bad of [-1, Number.NaN, 0.5, "1", null, undefined]) {
      expect(lifeMistakes(withStage(young, { pastMistakes: 0, mistakes: bad })), String(bad)).toBeNull();
      expect(lifeMistakes(withStage("blip", { mistakes: bad })), String(bad)).toBeNull();
    }
    const noCounters = withStage("blip", {});
    delete (noCounters as { counters?: unknown }).counters;
    expect(lifeMistakes(noCounters)).toBeNull();
  });

  it("is unknown, and does not throw, for a form the game does not know", () => {
    for (const id of ["nobody", "constructor", "toString", "__proto__", ""]) {
      const c = withStage("blip", { mistakes: 0 });
      c.formId = id;
      expect(lifeMistakes(c), id).toBeNull();
    }
  });

  it("records the finished stage: the sum when known, nothing when not, and a bad stored value is never added to", () => {
    const known = withStage(kid, { pastMistakes: 2, mistakes: 1 });
    recordFinishedStage(known);
    expect(known.pastMistakes).toBe(3);
    const baby = withStage("blip", { mistakes: 2 });
    recordFinishedStage(baby);
    expect(baby.pastMistakes).toBe(2);
    const unknown = withStage(young, { mistakes: 1 });
    recordFinishedStage(unknown);
    expect("pastMistakes" in unknown).toBe(false);
    const text = withStage(young, { mistakes: 1, pastMistakes: "2" as unknown as number });
    recordFinishedStage(text);
    expect("pastMistakes" in text).toBe(false);
  });
});

describe("who earns the star, by natural growth", () => {
  it("a tier 1 adult that made no mistake in any stage does: the flag, the Book's list, a line in the log", () => {
    const save = grownUp(aboutToGrow(young, 48, (c) => (tierOneYoung(c), (c.pastMistakes = 0))));
    const c = save.creature!;
    expect(c.formId).toBe(adults[0]);
    expect(c.perfect).toBe(true);
    expect(save.perfect).toEqual([adults[0]]);
    expect(save.log.some((l) => l.text === `${forms[adults[0]!]!.name} grew up as a perfect run`)).toBe(true);
    expect(c.pastMistakes).toBe(0);
  });

  it("an earlier mistake, in the baby or kid stage, keeps it from the star but not from tier 1", () => {
    for (const earlier of [1, 2, 7]) {
      const save = grownUp(aboutToGrow(young, 48, (c) => (tierOneYoung(c), (c.pastMistakes = earlier))));
      expect(save.creature!.formId, `earlier ${earlier}`).toBe(adults[0]);
      expect(save.creature!.perfect, `earlier ${earlier}`).toBeUndefined();
      expect(save.perfect).toEqual([]);
      expect(save.creature!.pastMistakes).toBe(earlier);
    }
  });

  it("mistakes of the baby and the kid add up through the real stage changes", () => {
    const save = aboutToGrow("blip", 6, (c) => {
      c.counters.careMistakes = 2;
      c.counters.fieldMinutes = { land: 60 };
    });
    grownUp(save);
    expect(save.creature!.formId).toBe(kid);
    expect(save.creature!.pastMistakes).toBe(2);
    // one more in the kid stage: the next change writes 3
    const c = save.creature!;
    c.counters.careMistakes = 1;
    c.stageStartedAt = T - 24 * HOUR;
    simulateTo(save, T + 3 * MINUTE);
    expect(save.creature!.formId).not.toBe(kid);
    expect(save.creature!.pastMistakes).toBe(3);
  });

  it("a whole life with no mistake, through every real stage change from the baby, earns the star", () => {
    const save = aboutToGrow("blip", 6, (c) => (c.counters.fieldMinutes = { land: 60 }));
    grownUp(save);
    expect(save.creature!.formId).toBe(kid);
    save.creature!.stageStartedAt = T - 24 * HOUR;
    simulateTo(save, T + 3 * MINUTE);
    expect(save.creature!.formId).toBe(young);
    tierOneYoung(save.creature!);
    save.creature!.stageStartedAt = T - 48 * HOUR;
    simulateTo(save, T + 6 * MINUTE);
    expect(save.creature!.formId).toBe(adults[0]);
    expect(save.creature!.perfect).toBe(true);
    expect(save.perfect).toEqual([adults[0]]);
  });

  it("a tier 2 adult with no mistake at all (four hunger cells) does not", () => {
    const save = grownUp(aboutToGrow(young, 48, (c) => ((c.counters.hungerCells = 4), (c.counters.happyCells = 5), (c.pastMistakes = 0))));
    expect(save.creature!.formId).toBe(adults[1]);
    expect(save.creature!.perfect).toBeUndefined();
    expect(save.perfect).toEqual([]);
  });

  it("an adult tier 1 reached with a mistake in the young stage (so tier 2) does not", () => {
    const save = grownUp(aboutToGrow(young, 48, (c) => (tierOneYoung(c), (c.counters.careMistakes = 1), (c.pastMistakes = 0))));
    expect(save.creature!.formId).toBe(adults[1]);
    expect(save.creature!.perfect).toBeUndefined();
  });

  it("a creature from a save with no record of its earlier stages never earns it, and still grows into tier 1", () => {
    const save = grownUp(aboutToGrow(young, 48, (c) => (tierOneYoung(c), delete c.pastMistakes)));
    expect(save.creature!.formId).toBe(adults[0]);
    expect(save.creature!.perfect).toBeUndefined();
    expect(save.perfect).toEqual([]);
    expect("pastMistakes" in save.creature!).toBe(false);
  });

  it("an old baby with no record grows up with its baby mistakes recorded (0 here), so its life is known from the kid stage on", () => {
    const save = aboutToGrow("blip", 6, (c) => {
      delete c.pastMistakes;
      c.counters.fieldMinutes = { land: 60 };
    });
    grownUp(save);
    expect(save.creature!.formId).toBe(kid);
    expect(save.creature!.pastMistakes).toBe(0);
  });

  it("the write never adds to a text: a stored \"2\" and one mistake end as no record, and a stored 2 ends as 3", () => {
    const text = grownUp(aboutToGrow(young, 48, (c) => (tierOneYoung(c), (c.pastMistakes = "2" as unknown as number))));
    expect("pastMistakes" in text.creature!).toBe(false);
    const good = grownUp(aboutToGrow(young, 48, (c) => ((c.counters.careMistakes = 1), (c.counters.hungerCells = 5), (c.counters.happyCells = 5), (c.pastMistakes = 2))));
    expect(good.creature!.pastMistakes).toBe(3);
  });

  it("the special is never perfect, and stays the special", () => {
    const save = aboutToGrow(specialId, 100, (c) => (c.pastMistakes = 0));
    grownUp(save);
    expect(save.creature!.formId).toBe(specialId);
    expect(save.creature!.perfect).toBeUndefined();
    expect(save.perfect).toEqual([]);
    expect(perfectLine(save.creature!)).toBeNull();
  });

  it("the same form raised perfect twice has one entry in the list", () => {
    const first = grownUp(aboutToGrow(young, 48, (c) => (tierOneYoung(c), (c.pastMistakes = 0))));
    expect(first.perfect).toEqual([adults[0]]);
    const again = first.creature!;
    awardPerfect(first, again, T);
    expect(first.perfect).toEqual([adults[0]]);
  });

  it("isPerfectGrowUp asks for a tier 1 form and a known life with no mistake, and nothing else", () => {
    const c = makeCreature(young, T);
    c.pastMistakes = 0;
    expect(isPerfectGrowUp(c, adults[0]!)).toBe(true);
    for (const tier of [1, 2, 3]) expect(isPerfectGrowUp(c, adults[tier]!), `tier ${tier + 1}`).toBe(false);
    expect(isPerfectGrowUp(c, young)).toBe(false);
    expect(isPerfectGrowUp(c, "nobody")).toBe(false);
    c.counters.careMistakes = 1;
    expect(isPerfectGrowUp(c, adults[0]!)).toBe(false);
    c.counters.careMistakes = 0;
    c.pastMistakes = 1;
    expect(isPerfectGrowUp(c, adults[0]!)).toBe(false);
    delete c.pastMistakes;
    expect(isPerfectGrowUp(c, adults[0]!)).toBe(false);
  });
});

describe("the star, once earned", () => {
  const perfectAdult = (): Save => grownUp(aboutToGrow(young, 48, (c) => (tierOneYoung(c), (c.pastMistakes = 0))));

  it("is kept when the adult later makes mistakes", () => {
    const save = perfectAdult();
    save.creature!.counters.careMistakes = 4;
    expect(save.creature!.perfect).toBe(true);
    expect(perfectLine(save.creature!)?.kind).toBe("kept");
    expect(save.perfect).toEqual([adults[0]]);
  });

  it("goes onto the completed life when it retires, and the next egg leaves the Book's list as it was", () => {
    const save = perfectAdult();
    expect(retireCreature(save, T + HOUR)).toBe("retired");
    expect(save.retired).toHaveLength(1);
    expect(save.retired[0]!.perfect).toBe(true);
    expect(save.creature).toBeNull();
    expect(save.phase).toBe("egg");
    expect(save.perfect).toEqual([adults[0]]);
  });

  it("a creature that was not perfect retires with no flag at all", () => {
    const save = grownUp(aboutToGrow(young, 48, (c) => (tierOneYoung(c), (c.pastMistakes = 3))));
    expect(retireCreature(save, T + HOUR)).toBe("retired");
    expect("perfect" in save.retired[0]!).toBe(false);
  });

  it("stays in the Book's list when the creature dies and the next one hatches, which wears no flag", () => {
    const save = perfectAdult();
    const list = [...save.perfect];
    killCreature(save, T + HOUR);
    expect(save.phase).toBe("dead");
    expect(save.perfect).toEqual(list);
    forceHatch(save, "blip", T + 2 * HOUR);
    expect(save.phase).toBe("alive");
    expect(save.creature!.perfect).toBeUndefined();
    expect(save.perfect).toEqual(list);
  });
});

describe("the dev panel", () => {
  it("a forced evolve into a tier 1 adult awards nothing and leaves no record of the stages it skipped", () => {
    const save = aliveSave("blip", T);
    save.creature!.counters.careMistakes = 0;
    forceEvolve(save, adults[0]!, T);
    expect(save.creature!.formId).toBe(adults[0]);
    expect(save.creature!.perfect).toBeUndefined();
    expect(save.perfect).toEqual([]);
    expect("pastMistakes" in save.creature!).toBe(false);
  });

  it("a forced evolve takes the star flag off the creature (the form is not the one it raised), but not the Book's list", () => {
    const save = aliveSave("blip", T);
    Object.assign(save.creature!, { formId: adults[0], perfect: true, pastMistakes: 0 });
    save.perfect = [adults[0]!];
    forceEvolve(save, adults[1]!, T);
    expect(save.creature!.perfect).toBeUndefined();
    expect(save.perfect).toEqual([adults[0]]);
  });

  it("a hatched baby is known, and a hatched young is not: its natural growth to tier 1 gives no star", () => {
    expect(aliveSave("blip", T).creature!.pastMistakes).toBe(0);
    const save = grownUp(aboutToGrow(young, 48, tierOneYoung));
    expect("pastMistakes" in save.creature!).toBe(false);
    expect(save.creature!.formId).toBe(adults[0]);
    expect(save.creature!.perfect).toBeUndefined();
  });

  it("a forced evolve back to the baby starts a life with a known count of 0", () => {
    const save = aliveSave(young, T);
    forceEvolve(save, "blip", T);
    expect(lifeMistakes(save.creature!)).toBe(0);
  });

  it("a time skip runs the clock's own rules, so it can award the star (nobody had to touch the creature)", () => {
    const save = aboutToGrow(young, 47.9, (c) => {
      tierOneYoung(c);
      c.pastMistakes = 0;
      Object.assign(c.stats, { hunger: 100, happiness: 100, energy: 100, hygiene: 100, wellness: 100 });
    });
    skipAhead(save, 0.5, T - 2 * MINUTE);
    expect(save.creature!.formId).toBe(adults[0]);
    expect(save.creature!.perfect).toBe(true);
  });

  it("evolveTo with an unknown form changes nothing at all (the count is not touched either)", () => {
    const save = aliveSave(young, T);
    save.creature!.pastMistakes = 5;
    save.creature!.counters.careMistakes = 2;
    const before = clone(save);
    expect(() => evolveTo(save, "nobody", T)).toThrow();
    expect(save).toEqual(before);
  });
});

describe("the loader", () => {
  const loaded = (set: (save: Save) => void): Save => {
    const save = clone(aliveSave(young, T));
    set(save);
    return migrateSave(JSON.parse(JSON.stringify(save)))!;
  };

  it("a save made before the star has an empty list, and nothing else about it changes", () => {
    const old = clone(aliveSave(kid, T)) as Partial<Save> & Save;
    delete (old as { perfect?: unknown }).perfect;
    const back = migrateSave(old)!;
    expect(back.perfect).toEqual([]);
    expect(back.creature).toEqual(aliveSave(kid, T).creature);
  });

  it("keeps real forms once each in the order saved, and drops what is not a form, not a string or repeated", () => {
    const save = loaded((s) => (s.perfect = [adults[0]!, "nobody", 7 as unknown as string, adults[0]!, "constructor", adults[2]!, "", "__proto__"]));
    expect(save.perfect).toEqual([adults[0], adults[2]]);
  });

  it("replaces a list that is not a list", () => {
    for (const bad of [null, "x", 3, {}, { 0: adults[0] }]) expect(loaded((s) => (s.perfect = bad as unknown as string[])).perfect, JSON.stringify(bad)).toEqual([]);
  });

  it("keeps a completed life's star only when it is exactly true", () => {
    const base = { formId: adults[0]!, bornAt: T - 5 * HOUR, retiredAt: T };
    const save = loaded((s) => {
      s.retired = [
        { ...base, perfect: true },
        { ...base, perfect: "true" as unknown as true },
        { ...base, perfect: false as unknown as true },
        { ...base, perfect: 1 as unknown as true },
        { ...base },
      ];
    });
    expect(save.retired.map((l) => ("perfect" in l ? l.perfect : "none"))).toEqual([true, "none", "none", "none", "none"]);
  });

  it("keeps the creature's star only when it is exactly true, and does not touch the count it was saved with", () => {
    for (const bad of ["true", 1, false, null, {}]) {
      const save = loaded((s) => Object.assign(s.creature!, { perfect: bad, pastMistakes: 3 }));
      expect("perfect" in save.creature!, JSON.stringify(bad)).toBe(false);
      expect(save.creature!.pastMistakes).toBe(3);
    }
    expect(loaded((s) => Object.assign(s.creature!, { perfect: true })).creature!.perfect).toBe(true);
  });

  it("a fresh save has the list, is a save, and survives a round trip with the star", () => {
    const save = grownUp(aboutToGrow(young, 48, (c) => (tierOneYoung(c), (c.pastMistakes = 0))));
    expect(isSave(JSON.parse(JSON.stringify(save)))).toBe(true);
    expect(migrateSave(JSON.parse(JSON.stringify(save)))).toEqual(save);
    expect(newSave(T, 1).perfect).toEqual([]);
  });
});

describe("the Forecast's line", () => {
  const forecastOf = (formId: string, set: (c: Creature) => void): ReturnType<typeof perfectLine> => {
    const c = makeCreature(formId, T);
    set(c);
    return perfectLine(c);
  };

  it("says the run is still possible for a baby, a kid and a young with a known life and no mistake", () => {
    for (const formId of ["blip", kid, young]) {
      expect(forecastOf(formId, (c) => (c.pastMistakes = 0)), formId).toEqual({ kind: "on", text: perfectText.on });
    }
  });

  it("says nothing once a mistake has been made, in this stage or an earlier one, or when the life is not known", () => {
    expect(forecastOf("blip", (c) => (c.counters.careMistakes = 1))).toBeNull();
    expect(forecastOf(kid, (c) => (c.pastMistakes = 1))).toBeNull();
    expect(forecastOf(young, (c) => ((c.pastMistakes = 0), (c.counters.careMistakes = 3)))).toBeNull();
    expect(forecastOf(young, (c) => delete c.pastMistakes)).toBeNull();
    expect(forecastOf(kid, (c) => (c.pastMistakes = -1))).toBeNull();
  });

  it("says nothing for the special, whatever it has made", () => {
    expect(forecastOf(specialId, (c) => (c.pastMistakes = 0))).toBeNull();
    expect(forecastOf(specialId, (c) => ((c.pastMistakes = 0), (c.perfect = true)))).toBeNull();
  });

  it("an adult with the star reads the kept line, an adult without it reads nothing", () => {
    expect(forecastOf(adults[0]!, (c) => (c.perfect = true))).toEqual({ kind: "kept", text: perfectText.kept });
    expect(forecastOf(adults[0]!, () => undefined)).toBeNull();
    expect(forecastOf(adults[3]!, (c) => (c.pastMistakes = 0))).toBeNull();
  });

  it("a mistake taken now takes the line away at the next look, and reading the forecast does not", () => {
    const c = makeCreature("blip", T);
    expect(perfectLine(c)?.kind).toBe("on");
    forecast(c, T, T, []); // reading a forecast changes nothing
    expect(perfectLine(c)?.kind).toBe("on");
    c.counters.careMistakes += 1;
    expect(perfectLine(c)).toBeNull();
  });

  it("a creature that is not a living one of the game (an unknown form) reads nothing and does not throw", () => {
    const c = makeCreature("blip", T);
    c.formId = "nobody";
    expect(perfectLine(c)).toBeNull();
  });
});

describe("the words", () => {
  // The copy rule (Spec 8: no word of loss or failure): whole words, any case. The same list as the Retire test's, with the words of failure added.
  const banned = /\b(sacrifice|release|lose|lost|loss|delete|die|death|forever|gone|fail|failed|failure|wrong|bad|poor|worse|ruined|miss|missed)\b/i;

  it("the scan catches each banned word in any case and lets longer words through", () => {
    for (const word of ["sacrifice", "Release", "LOSE", "lost", "loss", "delete", "die", "death", "forever", "gone", "fail", "Failed", "failure", "wrong", "bad", "poor", "worse", "ruined", "miss", "missed"]) {
      expect(banned.test(`a ${word}.`), word).toBe(true);
    }
    for (const word of ["Close", "studies", "missing", "failsafe", "badge", "poorly", "dies", "released"]) expect(banned.test(`a ${word}.`), word).toBe(false);
  });

  it("none of the Perfect strings holds one", () => {
    for (const text of [perfectText.on, perfectText.kept, perfectText.star, perfectText.count(1), perfectText.count(12)]) expect(banned.test(text), text).toBe(false);
  });

  it("the strings are these words (the star's wording is pinned)", () => {
    expect(perfectText.on).toBe("Perfect run: still possible. No mistake so far in this life.");
    expect(perfectText.kept).toBe("Perfect run. It grew up with no mistake, and the Book keeps its star.");
    expect(perfectText.star).toBe("Perfect star");
    expect(perfectText.count(3)).toBe(", 3 with a Perfect star");
  });

  it("the Forecast carries the line (the Forecast's own numbers do not change)", () => {
    const c = makeCreature("blip", T);
    const f = forecast(c, T, T, []);
    expect(f.perfect).toEqual({ kind: "on", text: perfectText.on });
  });
});
