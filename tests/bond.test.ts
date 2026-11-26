// Bond (src/game/bond.ts, docs/adult-a3-plan.md section 4): the levels, what a pet and a tickle earn, the taper that replaces the hourly cap in Adult Mode, and what is saved.
// The expected numbers are worked out by hand in the comments, not read from the code.
import { describe, expect, it } from "vitest";
import { startJob, startNewEgg, touch } from "../src/game/actions";
import { bondInfo, coerceBond, earnBond, isAdultSave, levelOf, nextUnlock, taper, unlockAt } from "../src/game/bond";
import { isAdultMode } from "../src/game/hud";
import { killCreature, setPlace, setStat } from "../src/game/dev";
import { simulateTo } from "../src/game/sim";
import { migrateSave, newSave } from "../src/game/state";
import type { Save } from "../src/game/state";
import { MINUTE } from "../src/game/time";
import { tuning } from "../src/data/tuning";
import { aliveSave, at } from "./helpers";

const T = at(10);
const adultSave = (t = T): Save => {
  const save = aliveSave("pebblin", t);
  save.settings.adultMode = true;
  return save;
};
const bond = (save: Save) => save.creature?.bond;
// The same save after a trip through storage, which is what a reload does.
const reloaded = (save: Save): Save => migrateSave(JSON.parse(JSON.stringify(save))) as Save;

describe("the levels", () => {
  it("start at 0, 300, 800, 1,500, 3,000, 4,500, 6,500, 9,000, 12,000 and 15,000 XP, and stop at 10", () => {
    const xps = [0, 299, 300, 799, 800, 1499, 1500, 2999, 3000, 4499, 4500, 6499, 6500, 8999, 9000, 11999, 12000, 14999, 15000, 99999];
    expect(xps.map(levelOf)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10]);
  });

  it("read as the level, the XP inside it, what the level takes and the next level: 120 into level 3 is 120 of 700 to level 4", () => {
    expect(bondInfo(0)).toEqual({ level: 1, into: 0, span: 300, next: 2 });
    expect(bondInfo(920)).toEqual({ level: 3, into: 120, span: 700, next: 4 });
    expect(bondInfo(15000)).toEqual({ level: 10, into: 0, span: 0, next: null });
    expect(bondInfo(15000 + 40)).toEqual({ level: 10, into: 40, span: 0, next: null });
  });

  it("are never closer than 300 XP, and one touch (3 XP at most, read from earnBond) cannot skip a level", () => {
    const starts = tuning.bond.levelAt;
    const gaps = starts.slice(1).map((x, i) => x - (starts[i] as number));
    expect(gaps).toEqual([300, 500, 700, 1500, 1500, 2000, 2500, 3000, 3000]); // (by hand)
    // The most one touch can earn: a tickle, and a pet at the tenth of a chain, each from a creature with no XP.
    const earned = (kind: "pet" | "tickle", chain: number): number => {
      const c = aliveSave("pebblin", T).creature!;
      c.bond = { xp: 0, chain, at: T };
      earnBond(c, kind, T + 800);
      return c.bond.xp;
    };
    const most = Math.max(earned("tickle", 0), earned("pet", 10), earned("pet", 0));
    expect(most).toBe(3);
    expect(Math.min(...gaps)).toBeGreaterThan(most);
    for (let xp = 0; xp <= 15000; xp++) expect(levelOf(xp + most) - levelOf(xp)).toBeLessThanOrEqual(1);
  });

  it("name only the unlocks that exist: an idle hop at level 2 and a bigger burst at level 5", () => {
    expect([1, 2, 3, 4, 5, 6, 10].map(unlockAt)).toEqual([null, "an idle hop", null, null, "a bigger burst when petted", null, null]);
    expect(nextUnlock(1)).toEqual({ level: 2, text: "an idle hop" });
    expect(nextUnlock(2)).toEqual({ level: 5, text: "a bigger burst when petted" });
    expect(nextUnlock(5)).toBeNull();
  });

  it("`isAdultSave` agrees with the HUD's `isAdultMode` for every value the setting can hold", () => {
    for (const value of [undefined, false, true, "yes", 1, 0, null]) {
      const save = aliveSave("pebblin", T);
      (save.settings as { adultMode?: unknown }).adultMode = value;
      expect(isAdultSave(save)).toBe(isAdultMode(save));
    }
  });
});

describe("the taper (Adult Mode)", () => {
  it("pays a pet 2 eight times, 1 fourteen times, then 0.5 (by hand: 8 x 2 = 16 is over 15, then 14 x 1 reaches 30)", () => {
    const save = adultSave();
    setStat(save, "happiness", 0);
    const gains = Array.from({ length: 25 }, () => touch(save, "pet", T).gained);
    expect(gains).toEqual([...Array(8).fill(2), ...Array(14).fill(1), 0.5, 0.5, 0.5]);
  });

  it("pays a tickle 3 five times, 1.5 ten times, then 0.75", () => {
    const save = adultSave();
    setStat(save, "happiness", 0);
    const gains = Array.from({ length: 17 }, () => touch(save, "tickle", T).gained);
    expect(gains).toEqual([...Array(5).fill(3), ...Array(10).fill(1.5), 0.75, 0.75]);
  });

  it("is a pure function of the want and the points gained so far", () => {
    expect([taper(2, 0), taper(2, 14), taper(2, 15), taper(2, 29), taper(2, 30), taper(3, 14.9), taper(3, 15), taper(3, 30)]).toEqual([2, 2, 1, 1, 0.5, 3, 1.5, 0.75]);
  });

  it("starts the window again after 60 minutes, and also when the clock was set back inside it", () => {
    const save = adultSave();
    setStat(save, "happiness", 0);
    for (let i = 0; i < 30; i++) touch(save, "pet", T);
    expect(touch(save, "pet", T).gained).toBe(0.5);
    expect(touch(save, "pet", T + 61 * MINUTE).gained).toBe(2);
    for (let i = 0; i < 30; i++) touch(save, "pet", T + 61 * MINUTE);
    expect(touch(save, "pet", T + 61 * MINUTE).gained).toBe(0.5);
    expect(touch(save, "pet", T + 30 * MINUTE).gained).toBe(2); // (the clock went back: a new window, not a negative difference that never ends)
  });

  it("keeps the window at 59 minutes and starts it again at exactly 60 (a creature's window starts when it hatches)", () => {
    const save = adultSave();
    setStat(save, "happiness", 0);
    for (let i = 0; i < 30; i++) touch(save, "pet", T);
    expect(touch(save, "pet", T + 59 * MINUTE).gained).toBe(0.5);
    expect(touch(save, "pet", T + 60 * MINUTE).gained).toBe(2);
  });

  it("shares the window with Kid Mode: 30 Adult pets leave a Kid pet in the same hour nothing, and the reverse", () => {
    const save = adultSave();
    setStat(save, "happiness", 0);
    for (let i = 0; i < 30; i++) touch(save, "pet", T); // the window has gained 30 (8 x 2 + 14 x 1)
    save.settings.adultMode = false;
    expect(touch(save, "pet", T).gained).toBe(0); // over the Kid cap of 15
    const kid = aliveSave("pebblin", T);
    setStat(kid, "happiness", 0);
    for (let i = 0; i < 8; i++) touch(kid, "pet", T); // 8 x 2 = 16 is over the Kid cap, which stops the eighth at 1 (7 x 2 + 1 = 15)
    expect(kid.creature?.affection.gained).toBe(15);
    kid.settings.adultMode = true;
    expect(touch(kid, "pet", T).gained).toBe(1); // 15 gained is the half rate: 2 x 0.5
  });

  it("still pays XP and the taper's amount when happiness is already 100, and happiness stays 100", () => {
    const save = adultSave();
    setStat(save, "happiness", 100);
    const result = touch(save, "pet", T);
    expect(result.gained).toBe(2);
    expect(save.creature?.stats.happiness).toBe(100);
    expect(bond(save)?.xp).toBe(1);
  });
});

describe("what a pet and a tickle earn (Adult Mode)", () => {
  it("pays a pet 1 XP up to the ninth of a chain and 2 from the tenth: twelve pets 800 ms apart are 9 + 6 = 15", () => {
    const save = adultSave();
    for (let i = 0; i < 12; i++) touch(save, "pet", T + i * 800);
    expect(bond(save)).toEqual({ xp: 15, chain: 10, at: T + 11 * 800 });
  });

  it("lets a tickle come first: the Bond has no chain yet, and the first pet after it is chain 1", () => {
    const save = adultSave();
    touch(save, "tickle", T);
    expect(bond(save)).toMatchObject({ xp: 3, chain: 0 });
    touch(save, "pet", T + 800);
    expect(bond(save)).toEqual({ xp: 4, chain: 1, at: T + 800 });
  });

  it("never goes down, whichever touch comes and whatever the clock does", () => {
    const save = adultSave();
    let last = 0;
    [0, 800, 400, 5_000_000, 10, 1600, 1600, 3_700_000, 0].forEach((dt, i) => {
      touch(save, i % 3 === 2 ? "tickle" : "pet", T + dt);
      const xp = bond(save)?.xp ?? 0;
      expect(xp).toBeGreaterThanOrEqual(last);
      last = xp;
    });
    expect(last).toBeGreaterThan(5);
  });

  it("pays a tickle 3 and leaves the chain and the time of the last pet alone", () => {
    const save = adultSave();
    for (let i = 0; i < 3; i++) touch(save, "pet", T + i * 800); // (the last pet is at T + 1,600)
    touch(save, "tickle", T + 3000);
    expect(bond(save)).toEqual({ xp: 6, chain: 3, at: T + 1600 });
    // 2,200 ms after the last pet but only 800 after the tickle: the chain starts again, so the tickle did not move the time the chain is read from
    touch(save, "pet", T + 3800);
    expect(bond(save)).toEqual({ xp: 7, chain: 1, at: T + 3800 });
  });

  it("goes on with a gap of 0 and of 2,000 ms, and starts again after 2,001 ms", () => {
    const save = adultSave();
    touch(save, "pet", T);
    touch(save, "pet", T); // the same millisecond
    expect(bond(save)?.chain).toBe(2);
    touch(save, "pet", T + 2000);
    expect(bond(save)?.chain).toBe(3);
    touch(save, "pet", T + 2000 + 2001);
    expect(bond(save)?.chain).toBe(1);
  });

  it("starts the chain again when the clock went back, and never makes a negative gap", () => {
    const save = adultSave();
    touch(save, "pet", T + 10_000);
    touch(save, "pet", T + 10_800);
    expect(bond(save)?.chain).toBe(2);
    touch(save, "pet", T + 5_000);
    expect(bond(save)).toEqual({ xp: 3, chain: 1, at: T + 5_000 });
  });

  it("lets a pet and a tickle in the same instant each do their own work", () => {
    const save = adultSave();
    touch(save, "pet", T);
    touch(save, "tickle", T);
    expect(bond(save)).toEqual({ xp: 4, chain: 1, at: T });
  });

  it("stops at 15,000 XP and stays level 10", () => {
    const save = adultSave();
    touch(save, "pet", T);
    (save.creature as { bond: { xp: number } }).bond.xp = 14999;
    touch(save, "pet", T + 800);
    expect(bond(save)?.xp).toBe(15000);
    for (let i = 0; i < 5; i++) touch(save, "tickle", T + 2000 + i);
    expect(bond(save)?.xp).toBe(15000);
    expect(levelOf(bond(save)?.xp ?? 0)).toBe(10);
  });

  it("reports a level once: 299 XP and a pet is level 2 and the next pet reports nothing; a tickle at 797 gets to level 3 the same way", () => {
    const save = adultSave();
    touch(save, "pet", T);
    (save.creature as { bond: { xp: number } }).bond.xp = 299;
    const up = touch(save, "pet", T + 800);
    expect(up).toEqual({ gained: 2, asleep: false, levelUp: 2 });
    expect("levelUp" in touch(save, "pet", T + 1600)).toBe(false);
    expect(save.log.filter((e) => e.text === "Bond level 2")).toHaveLength(1);
    (save.creature as { bond: { xp: number } }).bond.xp = 797;
    expect(touch(save, "tickle", T + 5000).levelUp).toBe(3);
  });

  it("gives a result of exactly the old shape when there is no new level", () => {
    const save = adultSave();
    const result = touch(save, "pet", T);
    expect(Object.keys(result).sort()).toEqual(["asleep", "gained"]);
  });

  it("pays nothing to a creature that is asleep (night or nap), away on a job, dead or an egg, and writes no Bond", () => {
    const night = aliveSave("pebblin", at(19));
    night.settings.adultMode = true;
    expect(touch(night, "pet", at(21))).toEqual({ gained: 0, asleep: true });
    expect(bond(night)).toBeUndefined();

    const nap = adultSave();
    (nap.creature as { sleep: string | null }).sleep = "nap";
    expect(touch(nap, "tickle", T)).toEqual({ gained: 0, asleep: true });
    expect(bond(nap)).toBeUndefined();

    const away = adultSave();
    startJob(away, "meadow", T);
    expect(touch(away, "pet", T)).toEqual({ gained: 0, asleep: false });
    expect(bond(away)).toBeUndefined();

    const dead = adultSave();
    killCreature(dead, T + 1000);
    expect(dead.phase).toBe("dead");
    expect(touch(dead, "pet", T + 2000)).toEqual({ gained: 0, asleep: false });
    expect(bond(dead)).toBeUndefined();

    const egg = newSave(T, 1);
    egg.settings.adultMode = true;
    expect(touch(egg, "tickle", T)).toEqual({ gained: 0, asleep: false });
    expect(egg.phase).toBe("egg");
    expect(bond(egg)).toBeUndefined();
  });

  it("pays a creature in a field as at home (the Stage is what refuses the habitat and the arena), and a poke pays nothing", () => {
    const save = adultSave();
    setPlace(save, "land");
    touch(save, "pet", T);
    expect(bond(save)?.xp).toBe(1);
    const poke = touch(save, "poke", T + 800);
    expect(poke).toEqual({ gained: 0, asleep: false });
    expect(bond(save)?.xp).toBe(1);
  });

  it("starts again with the next creature: after a death and a new egg, the creature that hatches has no `bond` key and is level 1", () => {
    const save = adultSave();
    touch(save, "pet", T);
    expect(bond(save)?.xp).toBe(1);
    killCreature(save, T + 1000);
    expect(startNewEgg(save, T + 2000)).toBe(true);
    expect(save.creature).toBeNull();
    simulateTo(save, T + 2000 + (tuning.egg.minutes + 1) * MINUTE);
    expect(save.phase).toBe("alive");
    expect("bond" in (save.creature as object)).toBe(false);
    expect(levelOf(bond(save)?.xp ?? 0)).toBe(1);
  });

  it("does not form a chain at 3 times the dev time speed (a held finger's 800 ms is 2,400 game ms), which is known and dev mode only", () => {
    const save = adultSave();
    for (let i = 0; i < 6; i++) touch(save, "pet", T + i * 2400);
    expect(bond(save)).toEqual({ xp: 6, chain: 1, at: T + 5 * 2400 });
  });
});

describe("Kid Mode is the old rule", () => {
  it("pays 15 happiness an hour in all, with no Bond written and the old result shape", () => {
    const save = aliveSave("pebblin", T);
    setStat(save, "happiness", 30);
    let total = 0;
    for (let i = 0; i < 20; i++) total += touch(save, "pet", T).gained;
    expect(total).toBe(15);
    expect(bond(save)).toBeUndefined();
    expect(touch(save, "tickle", T + 61 * MINUTE)).toEqual({ gained: 3, asleep: false });
    expect(bond(save)).toBeUndefined();
  });

  it("does not restart its window when the clock goes back (the old test, line for line)", () => {
    const save = aliveSave("pebblin", T);
    setStat(save, "happiness", 0);
    for (let i = 0; i < 20; i++) touch(save, "pet", T);
    expect(touch(save, "pet", T - 10 * MINUTE).gained).toBe(0);
  });

  it("leaves Bond data a profile already has as it is, and shows no level-up", () => {
    const save = aliveSave("pebblin", T);
    touch(save, "pet", T); // (writes nothing in Kid Mode)
    (save.creature as { bond?: unknown }).bond = { xp: 299, chain: 4, at: T };
    const result = touch(save, "pet", T + 800);
    expect(bond(save)).toEqual({ xp: 299, chain: 4, at: T });
    expect("levelUp" in result).toBe(false);
  });

  it("follows the rule the setting has at each touch: off between two pets means the Kid rule for that one and Bond as it was", () => {
    const save = adultSave();
    touch(save, "pet", T);
    touch(save, "pet", T + 800);
    expect(bond(save)).toEqual({ xp: 2, chain: 2, at: T + 800 });
    save.settings.adultMode = false;
    touch(save, "pet", T + 1600);
    expect(bond(save)).toEqual({ xp: 2, chain: 2, at: T + 800 });
    save.settings.adultMode = true;
    touch(save, "pet", T + 2400);
    expect(bond(save)).toEqual({ xp: 3, chain: 3, at: T + 2400 }); // (the gap is read from the last pet that counted, 1,600 ms)
  });
});

describe("what is saved", () => {
  it("keeps a hold of 150 pets through a reload: the chain is stored at 10, never more, and the loader keeps the XP", () => {
    const save = adultSave();
    for (let i = 0; i < 150; i++) touch(save, "pet", T + i * 800);
    expect(bond(save)).toEqual({ xp: 9 + 141 * 2, chain: 10, at: T + 149 * 800 }); // 9 pets of 1, then 141 of 2
    expect(bond(reloaded(save))).toEqual({ xp: 291, chain: 10, at: T + 149 * 800 });
  });

  it("reads a good Bond as it is and ignores other keys in it", () => {
    expect(coerceBond({ xp: 920, chain: 4, at: 1234.5 })).toEqual({ xp: 920, chain: 4, at: 1234.5 });
    expect(coerceBond({ xp: 15000, chain: 10, at: 0, mood: "happy" })).toEqual({ xp: 15000, chain: 10, at: 0 });
  });

  it("drops a damaged Bond whole: wrong kinds, fractions, negatives, over the limits, missing keys, inherited keys, a null, an array and a string", () => {
    const bad: unknown[] = [
      undefined,
      null,
      "bond",
      42,
      [],
      [1, 2, 3],
      {},
      { xp: "5", chain: 1, at: 0 },
      { xp: 5.5, chain: 1, at: 0 },
      { xp: -1, chain: 1, at: 0 },
      { xp: 15001, chain: 1, at: 0 },
      { xp: Number.NaN, chain: 1, at: 0 },
      { xp: Number.POSITIVE_INFINITY, chain: 1, at: 0 },
      { xp: 5, chain: 11, at: 0 },
      { xp: 5, chain: 1.5, at: 0 },
      { xp: 5, chain: -1, at: 0 },
      { xp: 5, chain: 1, at: -1 },
      { xp: 5, chain: 1, at: Number.NaN },
      { xp: 5, chain: 1, at: Number.POSITIVE_INFINITY },
      { xp: 5, chain: 1 },
      { chain: 1, at: 0 },
      { xp: 5, at: 0 },
      Object.create({ xp: 5, chain: 1, at: 0 }),
      { constructor: { xp: 5, chain: 1, at: 0 } },
    ];
    expect(() => coerceBond(null)).not.toThrow();
    for (const value of bad) expect(coerceBond(value)).toBeUndefined();
  });

  it("is dropped by the loader when damaged and never throws, whatever the creature is", () => {
    const save = adultSave();
    touch(save, "pet", T);
    const good = reloaded(save);
    expect(bond(good)).toEqual({ xp: 1, chain: 1, at: T });
    for (const junk of ["x", 5, [], { xp: 1 }, { xp: 99999, chain: 1, at: 0 }]) {
      const copy = JSON.parse(JSON.stringify(save));
      copy.creature.bond = junk;
      const loaded = migrateSave(copy) as Save;
      expect(loaded.creature).not.toBeNull();
      expect("bond" in (loaded.creature as object)).toBe(false);
    }
    for (const creature of [null, "a creature", 7, []]) {
      const copy = JSON.parse(JSON.stringify(save));
      copy.creature = creature;
      expect(() => migrateSave(copy)).not.toThrow();
    }
  });

  it("keeps Bond data in a Kid profile, and the save stays version 3", () => {
    const save = aliveSave("pebblin", T);
    (save.creature as { bond?: unknown }).bond = { xp: 920, chain: 0, at: 0 };
    const loaded = reloaded(save);
    expect(bond(loaded)).toEqual({ xp: 920, chain: 0, at: 0 });
    expect(loaded.version).toBe(3);
  });
});
