// Calling the creature back early (callBackHaul in game/habitat/jobs.ts, callBack in game/actions.ts) and the words of the spot cards and
// the job card (game/habitat/cards.ts). The unit side of A2.1: what a call back brings home, in whole numbers and rounded down, what it leaves
// alone, and that the button's words equal what the tap does. The screen side (the cards, the two taps) is checked in a browser.
import { describe, expect, it } from "vitest";
import { materials, spotIds, spots } from "../src/data/habitat";
import type { SpotId } from "../src/data/habitat";
import { callBack, retireCreature, startJob } from "../src/game/actions";
import { killCreature } from "../src/game/dev";
import { cardText, coinsText, materialText, rangeText } from "../src/game/habitat/cards";
import { callBackHaul, jobProgress } from "../src/game/habitat/jobs";
import { simulateTo } from "../src/game/sim";
import { newSave } from "../src/game/state";
import type { Save } from "../src/game/state";
import { HOUR, MINUTE } from "../src/game/time";
import { aliveSave, at } from "./helpers";

const DAY = at(10); // mid morning, well inside the awake hours
const clone = (save: Save): Save => JSON.parse(JSON.stringify(save)) as Save;

// A grown creature at full energy that has just hatched at DAY (every spot is open to it).
const adult = (): Save => aliveSave("cindermane", DAY);
const lengthOf = (spot: SpotId): number => spots[spot].minutes * MINUTE;
const sent = (spot: SpotId): Save => {
  const save = adult();
  expect(startJob(save, spot, DAY)).toBe("started");
  return save;
};

// What a call back pays at each share of the job, worked out by hand from the ranges in data/habitat.ts (middle of the range x share,
// rounded down) and written as literals: the code under test is never used to make them. Shares are 0, 25, 33, 50, 99 and 100 percent.
const SHARES = [0, 25, 33, 50, 99, 100];
const PAYS: Record<SpotId, { coins: number[]; amount: number[] }> = {
  meadow: { coins: [0, 0, 0, 0, 1, 1], amount: [0, 0, 0, 0, 1, 1] }, // ranges 1 to 2 and 1 to 2, middles 1.5 and 1.5
  herbs: { coins: [0, 0, 0, 0, 1, 1], amount: [0, 0, 0, 0, 1, 1] },
  trees: { coins: [0, 0, 0, 1, 2, 2], amount: [0, 0, 0, 0, 1, 1] }, // 2 to 3 (2.5) and 1 to 2 (1.5)
  pond: { coins: [0, 0, 0, 1, 2, 3], amount: [0, 0, 0, 0, 1, 1] }, // 2 to 4 (3) and 1 to 2 (1.5)
  rocks: { coins: [0, 1, 1, 2, 3, 4], amount: [0, 0, 0, 1, 1, 2] }, // 3 to 5 (4) and 1 to 3 (2)
};

describe("what a call back pays (callBackHaul)", () => {
  it.each(spotIds)("%s: the literal numbers at 0, 25, 33, 50, 99 and 100 percent", (spot) => {
    const job = { spot, startedAt: DAY, endsAt: DAY + lengthOf(spot) };
    SHARES.forEach((pct, i) => {
      const now = DAY + (lengthOf(spot) * pct) / 100;
      expect(callBackHaul(job, now), `${spot} at ${pct}%`).toEqual({ coins: PAYS[spot].coins[i], amount: PAYS[spot].amount[i] });
    });
  });

  it("is exact on the hard cases: a whole number, an exact half, and a value just under a whole number", () => {
    const at25 = (spot: SpotId): number => DAY + lengthOf(spot) / 4;
    // Rock pile coins, middle 4, a quarter of the job: exactly 1 (rounding down must not turn an exact 1 into 0)
    expect(callBackHaul({ spot: "rocks", startedAt: DAY, endsAt: DAY + lengthOf("rocks") }, at25("rocks")).coins).toBe(1);
    // Bug meadow coins, middle 1.5, one minute of three: exactly 0.5, pays 0 (not rounded up to 1)
    expect(callBackHaul({ spot: "meadow", startedAt: DAY, endsAt: DAY + lengthOf("meadow") }, DAY + MINUTE).coins).toBe(0);
    // Pond coins, middle 3, one third (two minutes of six): exactly 1, and two thirds (four minutes): exactly 2
    const pond = { spot: "pond" as const, startedAt: DAY, endsAt: DAY + lengthOf("pond") };
    expect(callBackHaul(pond, DAY + 2 * MINUTE).coins).toBe(1);
    expect(callBackHaul(pond, DAY + 4 * MINUTE).coins).toBe(2);
    // Pond coins just under a whole: 3 x 0.99 = 2.97 pays 2, and one millisecond short of a third pays 0
    expect(callBackHaul(pond, DAY + lengthOf("pond") * 0.99).coins).toBe(2);
    expect(callBackHaul(pond, DAY + 2 * MINUTE - 1).coins).toBe(0);
  });

  it("never pays below nothing or above the middle of the range, whatever the clock says", () => {
    for (const spot of spotIds) {
      const job = { spot, startedAt: DAY, endsAt: DAY + lengthOf(spot) };
      expect(callBackHaul(job, DAY - 5 * HOUR), `${spot} before the start`).toEqual({ coins: 0, amount: 0 });
      expect(callBackHaul(job, DAY - 1), `${spot} a millisecond before`).toEqual({ coins: 0, amount: 0 });
      const whole = callBackHaul(job, DAY + 5 * HOUR); // far past the end
      expect(whole, `${spot} far past the end`).toEqual({ coins: PAYS[spot].coins[5], amount: PAYS[spot].amount[5] });
      expect(whole).toEqual(callBackHaul(job, job.endsAt));
    }
  });

  it("pays nothing, and never NaN, for a job with no length (a hand-made save)", () => {
    for (const [startedAt, endsAt] of [
      [DAY, DAY],
      [DAY, DAY - MINUTE],
    ]) {
      const job = { spot: "pond" as const, startedAt: startedAt!, endsAt: endsAt! };
      expect(callBackHaul(job, DAY + MINUTE)).toEqual({ coins: 0, amount: 0 });
      expect(jobProgress(job, DAY + MINUTE)).toBe(0);
    }
  });

  it("pays more or the same as time goes on, so a tap a moment after the button was drawn never pays less than it said", () => {
    for (const spot of spotIds) {
      const job = { spot, startedAt: DAY, endsAt: DAY + lengthOf(spot) };
      let before = { coins: 0, amount: 0 };
      for (let ms = 0; ms <= lengthOf(spot); ms += 1000) {
        const now = callBackHaul(job, DAY + ms);
        expect(now.coins, `${spot} ${ms} ms`).toBeGreaterThanOrEqual(before.coins);
        expect(now.amount, `${spot} ${ms} ms`).toBeGreaterThanOrEqual(before.amount);
        before = now;
      }
    }
  });

  it("jobProgress runs from 0 to 1 and is clamped", () => {
    const job = { spot: "pond" as const, startedAt: DAY, endsAt: DAY + lengthOf("pond") };
    expect(jobProgress(job, DAY - HOUR)).toBe(0);
    expect(jobProgress(job, DAY)).toBe(0);
    expect(jobProgress(job, DAY + 3 * MINUTE)).toBe(0.5);
    expect(jobProgress(job, DAY + 6 * MINUTE)).toBe(1);
    expect(jobProgress(job, DAY + HOUR)).toBe(1);
  });
});

describe("calling back (callBack)", () => {
  it("adds what the time earned to the bag and pushes it as a haul, and brings the creature home", () => {
    const save = sent("rocks");
    const now = DAY + 2 * MINUTE; // a quarter of eight minutes: 1 coin and no stone
    expect(callBack(save, now)).toBe("called");
    expect(save.creature!.job).toBeNull();
    expect(save.coins).toBe(1);
    expect(save.inventory.stone ?? 0).toBe(0);
    expect(save.hauls).toEqual([{ spot: "rocks", at: now, coins: 1, material: "stone", amount: 0 }]);
    expect(save.log.at(-1)!.text).toBe("Called back from the Rock pile early with 1 coins and 0 stone");
  });

  it("pays both a coin and a material when the time has earned both", () => {
    const save = sent("pond");
    const now = DAY + 5 * MINUTE; // five of six minutes: coins 3 x 5/6 = 2.5 -> 2, fish 1.5 x 5/6 = 1.25 -> 1
    expect(callBack(save, now)).toBe("called");
    expect(save.coins).toBe(2);
    expect(save.inventory.fish).toBe(1);
    expect(save.hauls).toEqual([{ spot: "pond", at: now, coins: 2, material: "fish", amount: 1 }]);
  });

  it("leaves no haul, and no card, when it earned nothing, and says so in the log", () => {
    const save = sent("meadow");
    expect(callBack(save, DAY + MINUTE)).toBe("called");
    expect(save.creature!.job).toBeNull();
    expect(save.coins).toBe(0);
    expect(save.inventory.fiber ?? 0).toBe(0);
    expect(save.hauls).toHaveLength(0);
    expect(save.log.at(-1)!.text).toBe("Called back from the Bug meadow early");
  });

  it("does not give the energy back, and does not count as a chore", () => {
    const save = sent("pond");
    const now = DAY + 4 * MINUTE;
    simulateTo(save, now); // the same catch-up the action starts with, so the only change left is the call back's own
    const energy = save.creature!.stats.energy;
    const chores = save.creature!.counters.chores;
    expect(callBack(save, now)).toBe("called");
    expect(save.creature!.stats.energy).toBe(energy);
    expect(save.creature!.counters.chores).toBe(chores);
  });

  it("pays once: a second tap finds the creature at home and adds nothing", () => {
    const save = sent("pond");
    const now = DAY + 4 * MINUTE;
    expect(callBack(save, now)).toBe("called");
    const after = JSON.stringify(save);
    expect(callBack(save, now)).toBe("nothing");
    expect(JSON.stringify(save)).toBe(after);
  });

  it("says nothing to call back for a creature at home, an egg and a dead creature, and changes nothing", () => {
    const home = adult();
    const egg = newSave(DAY, 1);
    const dead = sent("pond");
    killCreature(dead, DAY + MINUTE);
    for (const [label, save] of [
      ["at home", home],
      ["an egg", egg],
      ["dead", dead],
    ] as const) {
      simulateTo(save, DAY + 2 * MINUTE); // the catch-up every action starts with moves the stats; the call back itself must add nothing to it
      const before = JSON.stringify(save);
      expect(callBack(save, DAY + 2 * MINUTE), label).toBe("nothing");
      expect(JSON.stringify(save), label).toBe(before);
    }
    expect(dead.coins).toBe(0);
    expect(dead.hauls).toHaveLength(0);
  });

  it("a clock set back pays nothing and nothing negative, small step or large", () => {
    for (const back of [MINUTE, 3 * 24 * HOUR]) {
      const save = sent("pond");
      expect(callBack(save, DAY - back), `${back} ms back`).toBe("called");
      expect(save.coins).toBe(0);
      expect(save.hauls).toHaveLength(0);
      expect(Object.values(save.inventory).every((n) => n === undefined || n >= 0)).toBe(true);
    }
  });

  it("a job that ends in the very moment of the tap pays its full haul through the simulation, and the call back finds nothing to do", () => {
    const save = sent("pond");
    const end = DAY + lengthOf("pond");
    expect(callBack(save, end)).toBe("nothing");
    expect(save.hauls).toHaveLength(1);
    expect(save.hauls[0]!.coins).toBeGreaterThanOrEqual(spots.pond.coins[0]);
    expect(save.hauls[0]!.coins).toBeLessThanOrEqual(spots.pond.coins[1]);
    expect(save.creature!.counters.chores).toBe(1);
    // and far past the end, the same
    const late = sent("pond");
    expect(callBack(late, DAY + 5 * HOUR)).toBe("nothing");
    expect(late.hauls).toHaveLength(1);
  });

  it("keeps the welcome-back list to its limit: a paying call back is the newest, the oldest card is forgotten, and its coins are already in the bag", () => {
    const save = sent("rocks");
    save.hauls = [1, 2, 3, 4, 5].map((n) => ({ spot: "meadow" as const, at: DAY - n, coins: 1, material: "fiber" as const, amount: 1 }));
    save.coins = 5;
    expect(callBack(save, DAY + 4 * MINUTE)).toBe("called"); // half of 8 minutes: 2 coins, 1 stone
    expect(save.hauls).toHaveLength(5);
    expect(save.hauls.at(-1)).toEqual({ spot: "rocks", at: DAY + 4 * MINUTE, coins: 2, material: "stone", amount: 1 });
    expect(save.hauls[0]!.at).toBe(DAY - 2);
    expect(save.coins).toBe(7);
  });
});

describe("a call back and the rest of the creature's life", () => {
  it("works the same while the creature is asleep, sick or has a nap (the job never asked), and a dead one has nothing to call back", () => {
    const asleep = sent("rocks");
    asleep.creature!.sleep = "night";
    expect(callBack(asleep, DAY + 4 * MINUTE)).toBe("called");
    expect(asleep.coins).toBe(2);
    const napping = sent("rocks");
    napping.creature!.sleep = "nap";
    expect(callBack(napping, DAY + 4 * MINUTE)).toBe("called");
    expect(napping.coins).toBe(2);
    const sick = sent("rocks");
    sick.creature!.sick = true;
    expect(callBack(sick, DAY + 4 * MINUTE)).toBe("called");
    expect(sick.coins).toBe(2);
  });

  it("night falling while it is away does not stop the job: a call back after the sleeping hour starts pays the literal haul for the time done", () => {
    const save = adult();
    const evening = at(19, 55); // the sleeping hours start at 8 pm
    save.lastSimulatedAt = evening;
    save.creature!.bornAt = evening;
    expect(startJob(save, "rocks", evening)).toBe("started");
    simulateTo(save, at(20, 1)); // night began three minutes ago; the job (8 minutes) is still out
    expect(save.creature!.job).not.toBeNull();
    expect(callBack(save, at(20, 2))).toBe("called"); // 7 of the 8 minutes (it would end at 20:03): coins 4 x 7/8 = 3.5 -> 3, stone 2 x 7/8 = 1.75 -> 1
    expect(save.coins).toBe(3);
    expect(save.inventory.stone).toBe(1);
  });

  it("an away adult cannot retire; the call back brings it home with its haul, and then it can", () => {
    const save = sent("rocks");
    const now = DAY + 4 * MINUTE;
    expect(retireCreature(save, now)).toBe("away");
    expect(callBack(save, now)).toBe("called");
    expect(retireCreature(save, now)).toBe("retired");
    expect(save.coins).toBe(2); // the haul stays with the player (the Retire rules leave coins and the bag as they are)
    expect(save.retired).toHaveLength(1);
  });

  it("the passive device: a device left open on the old save finishes the job on its own clock, and neither device is paid twice", () => {
    const inUse = sent("pond");
    const passive = clone(inUse); // the same moment, still on the job
    expect(callBack(inUse, DAY + 3 * MINUTE)).toBe("called"); // half of six minutes: 1 coin (3 x 0.5 = 1.5), no fish (1.5 x 0.5 = 0.75)
    expect(inUse.coins).toBe(1);
    simulateTo(passive, DAY + 7 * MINUTE); // the idle device only had its clock move
    expect(passive.hauls).toHaveLength(1);
    expect(passive.coins).toBe(passive.hauls[0]!.coins);
    expect(passive.coins).toBeGreaterThanOrEqual(spots.pond.coins[0]);
    expect(inUse.hauls).toEqual([{ spot: "pond", at: DAY + 3 * MINUTE, coins: 1, material: "fish", amount: 0 }]); // the device that called back has its early haul only
    // Each save holds only its own device's coins. When sync keeps the newer document the player has one haul, never both (known-issues.md).
  });
});

describe("the words (game/habitat/cards.ts)", () => {
  // The spec's copy rule: no word of loss. Whole words, any case. Every string for every spot and every share of every job.
  const banned = /\b(sacrifice|release|lose|lost|delete|die|death|forever|gone|waste|wasted|penalty|fail|failed)\b/i;

  const TITLES: Record<SpotId, string> = {
    meadow: "Bug meadow: Fiber",
    herbs: "Herb patch: Herbs",
    trees: "Trees: Wood",
    pond: "Pond: Fish",
    rocks: "Rock pile: Stone",
  };
  const COSTS: Record<SpotId, string> = {
    meadow: "3 min, 5 energy",
    herbs: "3 min, 5 energy",
    trees: "5 min, 10 energy",
    pond: "6 min, 10 energy",
    rocks: "8 min, 15 energy",
  };
  const HAULS: Record<SpotId, string> = {
    meadow: "Haul: 1 to 2 coins, 1 to 2 Fiber",
    herbs: "Haul: 1 to 2 coins, 1 to 2 Herbs",
    trees: "Haul: 2 to 3 coins, 1 to 2 Wood",
    pond: "Haul: 2 to 4 coins, 1 to 2 Fish",
    rocks: "Haul: 3 to 5 coins, 1 to 3 Stone",
  };

  it.each(spotIds)("%s: the card's lines are these literal words", (spot) => {
    expect(cardText.title(spot)).toBe(TITLES[spot]);
    expect(cardText.cost(spot)).toBe(COSTS[spot]);
    expect(cardText.haul(spot)).toBe(HAULS[spot]);
    expect(cardText.spent(spot)).toBe(`Spent ${spots[spot].energyCost} energy, which does not come back.`);
  });

  it("the other words are these literals", () => {
    expect(cardText.send).toBe("Send");
    expect(cardText.spent("pond")).toBe("Spent 10 energy, which does not come back.");
  });

  it("counts are singular for one: 1 coin, 1 Herb, 1 Fish, and plural otherwise", () => {
    expect(coinsText(1)).toBe("1 coin");
    expect(coinsText(2)).toBe("2 coins");
    expect(materialText("herb", 1)).toBe("1 Herb");
    expect(materialText("herb", 2)).toBe("2 Herbs");
    expect(materialText("fish", 1)).toBe("1 Fish");
    expect(materialText("stone", 3)).toBe("3 Stone");
  });

  it("a range of one number is written as that number, and a range of two as 'low to high'", () => {
    expect(rangeText([2, 2], coinsText)).toBe("2 coins");
    expect(rangeText([1, 1], (n) => materialText("herb", n))).toBe("1 Herb");
    expect(rangeText([2, 4], coinsText)).toBe("2 to 4 coins");
    expect(rangeText([1, 2], (n) => materialText("herb", n))).toBe("1 to 2 Herbs");
  });

  it("the button's words are these literals at known moments", () => {
    const rocks = { spot: "rocks" as const, startedAt: DAY, endsAt: DAY + lengthOf("rocks") };
    expect(cardText.callBack(rocks, DAY)).toBe("Call back now: nothing earned yet");
    expect(cardText.callBack(rocks, DAY + 2 * MINUTE)).toBe("Call back now: 1 coin"); // a coin and no stone: the zero is not named
    expect(cardText.callBack(rocks, DAY + 4 * MINUTE)).toBe("Call back now: 2 coins, 1 Stone");
    const herbs = { spot: "herbs" as const, startedAt: DAY, endsAt: DAY + lengthOf("herbs") };
    expect(cardText.callBack(herbs, DAY + 3 * MINUTE - 1)).toBe("Call back now: 1 coin, 1 Herb");
  });

  it("the button's words state exactly what the tap adds, for every spot at every whole second of the job before it ends", () => {
    // Every second, not every few percent: a label that runs a second ahead only differs in the second before a pay boundary, which a coarse
    // sample that lands on the boundaries itself never sees. (The end of the job is the "ends in the very moment" test above.)
    for (const spot of spotIds) {
      const base = sent(spot);
      const material = spots[spot].material;
      for (let ms = 0; ms < lengthOf(spot); ms += 1000) {
        const save = clone(base);
        const now = DAY + ms;
        const words = cardText.callBack(save.creature!.job!, now);
        const said = {
          coins: Number(/(\d+) coins?/.exec(words)?.[1] ?? 0),
          amount: Number(new RegExp(`(\\d+) ${materialNames(spot)}`).exec(words)?.[1] ?? 0),
        };
        const bagBefore = save.inventory[material] ?? 0;
        expect(callBack(save, now), `${spot} ${ms} ms`).toBe("called");
        expect(save.coins, `${spot} ${ms} ms coins, "${words}"`).toBe(said.coins);
        expect((save.inventory[material] ?? 0) - bagBefore, `${spot} ${ms} ms material, "${words}"`).toBe(said.amount);
      }
    }
  });

  it("no string holds a word of loss, for any spot and any moment", () => {
    for (const spot of spotIds) {
      const strings = [cardText.title(spot), cardText.cost(spot), cardText.haul(spot), cardText.send, cardText.spent(spot)];
      for (let pct = 0; pct <= 100; pct += 5) {
        const job = { spot, startedAt: DAY, endsAt: DAY + lengthOf(spot) };
        strings.push(cardText.callBack(job, DAY + (lengthOf(spot) * pct) / 100));
      }
      for (const text of strings) expect(banned.test(text), `${spot}: ${text}`).toBe(false);
    }
  });

  it("the banned-word check itself catches whole words in any case, and lets longer words through", () => {
    for (const word of ["Do not die.", "It is GONE", "a Sacrifice", "you lose", "all is Lost", "a Penalty", "Wasted", "Failed"])
      expect(banned.test(word), word).toBe(true);
    for (const word of ["Close", "studies", "the diet", "closer", "released", "lonely", "wasteland", "failing", "failure"])
      expect(banned.test(word), word).toBe(false);
  });

  it("the numbers in the words are the data's own: every range end in the haul line is a number from data/habitat.ts", () => {
    for (const spot of spotIds) {
      const s = spots[spot];
      const numbers = (cardText.haul(spot).match(/\d+/g) ?? []).map(Number);
      expect(numbers).toEqual([s.coins[0], s.coins[1], s.amount[0], s.amount[1]]);
      expect(cardText.haul(spot)).toContain(materials[s.material].name);
    }
  });
});

// The name the button's words use for this spot's material in a count ("Herb" or "Herbs", "Fiber"): either form, for the regex above.
function materialNames(spot: SpotId): string {
  const name = materials[spots[spot].material].name;
  return name === "Herbs" ? "Herbs?" : name;
}
