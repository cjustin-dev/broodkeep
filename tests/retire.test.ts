// Retire (game/retire.ts, retireCreature in game/actions.ts, save.retired in game/state.ts): a grown-up creature leaves to the Book as a
// completed life and a new egg starts. The unit side: who may retire, what the action writes and leaves alone, the save shape and its
// migration, the section's states, and the words. The screen side (the Book panel) is checked in a browser.
import { describe, expect, it } from "vitest";
import { fieldIds } from "../src/data/fields";
import { forms } from "../src/data/forms";
import { spots } from "../src/data/habitat";
import { specialId } from "../src/data/special";
import { retireCreature, startNewEgg } from "../src/game/actions";
import { killCreature } from "../src/game/dev";
import { formName, formOf, lifeDates, retireRefusal, retireStatus, retireText } from "../src/game/retire";
import { isSave, migrateSave, newSave } from "../src/game/state";
import type { RetiredLife, Save } from "../src/game/state";
import { HOUR, MINUTE } from "../src/game/time";
import { aliveSave, at, careState, stageForm } from "./helpers";

const T = at(10);
const DAY = 24 * HOUR;
const clone = (save: Save): Save => JSON.parse(JSON.stringify(save)) as Save;
const adultSave = (t = T): Save => aliveSave("hollowbloom", t);

describe("who can retire", () => {
  // The stage x phase matrix: only a living adult retires; every other cell is refused with its code and the save is left as it was.
  const alive = (formId: string): Save => aliveSave(formId, T);
  const stages: Array<[string, string]> = [
    ["baby", stageForm("baby")],
    ["kid", stageForm("kid")],
    ["young", stageForm("young")],
    ["the special", specialId],
  ];

  it.each(stages)("a living %s is refused as not grown up", (_label, formId) => {
    const save = alive(formId);
    const before = JSON.stringify(save);
    expect(retireCreature(save, T)).toBe("not-adult");
    expect(JSON.stringify(save)).toBe(before);
  });

  it("an egg is refused as unavailable, and the save is left as it was", () => {
    const save = newSave(T, 7);
    const before = JSON.stringify(save);
    expect(retireCreature(save, T)).toBe("unavailable");
    expect(JSON.stringify(save)).toBe(before);
  });

  it("a dead creature, of any stage, is refused as unavailable, and the save is left as it was", () => {
    for (const formId of [stageForm("baby"), stageForm("kid"), stageForm("young"), "hollowbloom", specialId]) {
      const save = alive(formId);
      killCreature(save, T);
      expect(save.phase, formId).toBe("dead");
      const before = JSON.stringify(save);
      expect(retireCreature(save, T), formId).toBe("unavailable");
      expect(JSON.stringify(save), formId).toBe(before);
    }
  });

  it("a living adult retires, whichever adult it is", () => {
    const adults = Object.values(forms).filter((f) => f.stage === "adult");
    expect(adults.length).toBeGreaterThan(0);
    for (const form of adults) {
      const save = alive(form.id);
      expect(retireCreature(save, T), form.id).toBe("retired");
      expect(save.retired.map((r) => r.formId), form.id).toEqual([form.id]);
    }
  });

  it("an adult that is away at a spot is refused as away, and the save is left as it was", () => {
    const save = careState("hollowbloom", { away: true }, T);
    const before = JSON.stringify(save);
    expect(retireCreature(save, T)).toBe("away");
    expect(JSON.stringify(save)).toBe(before);
  });

  it("a young or special creature that is also away is refused as not grown up (the order is: unavailable, not grown up, away)", () => {
    for (const formId of [stageForm("young"), specialId]) {
      const save = careState(formId, { away: true }, T);
      expect(retireCreature(save, T), formId).toBe("not-adult");
    }
  });

  it("an adult that is asleep (nap or night), sick, starving or out at a field retires all the same", () => {
    const states = [
      { sleep: "nap" as const },
      { sleep: "night" as const },
      { sick: true },
      { hunger: 0 },
      { place: fieldIds[0]! },
    ];
    for (const set of states) {
      const save = careState("hollowbloom", set, T);
      expect(retireCreature(save, T), JSON.stringify(set)).toBe("retired");
      expect(save.phase).toBe("egg");
    }
  });

  it("retireRefusal and the action give the same answer for an egg, a young one, an away adult and an adult at home", () => {
    const cases: Array<[Save, string]> = [
      [newSave(T, 1), "unavailable"],
      [alive(stageForm("young")), "not-adult"],
      [careState("hollowbloom", { away: true }, T), "away"],
      [adultSave(), "retired"],
    ];
    for (const [save, answer] of cases) {
      expect(retireRefusal(clone(save)) ?? "retired", answer).toBe(answer);
      expect(retireCreature(clone(save), T), answer).toBe(answer);
    }
  });

  it("an adult whose job ends while the game catches up is home by then, and retires (its haul stays for the next creature)", () => {
    const save = careState("hollowbloom", { away: true }, T); // the job ends 3 minutes after T
    expect(retireCreature(save, T + 10 * MINUTE)).toBe("retired");
    expect(save.retired.length).toBe(1);
    expect(save.hauls.length).toBe(1);
  });
});

describe("what retiring writes", () => {
  it("adds one record with the creature's own form and hatch time and the call's time, and logs it", () => {
    const born = at(8);
    const save = aliveSave("hollowbloom", born);
    const now = born + 2 * HOUR;
    expect(retireCreature(save, now)).toBe("retired");
    expect(save.retired).toEqual([{ formId: "hollowbloom", bornAt: born, retiredAt: now }]);
    const log = save.log.slice(-2);
    expect(log).toEqual([
      { at: now, text: "Hollowbloom retired" },
      { at: now, text: "A new egg appeared" },
    ]);
  });

  it("puts a new egg in the creature's place: phase egg, no creature, no death, an egg that starts now", () => {
    const save = adultSave();
    expect(retireCreature(save, T + HOUR)).toBe("retired");
    expect(save.phase).toBe("egg");
    expect(save.creature).toBeNull();
    expect(save.death).toBeNull();
    expect(save.egg?.startedAt).toBe(T + HOUR);
    expect(save.egg?.shavedMinutes).toBe(0);
  });

  it("draws the new egg exactly as startNewEgg does: the same pattern and the same step of the random numbers", () => {
    const base = adultSave();
    const viaRetire = clone(base);
    const viaDeath = clone(base);
    killCreature(viaDeath, T);
    expect(viaDeath.rngState).toBe(base.rngState); // the premise: a death does not move the random numbers
    expect(retireCreature(viaRetire, T)).toBe("retired");
    expect(startNewEgg(viaDeath, T)).toBe(true);
    expect(viaRetire.egg).toEqual(viaDeath.egg);
    expect(viaRetire.rngState).toBe(viaDeath.rngState);
    expect(viaRetire.rngState).not.toBe(base.rngState); // and it did step
  });

  it("leaves the Book, coins, bag, haul cards, settings and clock offset alone", () => {
    const save = adultSave();
    save.book = ["blip", "pebblin", "cragpup", "hollowbloom"];
    save.coins = 77;
    save.inventory = { wood: 3, fish: 1 };
    save.hauls = [{ spot: "meadow", at: T - HOUR, coins: 2, material: "fiber", amount: 1 }];
    save.settings = { sleepStartHour: 21, sleepEndHour: 6, adultMode: true };
    save.clockOffsetMs = 5 * HOUR;
    const keep = clone(save);
    expect(retireCreature(save, T)).toBe("retired");
    expect(save.book).toEqual(keep.book);
    expect(save.coins).toBe(77);
    expect(save.inventory).toEqual({ wood: 3, fish: 1 });
    expect(save.hauls).toEqual(keep.hauls);
    expect(save.settings).toEqual(keep.settings);
    expect(save.clockOffsetMs).toBe(5 * HOUR);
    expect(save.lastSimulatedAt).toBe(T);
  });

  it("catches the game up first: a creature that starves in the catch-up is dead, not retired, and no record is added", () => {
    const save = adultSave();
    expect(retireCreature(save, T + 30 * DAY)).toBe("unavailable");
    expect(save.phase).toBe("dead");
    expect(save.retired).toEqual([]);
  });

  it("a second call right after the first is refused and adds nothing", () => {
    const save = adultSave();
    expect(retireCreature(save, T)).toBe("retired");
    const after = JSON.stringify(save);
    expect(retireCreature(save, T)).toBe("unavailable");
    expect(JSON.stringify(save)).toBe(after);
    expect(save.retired.length).toBe(1);
  });

  it("keeps every earlier record and adds the new one last: no cap", () => {
    const save = adultSave();
    const earlier: RetiredLife[] = Array.from({ length: 120 }, (_, i) => ({ formId: "bubblebelly", bornAt: 1_700_000_000_000 + i, retiredAt: 1_700_000_100_000 + i }));
    save.retired = earlier.map((r) => ({ ...r }));
    expect(retireCreature(save, T)).toBe("retired");
    expect(save.retired.length).toBe(121);
    expect(save.retired.slice(0, 120)).toEqual(earlier);
    expect(save.retired[120]).toEqual({ formId: "hollowbloom", bornAt: T, retiredAt: T });
  });

  it("a clock set back never makes the record run backwards: retiredAt is not before bornAt", () => {
    const born = at(12);
    const save = aliveSave("hollowbloom", born);
    expect(retireCreature(save, born - 3 * HOUR)).toBe("retired");
    expect(save.retired[0]).toEqual({ formId: "hollowbloom", bornAt: born, retiredAt: born });
    expect(lifeDates(save.retired[0]!)).toBe("5 Jan to 5 Jan");
  });

  it("keeps finished-job haul cards for the next creature to look at", () => {
    const save = adultSave();
    save.hauls = [{ spot: "pond", at: T, coins: 1, material: "fish", amount: 2 }];
    retireCreature(save, T);
    expect(save.hauls.length).toBe(1);
  });
});

describe("the save shape", () => {
  it("a new game has no completed lives", () => {
    expect(newSave(T, 1).retired).toEqual([]);
  });

  it("a save from before Retire gets an empty list, and is still a save", () => {
    const old: Record<string, unknown> = { ...clone(adultSave()) };
    delete old.retired;
    expect(isSave(old)).toBe(true);
    expect(migrateSave(old)?.retired).toEqual([]);
  });

  it("keeps good records as plain three-field records, and drops everything else without throwing", () => {
    const good: RetiredLife = { formId: "bubblebelly", bornAt: 1_700_000_000_000, retiredAt: 1_700_000_500_000 };
    const bad: unknown[] = [
      null,
      7,
      "hollowbloom",
      [],
      {},
      { formId: "x", bornAt: 1 }, // no retiredAt
      { formId: "x", retiredAt: 1 }, // no bornAt
      { bornAt: 1, retiredAt: 2 }, // no formId
      { formId: 5, bornAt: 1, retiredAt: 2 },
      { formId: "x", bornAt: "1", retiredAt: 2 },
      { formId: "x", bornAt: 1, retiredAt: "2" },
      { formId: "x", bornAt: Number.NaN, retiredAt: 2 },
      { formId: "x", bornAt: 1, retiredAt: Number.POSITIVE_INFINITY },
    ];
    const save: Record<string, unknown> = { ...clone(adultSave()), retired: [...bad, { ...good, extra: "tail" }] };
    expect(migrateSave(save)?.retired).toEqual([good]);
  });

  it("keeps a record that runs backwards, with its end moved up to its start", () => {
    const save: Record<string, unknown> = { ...clone(adultSave()), retired: [{ formId: "bubblebelly", bornAt: 2_000_000_000_000, retiredAt: 1_000_000_000_000 }] };
    expect(migrateSave(save)?.retired).toEqual([{ formId: "bubblebelly", bornAt: 2_000_000_000_000, retiredAt: 2_000_000_000_000 }]);
  });

  it("treats a list that is not a list as empty", () => {
    for (const junk of ["all of them", 5, {}, null, true]) {
      const save: Record<string, unknown> = { ...clone(adultSave()), retired: junk };
      expect(migrateSave(save)?.retired, String(junk)).toEqual([]);
    }
  });

  it("keeps all 150 good records and drops the 5 bad ones among them, in order", () => {
    const good: RetiredLife[] = Array.from({ length: 150 }, (_, i) => ({ formId: "bubblebelly", bornAt: 1_700_000_000_000 + i, retiredAt: 1_700_001_000_000 + i }));
    const mixed: unknown[] = [];
    good.forEach((life, i) => {
      mixed.push(life);
      if (i % 30 === 0) mixed.push({ formId: "oops", bornAt: "late", retiredAt: null });
    });
    expect(mixed.length).toBe(155);
    const save: Record<string, unknown> = { ...clone(adultSave()), retired: mixed };
    expect(migrateSave(save)?.retired).toEqual(good);
  });

  it("a hundred realistic records stay under 8,000 characters of JSON", () => {
    const longest = Object.keys(forms).reduce((a, b) => (b.length > a.length ? b : a));
    const lives: RetiredLife[] = Array.from({ length: 100 }, (_, i) => ({ formId: longest, bornAt: 1_790_000_000_000 + i * 1_000_000, retiredAt: 1_790_500_000_000 + i * 1_000_000 }));
    expect(JSON.stringify(lives).length).toBeLessThan(8000);
  });

  it("round-trips through JSON as the same list", () => {
    const save = adultSave();
    retireCreature(save, T + HOUR);
    expect(migrateSave(clone(save))?.retired).toEqual(save.retired);
  });
});

describe("the section's states", () => {
  const meadow = spots.meadow.name;

  it("says nothing for an egg or a dead creature", () => {
    expect(retireStatus(newSave(T, 1), false)).toEqual({ kind: "none" });
    const dead = adultSave();
    killCreature(dead, T);
    expect(retireStatus(dead, false)).toEqual({ kind: "none" });
  });

  it("gives the teaser for a living baby, kid, young or special", () => {
    for (const formId of [stageForm("baby"), stageForm("kid"), stageForm("young"), specialId]) {
      expect(retireStatus(aliveSave(formId, T), false), formId).toEqual({ kind: "teaser" });
    }
  });

  it("names an adult that is home as ready, with its own name", () => {
    expect(retireStatus(adultSave(), false)).toEqual({ kind: "ready", name: "Hollowbloom" });
  });

  it("names an adult that is out as away, with the spot's name", () => {
    expect(retireStatus(careState("hollowbloom", { away: true }, T), false)).toEqual({ kind: "away", name: "Hollowbloom", spot: meadow });
  });

  it("an adult at home during a fight is told to finish the fight, and the fight changes nothing for the others", () => {
    expect(retireStatus(adultSave(), true)).toEqual({ kind: "fighting", name: "Hollowbloom" });
    expect(retireStatus(aliveSave(stageForm("young"), T), true)).toEqual({ kind: "teaser" });
    expect(retireStatus(newSave(T, 1), true)).toEqual({ kind: "none" });
    expect(retireStatus(careState("hollowbloom", { away: true }, T), true).kind).toBe("away");
  });

  it("a form this version does not know is not offered, and does not throw (an id the table only has by inheritance counts as unknown too)", () => {
    for (const formId of ["from-the-future", "constructor", "toString", "__proto__"]) {
      const save = adultSave();
      save.creature!.formId = formId;
      expect(retireRefusal(save), formId).toBe("not-adult");
      expect(retireStatus(save, false), formId).toEqual({ kind: "teaser" });
      expect(formName(formId), formId).toBe("A creature");
      expect(formOf(formId), formId).toBeUndefined();
    }
    expect(formOf("hollowbloom")?.name).toBe("Hollowbloom");
  });
});

describe("the words", () => {
  it("are the ones the plan gives, for a name (pinned literally)", () => {
    expect(retireText.teaser).toBe("A grown-up creature can retire here, to be kept in the Book as a completed life.");
    expect(retireText.ready("Hollowbloom")).toBe("Hollowbloom is grown up.");
    expect(retireText.button("Hollowbloom")).toBe("Retire Hollowbloom");
    expect(retireText.away("Hollowbloom", "Bug meadow")).toBe("Hollowbloom is away at Bug meadow. It can retire once it is home.");
    expect(retireText.fighting("Hollowbloom")).toBe("Finish the fight first, then Hollowbloom can retire.");
    expect(retireText.cardTitle("Hollowbloom")).toBe("Retire Hollowbloom?");
    expect(retireText.cardBody("Hollowbloom")).toBe(
      "Hollowbloom has lived a full life. Retiring keeps it in the Book as a completed life. It will not be in your home or need care again, and a new egg starts. Your coins, bag and Book stay as they are. You cannot bring it back, and you can look at Hollowbloom under Completed lives.",
    );
    expect(retireText.confirm).toBe("Retire, complete, pass on");
    expect(retireText.keep).toBe("Keep playing");
    expect(retireText.done("Hollowbloom")).toBe("Hollowbloom is in your Book as a completed life. A new egg has started.");
    expect(retireText.livesHeading).toBe("Completed lives");
    expect(retireText.thisHeading).toBe("This creature");
  });

  // The spec's copy rule: no word of loss. Whole words, any case ("Close" and "studies" are fine). Every string, for every adult's name and every spot.
  const banned = /\b(sacrifice|release|lose|lost|delete|die|death|forever|gone)\b/i;
  const everyString = (name: string, spot: string): string[] => [
    retireText.teaser,
    retireText.ready(name),
    retireText.button(name),
    retireText.away(name, spot),
    retireText.fighting(name),
    retireText.cardTitle(name),
    retireText.cardBody(name),
    retireText.confirm,
    retireText.keep,
    retireText.done(name),
    retireText.livesHeading,
    retireText.thisHeading,
  ];

  it("the banned-word check itself catches whole words in any case, and lets longer words through", () => {
    for (const word of ["Do not die.", "It is GONE", "a Sacrifice", "Release it", "you lose", "all is Lost", "Delete", "after death", "Forever"]) {
      expect(banned.test(word), word).toBe(true);
    }
    for (const word of ["Close", "studies", "the diet", "closer", "Dietrich", "deathless", "released", "lonely"]) {
      expect(banned.test(word), word).toBe(false);
    }
  });

  it("none of the strings, for any adult's name or any spot, holds a word of loss", () => {
    const adults = Object.values(forms).filter((f) => f.stage === "adult");
    const spotNames = Object.values(spots).map((s) => s.name);
    for (const form of adults) {
      for (const spot of spotNames) {
        for (const text of everyString(form.name, spot)) expect(banned.test(text), `${form.name} / ${spot}: ${text}`).toBe(false);
      }
    }
  });
});

describe("the dates", () => {
  it("give the day and month it hatched and the day and month it retired, on the device's own clock", () => {
    const life: RetiredLife = { formId: "hollowbloom", bornAt: new Date(2026, 10, 12, 9, 30).getTime(), retiredAt: new Date(2026, 10, 22, 23, 59).getTime() };
    expect(lifeDates(life)).toBe("12 Nov to 22 Nov");
  });

  it("write a day without a leading zero, and cross a month and a year", () => {
    const life: RetiredLife = { formId: "hollowbloom", bornAt: new Date(2026, 11, 30, 12).getTime(), retiredAt: new Date(2027, 0, 2, 12).getTime() };
    expect(lifeDates(life)).toBe("30 Dec to 2 Jan");
  });

  it("name every month by its three letters", () => {
    const names = Array.from({ length: 12 }, (_, m) => lifeDates({ formId: "x", bornAt: new Date(2026, m, 15, 12).getTime(), retiredAt: new Date(2026, m, 15, 12).getTime() }));
    expect(names).toEqual([
      "15 Jan to 15 Jan",
      "15 Feb to 15 Feb",
      "15 Mar to 15 Mar",
      "15 Apr to 15 Apr",
      "15 May to 15 May",
      "15 Jun to 15 Jun",
      "15 Jul to 15 Jul",
      "15 Aug to 15 Aug",
      "15 Sep to 15 Sep",
      "15 Oct to 15 Oct",
      "15 Nov to 15 Nov",
      "15 Dec to 15 Dec",
    ]);
  });
});
