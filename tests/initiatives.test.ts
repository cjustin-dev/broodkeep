// The rules of creature initiatives (src/game/initiatives.ts, src/data/initiatives.ts; docs/adult-a3-plan.md section 14). Pure: every draw is forced through `rand`, every time is a number.
import { describe, expect, it } from "vitest";
import { forms } from "../src/data/forms";
import { initiativeKinds, initiativeTuning } from "../src/data/initiatives";
import type { InitiativeKind } from "../src/data/initiatives";
import { materialIds } from "../src/data/habitat";
import { bondOf } from "../src/game/bond";
import { countToss, cravingFoods, giftNote, isMoot, isOver, newInitiative, nextDelay, payBond, payGift, pickKind, possible, preferenceLine, preferenceOf, stepOf, weightOf } from "../src/game/initiatives";
import type { Initiative } from "../src/game/initiatives";
import type { Creature } from "../src/game/state";
import { aliveSave, at, careState, stageForm } from "./helpers";

// A `rand` that gives these numbers in turn, then the last one for ever.
const seq =
  (...values: number[]) =>
  (): number =>
    values.length > 1 ? (values.shift() as number) : (values[0] as number);

const T0 = at(10);
const creatureOf = (form: string, set: Parameters<typeof careState>[1] = {}): Creature => careState(form, set, T0).creature!;
// A creature whose form id is any string: the weights read only the id and the Bond level.
const named = (formId: string, xp = 0): Creature => {
  const c = creatureOf(stageForm("adult"));
  c.formId = formId;
  c.bond = { xp, chain: 0, at: 0 };
  return c;
};

describe("the wait to the next initiative", () => {
  it("is 60,000 ms at rand 0 and 90,000 ms at the top, and never outside, for the middle of each of the 30,001 steps", () => {
    expect(initiativeTuning.delayMs).toEqual([60_000, 90_000]);
    expect(nextDelay(() => 0)).toBe(60_000);
    expect(nextDelay(() => 0.999999)).toBe(90_000);
    expect(nextDelay(() => 1 - Number.EPSILON)).toBe(90_000);
    let lowest = Infinity;
    let highest = -Infinity;
    for (let k = 0; k <= 30_000; k++) {
      const wait = nextDelay(() => (k + 0.5) / 30_001); // (the middle of the step: k / 30,001 can round to just under k in floating point)
      expect(wait, `k ${k}`).toBe(60_000 + k);
      lowest = Math.min(lowest, wait);
      highest = Math.max(highest, wait);
    }
    expect([lowest, highest]).toEqual([60_000, 90_000]);
  });
});

describe("the weights by form and Bond level", () => {
  it("gives every kind a step of 0, 1 or 2 that never changes for a form", () => {
    for (const form of Object.keys(forms)) {
      for (const kind of initiativeKinds) {
        const step = stepOf(form, kind);
        expect([0, 1, 2], `${form} ${kind}`).toContain(step);
        expect(stepOf(form, kind)).toBe(step);
      }
    }
  });

  it("makes the forms differ: more than one weight vector among the real forms, and a pair that differs by name", () => {
    const vectors = new Set(Object.keys(forms).map((form) => initiativeKinds.map((kind) => weightOf(form, 1, kind)).join(",")));
    expect(vectors.size).toBeGreaterThan(1);
    // the same two ids give the same weights twice, and these two differ (computed, so a changed hash shows here)
    const a = initiativeKinds.map((kind) => stepOf("blip", kind)).join("");
    const b = initiativeKinds.map((kind) => stepOf("dustpuff", kind)).join("");
    expect(a).toBe(initiativeKinds.map((kind) => stepOf("blip", kind)).join(""));
    expect(a === b).toBe(false);
  });

  it("is the base plus the step, and play rises a quarter for each Bond level above the first, the others not", () => {
    for (const kind of initiativeKinds) {
      expect(weightOf("blip", 1, kind), kind).toBe(initiativeTuning.base[kind] + stepOf("blip", kind));
    }
    expect(initiativeTuning.base).toEqual({ play: 3, craving: 2, gift: 2 });
    expect(weightOf("blip", 5, "play") - weightOf("blip", 1, "play")).toBe(1);
    expect(weightOf("blip", 10, "play") - weightOf("blip", 1, "play")).toBe(2.25);
    expect(weightOf("blip", 5, "craving")).toBe(weightOf("blip", 1, "craving"));
    expect(weightOf("blip", 5, "gift")).toBe(weightOf("blip", 1, "gift"));
  });
});

describe("what a creature prefers", () => {
  // Look for ids whose steps make the weights tie: found by the test, so a changed hash still finds some.
  const find = (want: (steps: Record<InitiativeKind, number>) => boolean): string => {
    for (let n = 0; n < 5000; n++) {
      const id = `form-${n}`;
      const steps = { play: stepOf(id, "play"), craving: stepOf(id, "craving"), gift: stepOf(id, "gift") };
      if (want(steps)) return id;
    }
    throw new Error("no id found");
  };

  it("names the two heaviest kinds, heaviest first, and the line says them in words", () => {
    const id = find((s) => s.play === 0 && s.craving === 2 && s.gift === 1); // weights 3, 4, 3: craving, then play (a tie with gift, play first)
    expect(preferenceOf(named(id))).toEqual(["craving", "play"]);
    expect(preferenceLine(named(id))).toBe("Prefers: cravings, play.");
    const gifty = find((s) => s.play === 0 && s.craving === 0 && s.gift === 2); // 3, 2, 4
    expect(preferenceOf(named(gifty))).toEqual(["gift", "play"]);
    expect(preferenceLine(named(gifty))).toBe("Prefers: gifts, play.");
  });

  it("breaks a tie in the order play, craving, gift", () => {
    const three = find((s) => s.play === 0 && s.craving === 1 && s.gift === 1); // 3, 3, 3
    expect(preferenceOf(named(three))).toEqual(["play", "craving"]);
    const two = find((s) => s.play === 0 && s.craving === 2 && s.gift === 2); // 3, 4, 4
    expect(preferenceOf(named(two))).toEqual(["craving", "gift"]);
  });

  it("leans to play more as the Bond level rises, and does not depend on what is possible now", () => {
    const id = find((s) => s.play === 0 && s.craving === 2 && s.gift === 1); // 3, 4, 3 at level 1
    expect(preferenceOf(named(id, 0))[0]).toBe("craving");
    expect(preferenceOf(named(id, 15000))[0]).toBe("play"); // level 10: play 3 + 2.25 = 5.25
    const full = named(id);
    full.stats.hunger = 100; // nothing to crave now
    expect(preferenceOf(full)).toEqual(["craving", "play"]);
  });
});

describe("what it could ask for or be given", () => {
  it("asks for a food of its menu without the treat, from a kid's field foods", () => {
    const kid = creatureOf(stageForm("kid"));
    const foods = cravingFoods(kid);
    expect(foods.length).toBeGreaterThan(1);
    expect(foods).not.toContain("treat");
    expect(foods).toContain("pellet");
  });

  it("asks for nothing when it is full, asleep or away, and a baby can still ask for the pellet", () => {
    expect(cravingFoods(creatureOf(stageForm("baby")))).toEqual(["pellet"]);
    expect(possible(creatureOf(stageForm("baby"), { hunger: 100 }))).toEqual({ play: true, craving: false, gift: true });
    expect(cravingFoods(creatureOf(stageForm("kid"), { hunger: 95 }))).toEqual([]); // full at 95
    expect(cravingFoods(creatureOf(stageForm("kid"), { hunger: 94 })).length).toBeGreaterThan(0);
    expect(cravingFoods(creatureOf(stageForm("kid"), { sleep: "night" }))).toEqual([]);
    expect(cravingFoods(creatureOf(stageForm("kid"), { away: true }))).toEqual([]);
    expect(possible(creatureOf(stageForm("kid")))).toEqual({ play: true, craving: true, gift: true });
  });
});

describe("the draw of a kind", () => {
  it("takes the first kind with weight at rand 0 and the last at the top, and covers the weights as they are", () => {
    const c = named("blip");
    const w = initiativeKinds.map((kind) => weightOf("blip", 1, kind));
    expect(pickKind(c, () => 0)).toBe("play");
    expect(pickKind(c, () => 0.999999)).toBe("gift");
    const total = w[0]! + w[1]! + w[2]!;
    // the edges between the kinds: just under goes to the lower, exactly at it to the next (strict)
    expect(pickKind(c, () => (w[0]! - 1e-9) / total)).toBe("play");
    expect(pickKind(c, () => w[0]! / total)).toBe("craving");
    expect(pickKind(c, () => (w[0]! + w[1]! - 1e-9) / total)).toBe("craving");
    expect(pickKind(c, () => (w[0]! + w[1]!) / total)).toBe("gift");
    // the share of each over an even sweep is its weight over the total, within a hundredth
    const counts: Record<InitiativeKind, number> = { play: 0, craving: 0, gift: 0 };
    for (let k = 0; k < 10_000; k++) counts[pickKind(c, () => k / 10_000)]++;
    initiativeKinds.forEach((kind, i) => expect(counts[kind] / 10_000, kind).toBeCloseTo(w[i]! / total, 2));
  });

  it("never takes a craving when nothing can be asked for, whatever rand is, and takes the next kind at the edges", () => {
    const c = creatureOf(stageForm("kid"), { hunger: 100 });
    const w = initiativeKinds.map((kind) => (kind === "craving" ? 0 : weightOf(c.formId, bondOf(c).xp === 0 ? 1 : 2, kind)));
    expect(w[1]).toBe(0);
    for (let k = 0; k <= 1000; k++) expect(pickKind(c, () => k / 1001), `k ${k}`).not.toBe("craving");
    expect(pickKind(c, () => w[0]! / (w[0]! + w[2]!))).toBe("gift"); // exactly at the end of play: the craving, weighing 0, is skipped
  });
});

describe("a new initiative", () => {
  it("is made for this creature at this time, and a craving is a food it could ask for, never the treat", () => {
    const kid = creatureOf(stageForm("kid"));
    const foods = cravingFoods(kid);
    const seen = new Set<string>();
    const w = initiativeKinds.map((kind) => weightOf(kid.formId, 1, kind));
    const inCraving = (w[0]! + w[1]! / 2) / (w[0]! + w[1]! + w[2]!); // the middle of the craving's share of the draw
    for (let k = 0; k < foods.length; k++) {
      const i = newInitiative(kid, 5000, seq(inCraving, (k + 0.5) / foods.length));
      expect(i.kind).toBe("craving");
      expect([i.bornAt, i.at, i.gift, i.tosses, i.playFrom]).toEqual([kid.bornAt, 5000, null, 0, null]);
      expect(foods).toContain(i.food);
      seen.add(i.food!);
    }
    expect([...seen].sort()).toEqual([...foods].sort());
  });

  it("makes a gift of 2 coins when the second draw is under a third and a material otherwise, every material reachable", () => {
    const c = named("blip");
    const top = 0.999999; // the last kind, the gift
    expect(newInitiative(c, 0, seq(top, 0)).gift).toEqual({ kind: "coins", amount: 2 });
    expect(newInitiative(c, 0, seq(top, 0.3333)).gift).toEqual({ kind: "coins", amount: 2 });
    expect(newInitiative(c, 0, seq(top, 0.34, 0)).gift).toEqual({ kind: "material", id: "fiber" });
    expect(materialIds).toEqual(["fiber", "herb", "wood", "fish", "stone"]);
    materialIds.forEach((id, n) => expect(newInitiative(c, 0, seq(top, 0.5, n / 5)).gift, id).toEqual({ kind: "material", id }));
    expect(newInitiative(c, 0, seq(top, 0.5, 0.999999)).gift).toEqual({ kind: "material", id: "stone" });
    expect(newInitiative(c, 0, seq(top, 0)).food).toBeNull();
  });

  it("makes a play with nothing else on it", () => {
    const i = newInitiative(named("blip"), 7, () => 0);
    expect(i).toEqual({ kind: "play", bornAt: named("blip").bornAt, at: 7, food: null, gift: null, tosses: 0, playFrom: null });
  });
});

describe("when an initiative is over", () => {
  const made = (kind: InitiativeKind): Initiative => ({ kind, bornAt: 0, at: 1000, food: null, gift: null, tosses: 0, playFrom: null });

  it("fades a craving or a gift 30,000 ms after it was made, to the millisecond", () => {
    for (const kind of ["craving", "gift"] as const) {
      expect(isOver(made(kind), 1000 + 29_999), kind).toBe(false);
      expect(isOver(made(kind), 1000 + 30_000), kind).toBe(true);
      expect(isOver(made(kind), 1000), kind).toBe(false);
    }
    expect(initiativeTuning.fadeMs).toBe(30_000);
  });

  it("fades a play nobody has begun at 30,000 ms, and a play that has begun 15,000 ms after its first toss", () => {
    expect(isOver(made("play"), 1000 + 29_999)).toBe(false);
    expect(isOver(made("play"), 1000 + 30_000)).toBe(true);
    const i = made("play");
    expect(countToss(i, 29_000)).toBe(true); // a toss near the end of the 30 s: the play goes on 15 s from here, past the 30 s
    expect([isOver(i, 29_000 + 14_999), isOver(i, 29_000 + 15_000)]).toEqual([false, true]);
    expect(initiativeTuning.playMs).toBe(15_000);
  });

  it("counts six tosses and takes no seventh, the first one starting the 15 seconds", () => {
    const i = made("play");
    for (let n = 1; n <= 6; n++) {
      expect(countToss(i, 2000 + n * 100), `toss ${n}`).toBe(true);
      expect([i.tosses, i.playFrom]).toEqual([n, 2100]);
    }
    expect(isOver(i, 2700)).toBe(true); // six tosses end it at once
    expect(countToss(i, 2800)).toBe(false);
    expect(i.tosses).toBe(6);
    expect(initiativeTuning.tosses).toBe(6);
  });

  it("takes no toss when it is a craving or a gift or the play is already over by time", () => {
    for (const kind of ["craving", "gift"] as const) {
      const i = made(kind);
      expect(countToss(i, 2000), kind).toBe(false);
      expect([i.tosses, i.playFrom]).toEqual([0, null]);
    }
    const late = made("play");
    expect(countToss(late, 1000 + 30_000)).toBe(false);
    const begun = made("play");
    countToss(begun, 1500);
    expect(countToss(begun, 1500 + 15_000)).toBe(false);
  });
});

describe("what an answer pays", () => {
  it("pays Bond XP and logs only a level-up, returning the level", () => {
    const save = aliveSave(stageForm("adult"), T0);
    const c = save.creature!;
    c.bond = { xp: 290, chain: 3, at: 123 };
    const before = save.log.length;
    expect(payBond(save, c, 8, T0)).toBeNull(); // 298: no level
    expect(bondOf(c)).toEqual({ xp: 298, chain: 3, at: 123 });
    expect(save.log.length).toBe(before);
    expect(payBond(save, c, 2, T0)).toBe(2); // 300: level 2
    expect(bondOf(c).xp).toBe(300);
    expect(save.log.at(-1)?.text).toBe("Bond level 2");
    expect(save.log.length).toBe(before + 1);
    expect(initiativeTuning.tossXp).toBe(2);
    expect(initiativeTuning.cravingXp).toBe(8);
  });

  it("pays a gift exactly: 2 coins, or 1 of the material, with its note and one log line", () => {
    const save = aliveSave(stageForm("adult"), T0);
    save.coins = 5;
    expect(payGift(save, { kind: "coins", amount: 2 }, T0)).toBe("Found 2 coins.");
    expect([save.coins, save.inventory, save.log.at(-1)?.text]).toEqual([7, {}, "Found 2 coins"]);
    const notes = materialIds.map((id) => payGift(save, { kind: "material", id }, T0));
    expect(notes).toEqual(["Found some fiber.", "Found some herbs.", "Found some wood.", "Found some fish.", "Found some stone."]);
    expect([save.coins, save.inventory]).toEqual([7, { fiber: 1, herb: 1, wood: 1, fish: 1, stone: 1 }]);
    expect(giftNote({ kind: "material", id: "herb" })).toBe("Found some herbs.");
    payGift(save, { kind: "material", id: "herb" }, T0);
    expect(save.inventory.herb).toBe(2);
  });
});

describe("the words of a preference", () => {
  it("says play, cravings and gifts", () => {
    const words = (c: Creature): string => preferenceLine(c);
    const seen = new Set<string>();
    for (let n = 0; n < 200; n++) seen.add(words(named(`word-${n}`)));
    const all = [...seen].join(" ");
    expect(all).toMatch(/play/);
    expect(all).toMatch(/cravings/);
    expect(all).toMatch(/gifts/);
    for (const line of seen) expect(line).toMatch(/^Prefers: (play|cravings|gifts), (play|cravings|gifts)\.$/);
  });
});

describe("a moot craving", () => {
  it("is a craving whose food would be refused now (full, asleep, away) and never a play or a gift", () => {
    const c = creatureOf(stageForm("adult"));
    const food = cravingFoods(c)[0]!;
    const craving: Initiative = { kind: "craving", bornAt: c.bornAt, at: 0, food, gift: null, tosses: 0, playFrom: null };
    expect(isMoot(craving, c)).toBe(false);
    expect(isMoot(craving, creatureOf(stageForm("adult"), { hunger: 95 }))).toBe(true); // full at 95
    expect(isMoot(craving, creatureOf(stageForm("adult"), { hunger: 94 }))).toBe(false);
    expect(isMoot(craving, creatureOf(stageForm("adult"), { sleep: "night" }))).toBe(true);
    expect(isMoot(craving, creatureOf(stageForm("adult"), { away: true }))).toBe(true);
    expect(isMoot({ ...craving, food: null }, c)).toBe(true);
    expect(isMoot({ ...craving, kind: "play", food: null }, creatureOf(stageForm("adult"), { hunger: 100 }))).toBe(false);
    expect(isMoot({ ...craving, kind: "gift", food: null }, creatureOf(stageForm("adult"), { hunger: 100 }))).toBe(false);
  });
});
