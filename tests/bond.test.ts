// Bond (src/game/bond.ts, docs/adult-a3-plan.md section 4): the levels, what a pet and a tickle earn, the taper that replaces the hourly cap in Adult Mode, and what is saved.
// The expected numbers are worked out by hand in the comments, not read from the code.
import { describe, expect, it } from "vitest";
import { startJob, startNewEgg, touch } from "../src/game/actions";
import { createView, FOND_CHANCE, updateView } from "../src/art/idle";
import type { Mood } from "../src/art/idle";
import { moodOf } from "../src/art/scene";
import { BIG_BURST_LEVEL, FOND_LEVEL, bondAtLeast, bondInfo, coerceBond, earnBond, isAdultSave, levelOf, nextUnlock, taper, unlockAt } from "../src/game/bond";
import { bondLabel, bondLines, bondPercent, isAdultMode } from "../src/game/hud";
import { killCreature, setPlace, setStat } from "../src/game/dev";
import { simulateTo } from "../src/game/sim";
import { migrateSave, newSave } from "../src/game/state";
import type { Save } from "../src/game/state";
import { MINUTE } from "../src/game/time";
import { tuning } from "../src/data/tuning";
import { aliveSave, at, stageForm } from "./helpers";

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

  it("name only the unlocks that exist: a happy bounce of its own at level 2 and a bigger burst at level 5", () => {
    expect([1, 2, 3, 4, 5, 6, 10].map(unlockAt)).toEqual([null, "a happy bounce of its own now and then", null, null, "a bigger burst when petted", null, null]);
    expect(nextUnlock(1)).toEqual({ level: 2, text: "a happy bounce of its own now and then" });
    expect(nextUnlock(2)).toEqual({ level: 5, text: "a bigger burst when petted" });
    expect(nextUnlock(5)).toBeNull();
    expect([FOND_LEVEL, BIG_BURST_LEVEL]).toEqual([2, 5]);
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

  it("keeps the window at 59 minutes and starts it again at exactly 60", () => {
    const save = adultSave();
    setStat(save, "happiness", 0);
    for (let i = 0; i < 30; i++) touch(save, "pet", T);
    expect(touch(save, "pet", T + 59 * MINUTE).gained).toBe(0.5);
    expect(touch(save, "pet", T + 60 * MINUTE).gained).toBe(2);
  });

  it("shares the window with Kid Mode: 30 Adult pets leave a Kid pet in the same hour nothing, and the reverse", () => {
    const save = adultSave();
    setStat(save, "happiness", 0);
    for (let i = 0; i < 30; i++) touch(save, "pet", T); // the window has gained 34 (8 x 2 + 14 x 1 + 8 x 0.5)
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

describe("what the levels unlock (Adult Mode)", () => {
  const withXp = (xp: number, adult = true): Save => {
    const save = adultSave();
    save.settings.adultMode = adult;
    (save.creature as { bond?: unknown }).bond = { xp, chain: 0, at: 0 };
    return save;
  };
  const awake: Mood = { asleep: false, sad: false, sick: false };
  // A creature that has just finished standing still, asked what to do next when every roll of the dice comes out as `roll`.
  const choice = (mood: Mood, roll: number) => {
    const view = createView();
    view.pose = "idle";
    view.poseTime = 99;
    view.poseLength = 1;
    updateView(view, 0.05, mood, () => roll, 48);
    return view;
  };

  it("is fond from level 2 in Adult Mode, and never in Kid Mode (whatever Bond data it holds), as an egg or in a grave", () => {
    expect([299, 300, 15000].map((xp) => bondAtLeast(withXp(xp), FOND_LEVEL))).toEqual([false, true, true]);
    expect([2999, 3000].map((xp) => bondAtLeast(withXp(xp), BIG_BURST_LEVEL))).toEqual([false, true]);
    expect(bondAtLeast(withXp(15000, false), FOND_LEVEL)).toBe(false);
    expect(moodOf(withXp(300)).fond).toBe(true);
    expect(moodOf(withXp(299)).fond).toBe(false);
    expect(moodOf(withXp(300, false)).fond).toBe(false);
    const dead = withXp(300);
    killCreature(dead, T + 1000);
    expect(bondAtLeast(dead, FOND_LEVEL)).toBe(false);
    expect(bondAtLeast(newSave(T, 1), FOND_LEVEL)).toBe(false);
  });

  it("makes a fond creature in a good mood bounce for joy and show a heart on a roll under 0.12, and spreads the rest of the roll over the walk, hop and turn shares that are left", () => {
    const fond = { ...awake, fond: true };
    expect(FOND_CHANCE).toBe(0.12);
    for (const roll of [0, 0.05, FOND_CHANCE - 1e-9]) {
      const view = choice(fond, roll);
      expect(view.pose, `roll ${roll}`).toBe("happy");
      expect(view.effects.map((e) => e.kind)).toEqual(["heart"]);
    }
    expect(choice(fond, FOND_CHANCE).pose).toBe("walk"); // (the next share of the roll is the first walk)
    expect(choice(fond, 0.4).pose).toBe("walk");
    expect(choice(fond, 0.56).pose).toBe("hop"); // (0.56 is 0.5 of what is left: the hop's share)
    expect(choice(fond, 0.7).pose).toBe("hop"); // (0.7 is 0.66 of what is left; without the spreading it would be a turn on the spot)
  });

  it("leaves a creature that is not fond as it was, and a fond one in low spirits too", () => {
    for (const roll of [0, 0.05, 0.11]) {
      expect(choice(awake, roll).pose).toBe("walk");
      expect(choice(awake, roll).effects).toEqual([]);
      for (const low of [{ sad: true }, { sick: true }, { hungry: true }, { sleepy: true }]) {
        const view = choice({ ...awake, fond: true, ...low }, roll);
        expect(view.pose, `${JSON.stringify(low)} at ${roll}`).not.toBe("happy");
        expect(view.effects).toEqual([]);
      }
    }
    // A hungry or sleepy creature growls or yawns on rolls under 0.25; from 0.25 the low-spirits branch is what stops a bounce (0.3 and 0.32 are 0.07 and 0.09 of what is left, under 0.12).
    for (const roll of [0.3, 0.32]) {
      for (const low of [{ hungry: true }, { sleepy: true }]) {
        const view = choice({ ...awake, fond: true, ...low }, roll);
        expect(view.pose, `${JSON.stringify(low)} at ${roll}`).toBe("walk");
        expect(view.effects).toEqual([]);
      }
    }
    expect(choice(awake, 0.7).pose).toBe("idle"); // (a turn on the spot, as before)
  });
});

describe("growth (Adult Mode)", () => {
  // A young creature held and petted for five minutes, one pet every 800 ms, from the given happiness; the happy cells growth counted.
  const hold = (adult: boolean, happiness: number): number => {
    const save = aliveSave(stageForm("young"), T);
    save.settings.adultMode = adult;
    setStat(save, "happiness", happiness);
    for (let i = 0; i < 375; i++) touch(save, "pet", T + i * 800);
    return save.creature!.counters.happyCells;
  };

  it("earns happy cells only inside the old hourly limit: a hold at 100 earns none, a hold from 90 earns the one it climbed for, in both modes", () => {
    expect(hold(true, 100)).toBe(0); // (without the rule each minute's small decay is topped up again: a cell a minute)
    expect(hold(false, 100)).toBe(0);
    expect(hold(true, 90)).toBe(1); // (five pets of 2 take 90 to 100 with 10 of the 15 gained)
    expect(hold(false, 90)).toBe(1);
    expect(hold(true, 85)).toBe(1); // (seven pets of 2 reach 99 with 14 gained; the eighth, which starts under the limit, crosses 100)
    expect(hold(false, 85)).toBe(1); // (the eighth Kid pet pays the 1 that is left of the 15)
  });

  it("earns no cell when the window has gained the old limit exactly, as the Kid rule pays nothing then", () => {
    for (const adult of [true, false]) {
      const save = aliveSave(stageForm("young"), T);
      save.settings.adultMode = adult;
      setStat(save, "happiness", 0);
      for (let i = 0; i < 5; i++) touch(save, "tickle", T); // 5 x 3 = 15 in both modes
      expect(save.creature?.affection.gained).toBe(15);
      setStat(save, "happiness", 99.5);
      touch(save, "pet", T);
      expect(save.creature?.stats.happiness).toBe(adult ? 100 : 99.5); // (the Adult pet pays 1 at the half rate; the Kid pet nothing)
      expect(save.creature?.counters.happyCells).toBe(0);
    }
  });
});

describe("what the screen says (Adult Mode)", () => {
  const withXp = (xp: number) => {
    const c = aliveSave("pebblin", T).creature!;
    c.bond = { xp, chain: 0, at: 0 };
    return c;
  };
  const how = ["Hold to pet, or tap three times to tickle: both build Bond.", "Poke: gets attention."];

  it("reads the level and what is left, for a screen reader", () => {
    expect(bondLabel(withXp(920))).toBe("Bond level 3, 120 of 700 to level 4");
    expect(bondLabel(withXp(0))).toBe("Bond level 1, 0 of 300 to level 2");
    expect(bondLabel(aliveSave("pebblin", T).creature!)).toBe("Bond level 1, 0 of 300 to level 2"); // (a creature with no Bond yet)
    expect(bondLabel(withXp(15000))).toBe("Bond level 10, the top level");
  });

  it("fills the bar by the share of the level done: 0, 17 (120 of 700), 99 (299 of 300) and, at the top, 100", () => {
    expect([0, 920, 299, 15000, 20].map((xp) => bondPercent(withXp(xp)))).toEqual([0, 17, 99, 100, 6]);
  });

  it("lists where it stands, the next unlock that exists, and what each way of touching does", () => {
    expect(bondLines(withXp(0))).toEqual(["Bond level 1 of 10.", "0 of 300 to level 2.", "Level 2: a happy bounce of its own now and then.", ...how]);
    expect(bondLines(withXp(920))).toEqual(["Bond level 3 of 10.", "120 of 700 to level 4.", "Level 5: a bigger burst when petted.", ...how]);
    expect(bondLines(withXp(3000))).toEqual(["Bond level 5 of 10.", "0 of 1500 to level 6.", ...how]); // (nothing further is unlocked yet)
    expect(bondLines(withXp(15000))).toEqual(["Bond level 10 of 10.", "The top level.", ...how]);
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
      Object.assign([], { xp: 5, chain: 1, at: 0 }), // (an array that carries the three keys by name)
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
