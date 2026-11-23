// The special creature (docs/paradise-plan.md): a baby or a kid that gets no care for a number of awake hours turns into Dustpuff, which grows no
// further. What counts as care, what does not, what does not run the clock, and which growth the special wins over.
import { describe, expect, it } from "vitest";
import { fieldOfForm } from "../src/data/fields";
import { forms } from "../src/data/forms";
import { specialId } from "../src/data/special";
import { tuning } from "../src/data/tuning";
import { clean, feed, giveMedicine, touch } from "../src/game/actions";
import { beginFight } from "../src/game/combat/fight";
import { setPoop, setSick, setStat } from "../src/game/dev";
import { countNeglectMinute, leadingForm, nextForm, noteCare, stageHours } from "../src/game/growth";
import { evolveTo, simulateTo } from "../src/game/sim";
import { HOUR, MINUTE } from "../src/game/time";
import type { Save } from "../src/game/state";
import { aliveSave, at } from "./helpers";

const t0 = at(8); // eight in the morning: the awake day runs until eight at night
const limit = tuning.growth.neglectHours * 60; // awake minutes with no care that turn a baby or kid into the special
const neglected = (save: Save): number => save.creature!.counters.neglectMinutes ?? 0;

describe("the special form", () => {
  it("is a kid sized creature that belongs to no field", () => {
    const form = forms[specialId]!;
    expect(form.stage).toBe("kid");
    expect(form.idle).toHaveLength(24);
    expect(fieldOfForm(specialId)).toBeNull();
  });
});

describe("a baby or kid with no care", () => {
  it("turns into the special in the minute the limit is reached, and not a minute before", () => {
    const save = aliveSave("blip", t0);
    simulateTo(save, t0 + (limit - 1) * MINUTE);
    expect([save.creature!.formId, neglected(save)]).toEqual(["blip", limit - 1]);
    simulateTo(save, t0 + limit * MINUTE);
    expect(save.creature!.formId).toBe(specialId);
    expect(save.log.map((entry) => entry.text)).toContain("Blip evolved into Dustpuff");
    expect(save.book).toEqual(["blip", specialId]); // the Creature Book has it
  });

  it("does the same to a kid, and the count starts again at each stage", () => {
    const save = aliveSave("pebblin", t0);
    simulateTo(save, t0 + (limit - 1) * MINUTE);
    expect([save.creature!.formId, neglected(save)]).toEqual(["pebblin", limit - 1]);
    simulateTo(save, t0 + limit * MINUTE);
    expect(save.creature!.formId).toBe(specialId);

    const grown = aliveSave("blip", t0);
    simulateTo(grown, t0 + 100 * MINUTE);
    expect(neglected(grown)).toBe(100);
    evolveTo(grown, "pebblin", t0 + 100 * MINUTE);
    expect(neglected(grown)).toBe(0);
  });

  it("does not count the night: asleep minutes run no clock", () => {
    const save = aliveSave("blip", at(18)); // awake until eight at night
    simulateTo(save, at(23));
    expect(save.creature!.sleep).toBe("night");
    expect([save.creature!.formId, neglected(save)]).toEqual(["blip", 119]); // a minute is named by its end: the one ending at 20:00 is already night
  });

  it("gives the same result when the time is caught up in one step as in many", () => {
    const once = aliveSave("blip", t0);
    simulateTo(once, t0 + 5 * HOUR);
    const stepped = aliveSave("blip", t0);
    for (let m = 1; m <= 5 * 60; m++) simulateTo(stepped, t0 + m * MINUTE);
    expect([once.creature!.formId, neglected(once)]).toEqual([specialId, 0]); // the count starts again in the new form, which no longer counts
    expect(stepped.creature).toEqual(once.creature);
  });

  it("wins over the baby's six hour safety net and over the kid's growing up", () => {
    const baby = aliveSave("blip", t0);
    baby.creature!.stageStartedAt = t0 - 7 * HOUR; // the safety net is due
    expect(forms[nextForm(baby.creature!, t0)!]!.stage).toBe("kid");
    baby.creature!.counters.neglectMinutes = limit;
    expect(nextForm(baby.creature!, t0)).toBe(specialId);
    expect(leadingForm(baby.creature!)).toBe(specialId);

    const kid = aliveSave("pebblin", t0);
    kid.creature!.stageStartedAt = t0 - 25 * HOUR; // the kid is due to grow up
    expect(forms[nextForm(kid.creature!, t0)!]!.stage).toBe("young");
    kid.creature!.counters.neglectMinutes = limit;
    expect(nextForm(kid.creature!, t0)).toBe(specialId);
    expect(leadingForm(kid.creature!)).toBe(specialId);
  });

  it("does not turn into the special one minute under the limit: the safety net grows it into a kid instead", () => {
    const baby = aliveSave("blip", t0);
    baby.creature!.stageStartedAt = t0 - 7 * HOUR;
    baby.creature!.counters.neglectMinutes = limit - 1;
    const next = nextForm(baby.creature!, t0)!;
    expect([next === specialId, forms[next]!.stage]).toEqual([false, "kid"]);
  });
});

describe("what is care", () => {
  // Each starts from a creature that has gone almost all the way, does one thing, and then needs the whole limit again.
  const cases: [string, (save: Save, t: number) => unknown, unknown][] = [
    ["a meal", (save, t) => feed(save, "pellet", t), "ate"],
    ["a clean-up", (save, t) => (setPoop(save, 1), clean(save, t)), "cleaned"],
    ["medicine", (save, t) => (setSick(save, true), giveMedicine(save, t)), "cured"],
    ["a pet", (save, t) => touch(save, "pet", t).gained, 2],
    ["a tickle", (save, t) => touch(save, "tickle", t).gained, 3],
  ];

  for (const [name, act, result] of cases) {
    it(`${name} starts the count again`, () => {
      const save = aliveSave("pebblin", t0); // a kid: a baby would grow up on its own before the count ran out again
      const nearly = t0 + (limit - 10) * MINUTE;
      simulateTo(save, nearly);
      expect(neglected(save)).toBe(limit - 10);
      expect(act(save, nearly)).toBe(result);
      expect(neglected(save)).toBe(0);
      simulateTo(save, nearly + (limit - 1) * MINUTE);
      expect(save.creature!.formId).toBe("pebblin");
      simulateTo(save, nearly + limit * MINUTE);
      expect(save.creature!.formId).toBe(specialId);
    });
  }

  it("is not a poke, a meal it refuses, a clean-up with nothing to clean, or medicine it does not need", () => {
    const save = aliveSave("blip", t0);
    simulateTo(save, t0 + 100 * MINUTE);
    const t = t0 + 100 * MINUTE;
    expect(touch(save, "poke", t).gained).toBe(0);
    setStat(save, "hunger", 100);
    expect(feed(save, "pellet", t)).toBe("full");
    setStat(save, "hygiene", 100);
    setPoop(save, 0);
    expect(clean(save, t)).toBe("nothing");
    expect(giveMedicine(save, t)).toBe("not-sick");
    expect(neglected(save)).toBe(100);
  });

  it("is a clean-up or medicine while it sleeps (those buttons work then), but not a meal or a pet", () => {
    const save = aliveSave("blip", t0);
    save.creature!.sleep = "nap";
    for (const act of [
      () => (setPoop(save, 1), clean(save, t0)),
      () => (setSick(save, true), giveMedicine(save, t0)),
    ]) {
      save.creature!.counters.neglectMinutes = 100;
      expect(["cleaned", "cured"]).toContain(act());
      expect(neglected(save)).toBe(0);
    }
    save.creature!.counters.neglectMinutes = 100;
    expect(feed(save, "pellet", t0)).toBe("sleeping");
    expect(neglected(save)).toBe(100);
  });

  it("is not a pet while it is asleep", () => {
    const save = aliveSave("blip", t0);
    save.creature!.counters.neglectMinutes = 100;
    save.creature!.sleep = "nap";
    expect(touch(save, "pet", t0).asleep).toBe(true);
    expect(neglected(save)).toBe(100);
  });

  it("is a pet even when the hourly limit on happiness gives nothing more", () => {
    const save = aliveSave("blip", t0);
    while (touch(save, "pet", t0).gained > 0); // up to the limit
    save.creature!.counters.neglectMinutes = 100;
    expect(touch(save, "pet", t0).gained).toBe(0);
    expect(neglected(save)).toBe(0);
  });

  it("is noted by noteCare, which a save from before the counter can start from nothing", () => {
    const save = aliveSave("blip", t0);
    delete save.creature!.counters.neglectMinutes; // what an older save looks like
    simulateTo(save, t0 + 10 * MINUTE);
    expect(neglected(save)).toBe(10);
    delete save.creature!.counters.neglectMinutes;
    noteCare(save.creature!);
    expect(neglected(save)).toBe(0);
  });
});

describe("what runs the clock", () => {
  it("counts an awake baby and an awake kid, a minute each", () => {
    for (const id of ["blip", "pebblin"]) {
      const c = aliveSave(id, t0).creature!;
      countNeglectMinute(c);
      expect([id, c.counters.neglectMinutes]).toEqual([id, 1]);
    }
  });

  it("counts nothing while it sleeps or is away on a job", () => {
    const asleep = aliveSave("blip", t0).creature!;
    asleep.sleep = "nap";
    countNeglectMinute(asleep);
    const away = aliveSave("blip", t0).creature!;
    away.job = { spot: "meadow", startedAt: t0, endsAt: t0 + HOUR };
    countNeglectMinute(away);
    expect([asleep.counters.neglectMinutes, away.counters.neglectMinutes]).toEqual([0, 0]);
  });

  it("counts nothing for a young, an adult or the special itself", () => {
    for (const id of ["cragpup", "gravelhorn", specialId]) {
      const c = aliveSave(id, t0).creature!;
      countNeglectMinute(c);
      expect([id, c.counters.neglectMinutes]).toEqual([id, 0]);
    }
  });
});

describe("the special itself", () => {
  it("is never a wild opponent, whichever kid goes to fight", () => {
    const met = new Set<string>();
    for (const id of ["pebblin", specialId]) {
      for (let seed = 1; seed <= 150; seed++) {
        const save = aliveSave(id, t0, seed);
        met.add(beginFight(save, save.creature!, t0).foe.formId);
      }
    }
    expect([...met].sort()).toEqual(["cinderling", "drizzle", "pebblin"]); // the kids of the three fields, and not the special
  });

  it("grows no further, however long it lives", () => {
    const c = aliveSave(specialId, t0).creature!;
    c.counters.neglectMinutes = limit * 10;
    expect(nextForm(c, t0 + 1000 * HOUR)).toBeNull();
    expect(leadingForm(c)).toBeNull();
    expect(stageHours(c)).toBeNull();
  });
});
