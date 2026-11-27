// Field tappables, the rules (src/game/tappables.ts, src/data/tappables.ts) and a burst's pay (src/game/training.ts: payBurst, resultLines): docs/adult-a3-plan.md section 17. Draws are forced with a
// scripted generator, so every case is named and the same each run. The game's own handling (the clocks, the blocks, the tap) is in tappables-game.test.ts.
import { describe, expect, it } from "vitest";
import { materialIds } from "../src/data/habitat";
import { pickups, tapKinds, tapTuning } from "../src/data/tappables";
import { bondOf } from "../src/game/bond";
import { nextWait, payPickup, payRustle, paySparkle, pickKind, place, possibleKinds, tappableAt, touches } from "../src/game/tappables";
import type { Tappable, Visit } from "../src/game/tappables";
import type { Rng } from "../src/game/rng";
import { makeRng } from "../src/game/rng";
import { newBugCatch, payBurst, resultLines } from "../src/game/training";
import type { BugCatchState } from "../src/game/training";
import { careState, stageForm } from "./helpers";

// `next` gives these numbers in turn, then the last for ever; `int`, `chance` and `pick` are the real generator's own formulas on top of it.
function rngOf(...values: number[]): Rng {
  const next = (): number => (values.length > 1 ? (values.shift() as number) : (values[0] as number));
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (items) => items[Math.floor(next() * items.length)] as (typeof items)[number],
    state: () => 0,
  };
}

// The draw that makes `rng.int(min, max)` come out as `n`.
const drawFor = (n: number, min: number, max: number): number => (n - min + 0.5) / (max - min + 1);
const xDraw = (x: number): number => drawFor(x, 12, 108);
const yDraw = (y: number): number => drawFor(y, 96, 109);

const visit = (over: Partial<Visit> = {}): Visit => ({ bornAt: 1, place: "land", rng: rngOf(0), made: 0, pickupMade: false, nextId: 1, ...over });
const tp = (id: number, kind: Tappable["kind"], x: number, y: number): Tappable => ({ id, kind, x, y, born: 0 });

describe("the tuning", () => {
  it("is the built numbers, as literals (the plan's, except the band's far edges: 108 and 109 for an 8 pixel picture where the plan had 107 and 108 for 9; a constant a test imports cannot catch that constant changing)", () => {
    expect(tapTuning.delayMs).toEqual([20_000, 40_000]);
    expect(tapTuning.clockCapMs).toBe(2000);
    expect(tapTuning.most).toBe(4);
    expect(tapTuning.lifeMs).toBe(90_000);
    expect(tapTuning.weights).toEqual({ sparkle: 4, rustle: 3, bug: 3, pickup: 2 });
    expect(tapTuning.burstMs).toBe(10_000);
    expect(tapTuning.burstXpMax).toBe(6);
    expect([tapTuning.size, tapTuning.pad, tapTuning.tries, tapTuning.gap]).toEqual([8, 8, 6, 2]);
    expect(tapTuning.band).toEqual({ xMin: 12, xMax: 108, yMin: 96, yMax: 109 });
    expect(tapKinds).toEqual(["sparkle", "rustle", "bug", "pickup"]);
  });

  it("names each field's pickup and the material it pays (the material of the real spot that matches it: Trees, Pond, Rock pile)", () => {
    expect(pickups).toEqual({
      land: { name: "acorn", article: "an", material: "wood" },
      water: { name: "shell", article: "a", material: "fish" },
      sky: { name: "crystal", article: "a", material: "stone" },
    });
  });
});

describe("the wait to the next spawn", () => {
  it("is 20,000 ms at the bottom of the draw and 40,000 at the top (both ends reachable)", () => {
    expect(nextWait(rngOf(0))).toBe(20_000);
    expect(nextWait(rngOf(0.999999))).toBe(40_000);
  });

  it("is always inside the range for the real generator", () => {
    const rng = makeRng(7);
    const waits = Array.from({ length: 500 }, () => nextWait(rng));
    expect(Math.min(...waits)).toBeGreaterThanOrEqual(20_000);
    expect(Math.max(...waits)).toBeLessThanOrEqual(40_000);
  });
});

describe("which kind is made", () => {
  const all = { sparkle: true, rustle: true, bug: true, pickup: true };
  // r x 12 is taken down by 4, 3, 3 and 2: sparkle 0 to 4, rustle 4 to 7, bug 7 to 10, pickup 10 to 12.
  it("walks sparkle, rustle, bug, pickup by their weights (4, 3, 3, 2), a slice's edge belonging to the next kind", () => {
    const at = (r: number): string => pickKind(all, rngOf(r));
    expect([0, 3.99 / 12, 4 / 12, 6.99 / 12, 7 / 12, 9.99 / 12, 10 / 12, 0.999999].map(at)).toEqual(["sparkle", "sparkle", "rustle", "rustle", "bug", "bug", "pickup", "pickup"]);
  });

  it("never takes a kind that is not possible: no bug leaves sparkle 0 to 4, rustle 4 to 7, pickup 7 to 9 (r x 9)", () => {
    const can = { ...all, bug: false };
    expect([0, 3.99 / 9, 4 / 9, 6.99 / 9, 7 / 9, 0.999999].map((r) => pickKind(can, rngOf(r)))).toEqual(["sparkle", "sparkle", "rustle", "rustle", "pickup", "pickup"]);
  });

  it("with no pickup left the top of the draw is a bug, and with neither it is a rustle", () => {
    expect(pickKind({ ...all, pickup: false }, rngOf(0.999999))).toBe("bug");
    expect(pickKind({ ...all, pickup: false, bug: false }, rngOf(0.999999))).toBe("rustle");
  });

  it("allows a bug only when the creature can train and none is out, and the pickup only once a visit", () => {
    const v = visit();
    expect(possibleKinds(v, [], true)).toEqual(all);
    expect(possibleKinds(v, [], false).bug).toBe(false);
    expect(possibleKinds(v, [tp(1, "bug", 20, 100)], true).bug).toBe(false);
    expect(possibleKinds(v, [tp(1, "sparkle", 20, 100)], true).bug).toBe(true);
    expect(possibleKinds(visit({ pickupMade: true }), [], true).pickup).toBe(false);
  });
});

describe("where a tappable goes", () => {
  const creature = { x: 60, y: 80, w: 32, h: 32 }; // a creature standing in the middle, feet on row 112

  it("is the first try that is in the band and clear of the creature, drawn as x then y", () => {
    expect(place(rngOf(xDraw(12), yDraw(96)), creature, [])).toEqual({ x: 12, y: 96 });
    expect(place(rngOf(xDraw(108), yDraw(109)), creature, [])).toEqual({ x: 108, y: 109 });
  });

  it("keeps the picture clear of the creature's box widened by the hit pad (8): on its left and its right side a picture one pixel inside is refused and one touching is taken (the band's rows all lie inside the widened box's rows, so only its sides can matter)", () => {
    // the creature's box widened: x 52 to 100, y 72 to 120. The picture is 8 wide, so x 44 is the last that stays left of 52 (44 + 8 = 52, touching, not overlapping).
    expect(place(rngOf(xDraw(45), yDraw(100), xDraw(44), yDraw(100)), creature, [])).toEqual({ x: 44, y: 100 });
    expect(place(rngOf(xDraw(99), yDraw(100), xDraw(100), yDraw(100)), creature, [])).toEqual({ x: 100, y: 100 }); // (the widened box ends at x 100: 99 overlaps it by a pixel)
  });

  it("keeps 2 pixels between two pictures: a gap of 1 is refused, of 2 is taken", () => {
    const other = [tp(1, "sparkle", 20, 100)]; // x 20 to 28
    expect(place(rngOf(xDraw(29), yDraw(100), xDraw(30), yDraw(100)), creature, other)).toEqual({ x: 30, y: 100 });
    const above = [tp(2, "sparkle", 20, 96)]; // rows 96 to 103: a picture starting at row 105 leaves 1 row between (104), at row 106 leaves 2
    expect(place(rngOf(xDraw(20), yDraw(105), xDraw(20), yDraw(106)), creature, above)).toEqual({ x: 20, y: 106 });
  });

  it("tries six times: the sixth try is taken, and six that are in the way give null", () => {
    const blocked = [xDraw(70), yDraw(100)]; // inside the creature's widened box
    expect(place(rngOf(...blocked, ...blocked, ...blocked, ...blocked, ...blocked, xDraw(12), yDraw(96)), creature, [])).toEqual({ x: 12, y: 96 });
    // (six blocked tries use twelve draws; a seventh would read the last one again as an x, which is a free spot)
    expect(place(rngOf(...blocked, ...blocked, ...blocked, ...blocked, ...blocked, ...blocked), creature, [])).toBeNull();
  });
});

describe("a touch", () => {
  const p = tp(1, "sparkle", 50, 100); // x 50 to 58, y 100 to 108

  it("counts up to the pad (8) past the picture on each side and not a hair further", () => {
    expect([touches(p, 42, 104), touches(p, 41.9, 104), touches(p, 66, 104), touches(p, 66.1, 104)]).toEqual([true, false, true, false]);
    expect([touches(p, 54, 92), touches(p, 54, 91.9), touches(p, 54, 116), touches(p, 54, 116.1)]).toEqual([true, false, true, false]);
  });

  it("is for the nearest of those it touches, and the newest when two are as near", () => {
    const a = tp(1, "sparkle", 50, 100);
    const b = tp(2, "rustle", 60, 100); // middles at 54 and 64
    expect(tappableAt([a, b], 56, 104)?.id).toBe(1);
    expect(tappableAt([a, b], 62, 104)?.id).toBe(2);
    expect(tappableAt([a, b], 59, 104)?.id).toBe(2); // 59 is 5 from 54 and 5 from 64: the newest
    expect(tappableAt([b, a], 59, 104)?.id).toBe(2); // (whatever the list's order)
    expect(tappableAt([a, b], 20, 104)).toBeNull();
  });
});

describe("what a tap pays", () => {
  const fresh = () => careState(stageForm("adult"), {}, Date.UTC(2026, 0, 5, 10));

  it("a sparkle is 1 coin, or in half of the draws 1 material (an even draw of the five)", () => {
    const coin = fresh();
    expect(paySparkle(coin, rngOf(0.5), 1)).toBe("Found 1 coin."); // (0.5 is not under 1/2)
    expect([coin.coins, coin.inventory]).toEqual([1, {}]);
    const mat = fresh();
    expect(paySparkle(mat, rngOf(0.49, 0.5), 1)).toBe("Found some wood.");
    expect([mat.coins, mat.inventory]).toEqual([0, { wood: 1 }]);
    expect(materialIds).toEqual(["fiber", "herb", "wood", "fish", "stone"]);
    const first = fresh();
    paySparkle(first, rngOf(0, 0), 1);
    const last = fresh();
    paySparkle(last, rngOf(0, 0.999999), 1);
    expect([first.inventory, last.inventory]).toEqual([{ fiber: 1 }, { stone: 1 }]);
  });

  it("a rustle is a found gift in half of the draws (the initiative's gift: 2 coins in a third, else 1 material) and otherwise Bond XP 3", () => {
    const gift = fresh();
    const g = payRustle(gift, gift.creature!, rngOf(0.49, 0.1), 1);
    expect([g.found, g.note, gift.coins, bondOf(gift.creature!).xp]).toEqual([true, "Found 2 coins.", 2, 0]);
    const herb = fresh();
    const h = payRustle(herb, herb.creature!, rngOf(0.49, 0.5, 0.3), 1); // gift, not coins, the second material of five
    expect([h.found, h.note, herb.inventory]).toEqual([true, "Found some herbs.", { herb: 1 }]);
    const moment = fresh();
    const m = payRustle(moment, moment.creature!, rngOf(0.5), 1);
    expect([m.found, m.note, moment.coins, moment.inventory, bondOf(moment.creature!).xp]).toEqual([false, "A moment together: +3 Bond XP.", 0, {}, 3]);
  });

  it("a rustle that reaches a Bond level says which, and writes it in the log", () => {
    const s = fresh();
    s.creature!.bond = { xp: 298, chain: 0, at: 0 }; // level 2 starts at 300 (`levelAt[1]`): +3 reaches it
    const r = payRustle(s, s.creature!, rngOf(0.5), 1);
    expect(r.level).toBe(2);
    expect(s.log.at(-1)?.text).toBe("Bond level 2");
  });

  it("a pickup is 1 of its field's material with its own name, and one line in the log", () => {
    const rows: Array<[keyof typeof pickups, string, string]> = [
      ["land", "wood", "Found an acorn."],
      ["water", "fish", "Found a shell."],
      ["sky", "stone", "Found a crystal."],
    ];
    for (const [field, material, note] of rows) {
      const s = fresh();
      expect(payPickup(s, field, 1)).toBe(note);
      expect(s.inventory).toEqual({ [material]: 1 });
      expect(s.log.at(-1)?.text).toBe(note.slice(0, -1));
      payPickup(s, field, 2);
      expect(s.inventory).toEqual({ [material]: 2 });
    }
  });
});

describe("a burst", () => {
  const run = (catches: number, goldens: number): BugCatchState => ({ ...newBugCatch(1, "adult", 10_000), catches, goldens, over: true });

  it("is as long as it is told (10,000 ms here: the tuning's burst length is pinned in the tuning test), and a session is still 75,000 (the default)", () => {
    expect(newBugCatch(1, "adult", 10_000).lengthMs).toBe(10_000);
    expect(newBugCatch(1, "adult").lengthMs).toBe(75_000);
  });

  it("pays 1 Bond XP for each bug up to 6 (6 pays 6, 7 pays 6) and nothing for none", () => {
    const xp = (catches: number): number => {
      const s = careState(stageForm("adult"), {}, Date.UTC(2026, 0, 5, 10));
      const r = payBurst(s, s.creature!, run(catches, 0), "land", 1)!;
      expect(bondOf(s.creature!).xp).toBe(r.bondXp);
      return r.bondXp;
    };
    expect([0, 1, 3, 6, 7, 20].map(xp)).toEqual([0, 1, 3, 6, 6, 6]);
  });

  it("pays 1 of the field's material only when a golden bug was caught, and a run with no catch pays nothing and writes no log line", () => {
    const land = careState(stageForm("adult"), {}, Date.UTC(2026, 0, 5, 10));
    expect(payBurst(land, land.creature!, run(2, 0), "land", 1)!.material).toBeNull();
    expect(land.inventory).toEqual({});
    const gold = payBurst(land, land.creature!, run(2, 1), "water", 1)!;
    expect([gold.material, land.inventory]).toEqual(["fish", { fish: 1 }]);
    const none = careState(stageForm("adult"), {}, Date.UTC(2026, 0, 5, 10));
    const before = none.log.length;
    expect(payBurst(none, none.creature!, run(0, 0), "sky", 1)).toEqual({ burst: true, catches: 0, bondXp: 0, level: null, material: null });
    expect(none.log.length).toBe(before);
  });

  it("writes one line in the log for a catch: the number caught, the Bond XP and the material", () => {
    const s = careState(stageForm("adult"), {}, Date.UTC(2026, 0, 5, 10));
    const before = s.log.length;
    payBurst(s, s.creature!, run(3, 1), "water", 1);
    expect(s.log.slice(before).map((e) => e.text)).toEqual(["Bug burst: 3 caught, 3 Bond XP, 1 fish"]);
    const plain = careState(stageForm("adult"), {}, Date.UTC(2026, 0, 5, 10));
    const start = plain.log.length;
    payBurst(plain, plain.creature!, run(1, 0), "land", 1);
    expect(plain.log.slice(start).map((e) => e.text)).toEqual(["Bug burst: 1 caught, 1 Bond XP"]);
  });

  it("is not a training session: no Speed, no Discipline and no day count change", () => {
    const control = careState(stageForm("adult"), {}, Date.UTC(2026, 0, 5, 10));
    const s = careState(stageForm("adult"), {}, Date.UTC(2026, 0, 5, 10));
    payBurst(s, s.creature!, run(9, 3), "land", 1);
    expect(s.creature!.stats).toEqual(control.creature!.stats);
    expect(s.creature!.trained).toEqual(control.creature!.trained);
    expect(s.creature!.training).toEqual(control.creature!.training);
  });

  it("pays nobody when there is no living creature or it is away (null)", () => {
    const away = careState(stageForm("adult"), { away: true }, Date.UTC(2026, 0, 5, 10));
    expect(payBurst(away, away.creature!, run(3, 0), "land", 1)).toBeNull();
    const egg = careState(stageForm("adult"), {}, Date.UTC(2026, 0, 5, 10));
    expect(payBurst(egg, null, run(3, 0), "land", 1)).toBeNull();
  });

  it("is read out as the number caught, the Bond XP, the material and a new Bond level", () => {
    expect(resultLines({ burst: true, catches: 0, bondXp: 0, level: null, material: null })).toEqual(["No bugs caught."]);
    expect(resultLines({ burst: true, catches: 1, bondXp: 1, level: null, material: null })).toEqual(["Caught 1 bug.", "+1 Bond XP"]);
    expect(resultLines({ burst: true, catches: 5, bondXp: 5, level: 2, material: "wood" })).toEqual(["Caught 5 bugs.", "+5 Bond XP", "+1 Wood", "Bond level 2"]);
  });
});
