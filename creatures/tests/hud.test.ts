// The adult HUD's numbers and lines (game/hud.ts), checked against the code that runs the game.
// The edge cases are listed in docs/adult-a1-plan.md, section 3.
import { describe, expect, it } from "vitest";
import { bookTotal } from "../src/data/book";
import { combatTuning } from "../src/data/combat";
import { planOf } from "../src/data/fields";
import { specialId } from "../src/data/special";
import { tuning } from "../src/data/tuning";
import { feed } from "../src/game/actions";
import { statChangePerMinute, stepCare } from "../src/game/care";
import type { DrainStat } from "../src/game/care";
import { sulkChance } from "../src/game/combat/battle";
import { forceEvolve, forceHatch } from "../src/game/dev";
import {
  bookPercent,
  callCell,
  cellSpan,
  clockText,
  contextLine,
  detailLines,
  formatHm,
  formatMmSs,
  formatSpan,
  formatSpanShort,
  hourLabel,
  isAdultMode,
  minutesUntilItEats,
  nextWake,
  shownValue,
  stageLabel,
  stageTail,
  statLevel,
  timeToEmpty,
  wellnessState,
} from "../src/game/hud";
import { makeRng } from "../src/game/rng";
import { simulateTo } from "../src/game/sim";
import { migrateSave, newSave } from "../src/game/state";
import type { CallKind, Creature, Save } from "../src/game/state";
import { HOUR, MINUTE, hourOf } from "../src/game/time";
import { aliveSave, at, petUntil } from "./helpers";

const NOON = at(12);
const NIGHT = at(23);

// A living creature at a moment on the local clock. `sleepHours` start = end means there is never a night, so a test of the rates can run for
// hours without the creature going to bed.
function creature(t = NOON, sleepHours: [number, number] | null = [8, 8]): { save: Save; c: Creature } {
  const save = aliveSave("blip", t);
  if (sleepHours) [save.settings.sleepStartHour, save.settings.sleepEndHour] = sleepHours;
  return { save, c: save.creature! };
}

// What the simulation really does in `minutes` minutes of care (the clock starting at t).
function stepMinutes(save: Save, minutes: number, t = NOON): void {
  const rng = makeRng(7);
  for (let i = 1; i <= minutes; i++) stepCare(save, rng, t + i * MINUTE);
}

describe("how times are written", () => {
  it("writes a short span just under and over each threshold", () => {
    const cases: Array<[number, string]> = [
      [0, "<1m"],
      [0.4, "<1m"],
      [1, "1m"],
      [59, "59m"],
      [59.9, "59m"],
      [60, "1h"],
      [61, "1h 1m"],
      [599, "9h 59m"],
      [600, "10h"],
      [601, "10h"],
      [659, "10h"],
      [660, "11h"],
      [5999, "99h"],
      [6000, ">99h"],
      [Infinity, ">99h"],
      [-5, "<1m"],
      [NaN, "<1m"],
    ];
    for (const [minutes, text] of cases) expect(formatSpan(minutes), `${minutes} minutes`).toBe(text);
  });

  it("drops the minutes of a span of an hour or more for a narrow cell", () => {
    expect(formatSpanShort(45)).toBe("45m");
    expect(formatSpanShort(61)).toBe("1h");
    expect(formatSpanShort(599)).toBe("9h");
    expect(formatSpanShort(0.2)).toBe("<1m");
    expect(formatSpanShort(7000)).toBe(">99h");
  });

  it("writes a stage timer as a clock face, rounded down and never below zero", () => {
    expect(formatHm(0)).toBe("0:00");
    expect(formatHm(59)).toBe("0:59");
    expect(formatHm(60)).toBe("1:00");
    expect(formatHm(683.9)).toBe("11:23");
    expect(formatHm(-3)).toBe("0:00");
    expect(formatHm(NaN)).toBe("0:00");
    expect(formatMmSs(151_000)).toBe("2:31");
    expect(formatMmSs(999)).toBe("0:00");
    expect(formatMmSs(-1)).toBe("0:00");
  });

  it("labels an hour of the day the way Settings does", () => {
    expect([0, 7, 12, 13, 23].map(hourLabel)).toEqual(["12 am", "7 am", "12 pm", "1 pm", "11 pm"]);
  });
});

describe("the rates on the screen are the rates of the simulation", () => {
  const drain: DrainStat[] = ["hunger", "happiness", "hygiene", "energy"];
  // [name, hour of the clock, sleep state, hours the creature sleeps between, energy to start with]
  const situations: Array<[string, number, Creature["sleep"], [number, number], number]> = [
    ["awake", 12, null, [8, 8], 60],
    ["asleep at night", 23, "night", [20, 7], 60],
    ["napping", 12, "nap", [8, 8], 60],
  ];

  for (const [name, hour, sleep, hours, energy] of situations) {
    for (const poop of [0, 3, 5]) {
      it(`matches one minute of care for every stat, ${name}, ${poop} poop`, () => {
        const t = at(hour);
        const { save, c } = creature(t, hours);
        c.sleep = sleep;
        c.poop = poop;
        c.stats.energy = energy;
        c.stats.hunger = c.stats.happiness = c.stats.hygiene = 60;
        const before = { ...c.stats };
        const asleep = sleep !== null;
        stepCare(save, makeRng(3), t + MINUTE);
        for (const stat of drain) {
          expect(c.stats[stat] - before[stat], `${stat}, ${name}, ${poop} poop`).toBeCloseTo(statChangePerMinute(c, stat, asleep), 10);
        }
      });
    }
  }

  it("pins the real numbers: 14 awake hours to empty for hunger, a quarter of that speed asleep, the poop term, energy gains 0.25", () => {
    const { c } = creature();
    expect(statChangePerMinute(c, "hunger", false)).toBeCloseTo(-100 / (14 * 60), 12);
    expect(statChangePerMinute(c, "hunger", true)).toBeCloseTo(-100 / (14 * 60) / 4, 12);
    expect(statChangePerMinute(c, "energy", true)).toBe(0.25);
    expect(statChangePerMinute(c, "energy", false)).toBeCloseTo(-100 / (16 * 60), 12);
    c.poop = 5;
    const base = 100 / (24 * 60);
    expect(statChangePerMinute(c, "hygiene", false)).toBeCloseTo(-(base + 5 * 0.04), 12);
    expect(statChangePerMinute(c, "hygiene", true)).toBeCloseTo(-(base + 5 * 0.04) / 4, 12); // the poop term is slowed asleep too
  });

  it("gives a time to empty that the simulation agrees with, to the minute", () => {
    for (const stat of ["hunger", "happiness", "hygiene", "energy"] as const) {
      const { save, c } = creature();
      c.stats[stat] = 30.5;
      const span = timeToEmpty(c, stat, false)!;
      expect(span.toward).toBe("empty");
      const m = span.minutes;
      const probe = structuredClone(save);
      stepMinutes(probe, m - 1);
      expect(probe.creature!.stats[stat], `${stat} one minute short of empty`).toBeGreaterThan(0);
      const after = structuredClone(save);
      stepMinutes(after, m);
      expect(after.creature!.stats[stat], `${stat} on the minute`).toBe(0);
    }
  });

  it("says energy asleep counts up to full, and 100 asleep is full", () => {
    const { c } = creature();
    c.sleep = "nap";
    c.stats.energy = 40;
    expect(timeToEmpty(c, "energy", true)!.minutes).toBeGreaterThanOrEqual(239);
    expect(timeToEmpty(c, "energy", true)!.minutes).toBeLessThanOrEqual(241);
    expect(cellSpan(c, "energy", true)).toBe("full in 4h");
    c.stats.energy = 100;
    expect(cellSpan(c, "energy", true)).toBe("full");
  });

  it("handles the ends: empty now, 1, 100, under a minute, and wellness", () => {
    const { c } = creature();
    c.stats.hunger = 0;
    expect(timeToEmpty(c, "hunger", false)).toEqual({ toward: "empty", minutes: 0 });
    expect(cellSpan(c, "hunger", false)).toBe("empty");
    c.stats.hunger = 0.05; // not empty, but gone within the minute
    expect(cellSpan(c, "hunger", false)).toBe("1m left");
    c.stats.hunger = 1;
    expect(timeToEmpty(c, "hunger", false)!.minutes).toBe(9);
    c.stats.hunger = 100;
    expect(cellSpan(c, "hunger", false)).toBe("14h left");
    expect(timeToEmpty(c, "wellness", false)).toBeNull();
    expect(cellSpan(c, "wellness", false)).toBeNull();
  });
});

describe("when it eats again", () => {
  const hungers = [0, 50, 94, 94.99, 95, 95.4, 97, 100];

  it("says 0 below the line and counts the minutes above it, awake", () => {
    for (const h of hungers) {
      const { save, c } = creature();
      c.stats.hunger = h;
      const n = minutesUntilItEats(c, false);
      if (h < tuning.fullAtHunger) {
        expect(n, `hunger ${h}`).toBe(0);
        expect(feed(save, "pellet", NOON)).toBe("ate");
        continue;
      }
      // (the game's own clock, simulateTo: feed catches the save up to the time it is given)
      const early = structuredClone(save);
      simulateTo(early, NOON + (n - 1) * MINUTE);
      expect(early.creature!.stats.hunger, `hunger ${h}, a minute before`).toBeGreaterThanOrEqual(tuning.fullAtHunger);
      expect(feed(early, "pellet", NOON + (n - 1) * MINUTE), `hunger ${h}, a minute before`).toBe("full");
      const on = structuredClone(save);
      simulateTo(on, NOON + n * MINUTE);
      expect(on.creature!.stats.hunger, `hunger ${h}, on time`).toBeLessThan(tuning.fullAtHunger);
      expect(feed(on, "pellet", NOON + n * MINUTE), `hunger ${h}, on time`).toBe("ate");
    }
  });

  it("is about 17 minutes from 97 awake and about 68 asleep", () => {
    const { c } = creature();
    c.stats.hunger = 97;
    expect(minutesUntilItEats(c, false)).toBe(17);
    expect(minutesUntilItEats(c, true)).toBe(68);
  });

  it("agrees with the simulation asleep too", () => {
    for (const h of [95, 97, 100]) {
      const { save, c } = creature();
      c.sleep = "nap";
      c.stats.energy = 20;
      c.stats.hunger = h;
      const n = minutesUntilItEats(c, true);
      const early = structuredClone(save);
      stepMinutes(early, n - 1);
      expect(early.creature!.stats.hunger, `hunger ${h} asleep, a minute before`).toBeGreaterThanOrEqual(tuning.fullAtHunger);
      const on = structuredClone(save);
      stepMinutes(on, n);
      expect(on.creature!.stats.hunger, `hunger ${h} asleep, on time`).toBeLessThan(tuning.fullAtHunger);
    }
  });
});

describe("the number and the colour of a cell", () => {
  it("rounds down, so the number always agrees with the rule that compares the exact value", () => {
    expect([94.6, 95, 29.9, 30, 14.99, 0.9, 100, 120, -3].map(shownValue)).toEqual([94, 95, 29, 30, 14, 0, 100, 100, 0]);
    // 94.6 shows 94 and does eat; 95 shows 95 and does not
    const { save, c } = creature();
    c.stats.hunger = 94.6;
    expect(shownValue(c.stats.hunger)).toBeLessThan(tuning.fullAtHunger);
    expect(feed(save, "pellet", NOON + 1)).toBe("ate");
  });

  it("is amber below 30 and red below 15 on the shown number", () => {
    expect(statLevel(30)).toBe("good");
    expect(statLevel(29.9)).toBe("amber");
    expect(statLevel(15)).toBe("amber");
    expect(statLevel(14.9)).toBe("red");
    expect(statLevel(0)).toBe("red");
    expect(statLevel(100)).toBe("good");
  });

  it("puts the call mark on the cell the call is about, one cell per call", () => {
    const kinds: CallKind[] = ["hungry", "sad", "dirty", "sick", "sleepy"];
    expect(kinds.map((k) => callCell[k])).toEqual(["hunger", "happiness", "hygiene", "wellness", "energy"]);
    expect(new Set(kinds.map((k) => callCell[k])).size).toBe(5);
  });
});

describe("the strip", () => {
  it("names the stage, with Special for the special", () => {
    const { c } = creature();
    expect(stageLabel(c)).toBe("Baby");
    const kid = planOf("land").kid;
    const young = planOf("land").youngOther;
    const adult = planOf("land").adults[young]![0]!;
    const save = aliveSave("blip", NOON);
    for (const [id, label] of [
      [kid, "Kid"],
      [young, "Young"],
      [adult, "Adult"],
      [specialId, "Special"],
    ] as const) {
      forceEvolve(save, id, NOON);
      expect(stageLabel(save.creature!), id).toBe(label);
    }
  });

  it("gives the Book as a percent that reaches 100 only when it is complete", () => {
    const save = newSave(NOON, 1);
    const total = bookTotal();
    const at_ = (n: number): number => {
      save.book = Array.from({ length: n }, (_, i) => `f${i}`);
      return bookPercent(save);
    };
    expect([at_(0), at_(1), at_(total - 1), at_(total), at_(total + 9)]).toEqual([0, 1, 98, 100, 100]);
  });
});

describe("adult mode", () => {
  it("is on only when the saved setting is exactly true", () => {
    const save = newSave(NOON, 1);
    expect(isAdultMode(save)).toBe(false); // a new game: the field is missing
    const set = (value: unknown): boolean => {
      (save.settings as { adultMode?: unknown }).adultMode = value;
      return isAdultMode(save);
    };
    expect([set(false), set("yes"), set(1), set(null), set(undefined), set({})]).toEqual([false, false, false, false, false, false]);
    expect(set(true)).toBe(true);
  });

  it("keeps the setting through a save and a load, and an old save without it loads and is off", () => {
    const save = newSave(NOON, 1);
    save.settings.adultMode = true;
    expect(isAdultMode(migrateSave(JSON.parse(JSON.stringify(save)))!)).toBe(true);
    const old = JSON.parse(JSON.stringify(newSave(NOON, 2)));
    delete old.settings.adultMode;
    const loaded = migrateSave(old);
    expect(loaded).not.toBeNull();
    expect(isAdultMode(loaded!)).toBe(false);
  });
});

describe("discipline starts at 30", () => {
  it("is 30 for a creature that hatches now, and a creature at 50 or 30 keeps its value through a save, a load and an evolution", () => {
    expect(tuning.newborn.discipline).toBe(30);
    const { save, c } = creature();
    expect(c.stats.discipline).toBe(30);
    expect(sulkChance(30)).toBeCloseTo(0.2, 10); // a new creature ignores a command about one round in five
    c.stats.discipline = 50;
    const loaded = migrateSave(JSON.parse(JSON.stringify(save)))!;
    expect(loaded.creature!.stats.discipline).toBe(50);
    forceEvolve(loaded, planOf("land").kid, NOON);
    expect(loaded.creature!.stats.discipline).toBe(50);
    const young = creature().save;
    forceEvolve(young, planOf("land").kid, NOON);
    expect(young.creature!.stats.discipline).toBe(30);
  });
});

describe("when it wakes", () => {
  it("finds the wake hour, across midnight and on the same day", () => {
    expect(nextWake(at(23, 30), 20, 7)).toBe(at(7, 0, 6));
    expect(nextWake(at(3, 10), 20, 7)).toBe(at(7, 0, 5));
    expect(nextWake(at(21), 22, 6)).toBeNull(); // not night yet
    expect(nextWake(at(2, 30), 1, 5)).toBe(at(5, 0, 5)); // a night that does not cross midnight
  });

  it("has no wake time when it is not night, or there is no night", () => {
    expect(nextWake(NOON, 20, 7)).toBeNull();
    expect(nextWake(NIGHT, 8, 8)).toBeNull();
    expect(nextWake(at(7, 0), 20, 7)).toBeNull(); // 7:00 is the first minute of the morning
  });

  it("follows the clock through a daylight saving change, the way the simulation does", () => {
    const old = process.env.TZ;
    try {
      process.env.TZ = "America/New_York";
      const before = new Date(2026, 2, 7, 23, 0, 0).getTime(); // the night before the clocks go forward
      const wake = nextWake(before, 20, 7)!;
      expect(hourOf(wake)).toBe(7);
      expect(new Date(wake).getDate()).toBe(8);
      expect((wake - before) / HOUR).toBe(7); // only seven hours of real time pass: the clock skips one
    } finally {
      if (old === undefined) delete process.env.TZ;
      else process.env.TZ = old;
    }
  });
});

describe("the context line", () => {
  const line = (save: Save, t: number, screen: "room" | "habitat" | "arena" = "room", fight = null as { foeName: string; rung: number } | null): string =>
    contextLine(save, t, screen, fight);

  it("says an egg hatches in so long, with the time saved by taps, and hatching now at the end", () => {
    const save = newSave(NOON, 1);
    expect(line(save, NOON)).toBe("Egg · hatches in 30m");
    expect(line(save, NOON + 10 * MINUTE)).toBe("Egg · hatches in 20m");
    save.egg!.shavedMinutes = 5;
    expect(line(save, NOON + 10 * MINUTE)).toBe("Egg · hatches in 15m");
    expect(line(save, NOON + 23.5 * MINUTE)).toBe("Egg · hatches in 1m"); // 1.5 minutes left
    expect(line(save, NOON + 24.5 * MINUTE)).toBe("Egg · hatching now"); // half a minute left: under a whole minute, not yet hatched
    expect(line(save, NOON + 25 * MINUTE + 1000)).toBe("Egg · hatching now");
    expect(line(save, NOON + 40 * MINUTE)).toBe("Egg · hatching now");
  });

  it("says passed away first, even when a job is still set", () => {
    const { save, c } = creature();
    c.job = { spot: "pond", startedAt: NOON, endsAt: NOON + 5 * MINUTE };
    save.phase = "dead";
    expect(line(save, NOON)).toBe("Passed away");
  });

  it("says where it is and when it is back, and what it does at zero", () => {
    const { save, c } = creature();
    c.job = { spot: "pond", startedAt: NOON, endsAt: NOON + 151_000 };
    expect(line(save, NOON)).toBe("Away at Pond · back in 2:31");
    expect(line(save, NOON + 151_000)).toBe("Away at Pond · back any moment");
    expect(line(save, NOON + 999_000)).toBe("Away at Pond · back any moment");
    expect(line(save, NOON, "habitat")).toBe("Away at Pond · back in 2:31");
    expect(line(save, NOON, "arena")).toBe("Away at Pond · back in 2:31");
  });

  it("puts a job before sleep when it is away and asleep at once", () => {
    const { save, c } = creature(NIGHT, [20, 7]);
    c.sleep = "night";
    c.job = { spot: "rocks", startedAt: NIGHT, endsAt: NIGHT + 3 * MINUTE };
    expect(line(save, NIGHT)).toBe("Away at Rock pile · back in 3:00");
  });

  it("says when it wakes at night, over midnight and not", () => {
    const { save, c } = creature(NIGHT, [20, 7]);
    c.sleep = "night";
    expect(line(save, at(23, 0))).toBe("Asleep · wakes 7 am (in 8:00)");
    expect(line(save, at(3, 30))).toBe("Asleep · wakes 7 am (in 3:30)");
    save.settings.sleepStartHour = save.settings.sleepEndHour = 8; // the hours were changed while it slept: no wake time to give
    expect(line(save, at(23, 0))).toBe("Asleep");
  });

  it("says a nap ends when it is rested", () => {
    const { save, c } = creature();
    c.sleep = "nap";
    c.stats.energy = 71.9;
    expect(line(save, NOON)).toBe("Napping · wakes when rested (energy 71 of 100)");
  });

  it("says what it wants, or when it sleeps, and how long until it grows up", () => {
    const { save, c } = creature(NOON, [20, 7]);
    c.stageStartedAt = NOON - HOUR; // an hour into the baby stage
    expect(line(save, NOON)).toBe("Awake · sleeps at 8 pm · Grows up within 5:00");
    c.call = "dirty";
    expect(line(save, NOON)).toBe("Needs cleaning · Grows up within 5:00");
    c.call = "hungry";
    expect(line(save, NOON)).toContain("Hungry · ");
    save.settings.sleepStartHour = save.settings.sleepEndHour = 8;
    c.call = null;
    expect(line(save, NOON)).toBe("Awake · Grows up within 5:00"); // no bedtime to name
  });

  it("gives a countdown for each stage and none for an adult or the special", () => {
    const save = aliveSave("blip", NOON);
    const c = (): Creature => save.creature!;
    const land = planOf("land");
    const young = land.youngOther;
    const adult = land.adults[young]![0]!;
    const cases: Array<[string, string]> = [
      [land.kid, "Grows up in 23:00"],
      [young, "Grows up in 47:00"],
      [adult, "Final form"],
      [specialId, "Grows no further"],
    ];
    for (const [id, tail] of cases) {
      forceEvolve(save, id, NOON);
      c().stageStartedAt = NOON - HOUR;
      expect(stageTail(c(), NOON), id).toBe(tail);
    }
  });

  it("never reads more than the stage's length or less than nothing", () => {
    const { c } = creature();
    c.stageStartedAt = NOON + 3 * HOUR; // the device clock was set back, so the stage seems to begin in the future
    expect(stageTail(c, NOON)).toBe("Grows up within 6:00");
    c.stageStartedAt = NOON - 6 * HOUR;
    expect(stageTail(c, NOON)).toBe("Ready to grow up");
    c.stageStartedAt = NOON - 9 * HOUR;
    expect(stageTail(c, NOON)).toBe("Ready to grow up");
    c.stageStartedAt = NOON - 6 * HOUR + 30 * 1000; // under a minute left
    expect(stageTail(c, NOON)).toBe("Ready to grow up");
    c.stageStartedAt = NOON - 6 * HOUR + 60 * 1000;
    expect(stageTail(c, NOON)).toBe("Grows up within 0:01");
  });

  it("follows a hatch and an evolution that happen inside one catch-up", () => {
    const save = newSave(NOON, 11);
    simulateTo(save, NOON + 31 * MINUTE); // the egg hatches
    expect(save.phase).toBe("alive");
    const t = NOON + 31 * MINUTE;
    expect(line(save, t)).toContain("Grows up within");
    petUntil(save, t, t + 7 * HOUR); // the baby's six hours are up: it is a kid now
    expect(stageLabel(save.creature!)).toBe("Kid");
    const c = save.creature!;
    expect(Math.abs(c.stageStartedAt - (t + 6 * HOUR))).toBeLessThanOrEqual(MINUTE); // the kid stage began when the baby's six hours were up
    expect(line(save, t + 7 * HOUR)).toMatch(new RegExp(` · Grows up in ${formatHm(24 * 60 - (t + 7 * HOUR - c.stageStartedAt) / MINUTE)}$`));
  });

  it("says what the habitat and the arena are for", () => {
    const { save } = creature();
    expect(line(save, NOON, "habitat")).toBe("Habitat · pick a place to send it to work");
    save.hauls.push({ spot: "pond", at: NOON, coins: 3, material: "fish", amount: 2 });
    expect(line(save, NOON, "habitat")).toBe("Habitat · 1 haul to collect");
    save.hauls.push({ spot: "pond", at: NOON, coins: 3, material: "fish", amount: 2 });
    expect(line(save, NOON, "habitat")).toBe("Habitat · 2 hauls to collect");
    const total = combatTuning.ladder.length;
    expect(line(save, NOON, "arena")).toBe(`Arena · rung 1 of ${total}`);
    expect(line(save, NOON, "arena", { foeName: "Pebblin", rung: 3 })).toBe(`Arena · rung 3 of ${total} · vs Pebblin`);
    save.creature!.rung = 4;
    expect(line(save, NOON, "arena")).toBe(`Arena · rung 4 of ${total}`);
  });

  it("is the same for a creature that is asleep on the habitat or arena screens (sleep comes first)", () => {
    const { save, c } = creature(NIGHT, [20, 7]);
    c.sleep = "night";
    expect(line(save, NIGHT, "habitat")).toBe("Asleep · wakes 7 am (in 8:00)");
    expect(line(save, NIGHT, "arena")).toBe("Asleep · wakes 7 am (in 8:00)");
  });
});

describe("the clock", () => {
  it("writes game time as a 12 hour clock with minutes", () => {
    expect(clockText(at(0, 5))).toBe("12:05 am");
    expect(clockText(at(9, 0))).toBe("9:00 am");
    expect(clockText(at(12, 0))).toBe("12:00 pm");
    expect(clockText(at(13, 9))).toBe("1:09 pm");
    expect(clockText(at(23, 59))).toBe("11:59 pm");
  });
});

describe("what wellness is doing", () => {
  // Each state is checked against one real minute of care: the words must match the direction wellness really moves.
  const wellnessAfterAMinute = (setup: (c: Creature) => void): { state: string; before: number; after: number } => {
    const { save, c } = creature();
    setup(c);
    const state = wellnessState(c);
    const before = c.stats.wellness;
    stepMinutes(save, 1);
    return { state, before, after: save.creature!.stats.wellness };
  };

  it("says sick, falling, rising and steady the way the simulation moves it", () => {
    const sick = wellnessAfterAMinute((c) => {
      c.sick = true;
      c.stats.wellness = 80;
    });
    expect(sick.state).toBe("sick");
    expect(sick.after).toBeLessThan(sick.before);

    for (const stat of ["hunger", "hygiene", "energy"] as const) {
      const falling = wellnessAfterAMinute((c) => {
        c.stats.wellness = 80;
        c.stats[stat] = 0;
      });
      expect(falling.state, `${stat} at 0`).toBe("falling");
      expect(falling.after, `${stat} at 0`).toBeLessThan(falling.before);
    }

    const rising = wellnessAfterAMinute((c) => {
      c.stats.wellness = 80;
    });
    expect(rising.state).toBe("rising");
    expect(rising.after).toBeGreaterThan(rising.before);

    const lowFood = wellnessAfterAMinute((c) => {
      c.stats.wellness = 80;
      c.stats.hunger = 10; // above 0 so nothing drains it, at or below 20 so nothing mends it
    });
    expect(lowFood.state).toBe("steady");
    expect(lowFood.after).toBe(lowFood.before);

    const full = wellnessAfterAMinute(() => undefined);
    expect(full.state).toBe("steady");
    expect(full.after).toBe(100);
  });
});

describe("the detail card", () => {
  const lines = (stat: Parameters<typeof detailLines>[1], setup: (c: Creature) => void = () => undefined, asleep = false): string[] => {
    const { c } = creature();
    setup(c);
    return detailLines(c, stat, asleep);
  };

  it("gives the rates per hour, awake and asleep, as the simulation uses them (the numbers are pinned)", () => {
    expect(lines("hunger")[0]).toBe("Falls 7.1 an hour awake and 1.8 an hour asleep.");
    expect(lines("happiness")[0]).toBe("Falls 5 an hour awake and 1.3 an hour asleep.");
    expect(lines("energy")[0]).toBe("Falls 6.3 an hour awake and rises 15 an hour asleep.");
    expect(lines("hygiene")[0]).toBe("Falls 4.2 an hour awake and 1 an hour asleep.");
  });

  it("counts the poop on the floor in the hygiene rate, and says so", () => {
    const withPoop = lines("hygiene", (c) => (c.poop = 3));
    expect(withPoop[0]).toBe("Falls 11.4 an hour awake and 2.8 an hour asleep.");
    expect(withPoop).toContain("Poop on the floor: 3. Each one makes it fall 2.4 an hour faster awake.");
    expect(lines("hygiene").some((l) => l.startsWith("Poop on the floor"))).toBe(false);
  });

  it("says how long until empty or full at this rate, and empty or full when it is", () => {
    expect(lines("hunger", (c) => (c.stats.hunger = 100))).toContain("Empty in 14h at this rate.");
    expect(lines("hunger", (c) => (c.stats.hunger = 0))).toContain("Empty now.");
    expect(lines("energy", (c) => (c.stats.energy = 60), true)).toContain("Full in 2h 40m at this rate.");
    expect(lines("energy", (c) => (c.stats.energy = 100), true)).toContain("Full.");
  });

  it("says when food is refused and when it eats again", () => {
    expect(lines("hunger", (c) => (c.stats.hunger = 50))).toContain("It refuses food at 95 or more.");
    expect(lines("hunger", (c) => (c.stats.hunger = 97))).toContain("It refuses food at 95 or more, and eats again in about 17m.");
    expect(lines("hunger", (c) => (c.stats.hunger = 97), true)).toContain("It refuses food at 95 or more, and eats again in about 1h 8m.");
    expect(lines("happiness").some((l) => l.includes("refuses food"))).toBe(false);
  });

  it("names the level where it starts to call", () => {
    expect(lines("hunger")).toContain(`It calls for attention below ${tuning.calls.hungryBelow}.`);
    expect(lines("happiness")).toContain("It calls for attention below 25.");
    expect(lines("energy")).toContain("It calls for attention below 15.");
    expect(lines("hygiene")).toContain("It calls below 25, or with 2 or more poop.");
  });

  it("describes wellness by what it is doing, with no time to empty", () => {
    expect(lines("wellness", (c) => (c.sick = true))).toEqual([
      "Sick: wellness keeps falling until it gets medicine.",
      "Discipline 30: in a fight it ignores a command in 20% of rounds.",
    ]);
    expect(lines("wellness", (c) => (c.stats.wellness = 80))).toEqual([
      "Recovering 3 an hour while food and cleanliness stay above 20.",
      "Below 25 it gets sick.",
      "Discipline 30: in a fight it ignores a command in 20% of rounds.",
    ]);
    expect(lines("wellness")[0]).toBe("Full.");
    expect(lines("wellness", (c) => (c.stats.hunger = 0))[0]).toBe("Falling: a stat at 0 is draining it.");
    expect(lines("wellness", (c) => ((c.stats.wellness = 80), (c.stats.hygiene = 10)))[0]).toBe(
      "Holding. It recovers only while food and cleanliness are above 20.",
    );
  });

  it("ends every card with the discipline and what it costs in a fight", () => {
    expect(lines("hunger").at(-1)).toBe("Discipline 30: in a fight it ignores a command in 20% of rounds.");
    expect(lines("hunger", (c) => (c.stats.discipline = 50)).at(-1)).toBe("Discipline 50: in a fight it follows every command.");
    expect(lines("hunger", (c) => (c.stats.discipline = 0)).at(-1)).toBe(
      `Discipline 0: in a fight it ignores a command in ${Math.round(sulkChance(0) * 100)}% of rounds.`,
    );
    expect(lines("hunger", (c) => (c.stats.discipline = 29.9)).at(-1)).toContain("Discipline 29:");
    // a chance under half a percent is still a chance: it must not read as "follows every command"
    expect(lines("hunger", (c) => (c.stats.discipline = 49.7)).at(-1)).toBe("Discipline 49: in a fight it ignores a command in under 1% of rounds.");
  });
});
