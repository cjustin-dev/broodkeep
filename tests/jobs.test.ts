// Habitat jobs: sending the creature out, what it brings back, and what can go wrong on the way.
import { describe, expect, it } from "vitest";
import { getForm } from "../src/data/forms";
import { habitatTuning, materialIds, materials, spotIds, spots } from "../src/data/habitat";
import { callBack, clean, dismissHaul, feed, startJob, toggleLights, touch } from "../src/game/actions";
import { forceEvolve, killCreature } from "../src/game/dev";
import { simulateTo } from "../src/game/sim";
import { newSave } from "../src/game/state";
import type { Save } from "../src/game/state";
import { MINUTE } from "../src/game/time";
import { stageOrder } from "../src/game/types";
import { aliveSave, at } from "./helpers";

const DAY = at(10); // mid morning, well inside the awake hours
const min = (n: number): number => n * MINUTE;

// A creature of the given form that has just hatched at DAY, with plenty of energy.
const hatched = (formId: string): Save => aliveSave(formId, DAY);

describe("the spot data", () => {
  it("has sensible ranges, and every material and stage it names exists", () => {
    expect(spotIds.length).toBeGreaterThan(0);
    for (const id of spotIds) {
      const s = spots[id];
      expect(s.id).toBe(id);
      expect(s.minutes).toBeGreaterThan(0);
      expect(s.energyCost).toBeGreaterThan(0);
      expect(s.coins[0]).toBeGreaterThan(0);
      expect(s.coins[0]).toBeLessThanOrEqual(s.coins[1]);
      expect(s.amount[0]).toBeGreaterThan(0);
      expect(s.amount[0]).toBeLessThanOrEqual(s.amount[1]);
      expect(materialIds).toContain(s.material);
      expect(materials[s.material].name.length).toBeGreaterThan(0);
      expect(stageOrder).toContain(s.minStage);
    }
  });

  it("lets even a baby work somewhere, and an adult work everywhere", () => {
    expect(spotIds.some((id) => spots[id].minStage === "baby")).toBe(true);
    for (const id of spotIds) expect(stageOrder.indexOf(spots[id].minStage)).toBeLessThanOrEqual(stageOrder.indexOf("adult"));
  });

  it("can be started by a grown creature at full energy, whatever the spot", () => {
    for (const id of spotIds) {
      const save = hatched("cindermane");
      expect(save.creature!.stats.energy, id).toBe(100);
      expect(startJob(save, id, DAY), id).toBe("started");
    }
  });
});

describe("setting off", () => {
  it("sends the creature out, takes the energy and sets the finishing time", () => {
    const save = hatched("blip");
    const before = save.creature!.stats.energy;
    expect(startJob(save, "meadow", DAY)).toBe("started");
    const c = save.creature!;
    expect(c.job).toEqual({ spot: "meadow", startedAt: DAY, endsAt: DAY + min(spots.meadow.minutes) });
    expect(c.stats.energy).toBe(before - spots.meadow.energyCost);
    expect(save.log.at(-1)?.text).toContain(spots.meadow.name);
  });

  it("will not start a second job while one is running", () => {
    const save = hatched("blip");
    startJob(save, "meadow", DAY);
    const energy = save.creature!.stats.energy;
    expect(startJob(save, "herbs", DAY)).toBe("busy");
    expect(save.creature!.job?.spot).toBe("meadow");
    expect(save.creature!.stats.energy).toBe(energy); // nothing was taken for the refused job
  });

  it("will not send a sleeping or sick creature", () => {
    const save = hatched("blip");
    save.creature!.sleep = "nap";
    expect(startJob(save, "meadow", DAY)).toBe("asleep");
    save.creature!.sleep = "night";
    expect(startJob(save, "meadow", DAY)).toBe("asleep");
    save.creature!.sleep = null;
    save.creature!.sick = true;
    expect(startJob(save, "meadow", DAY)).toBe("sick");
    expect(save.creature!.job ?? null).toBeNull();
  });

  it("keeps every spot closed to a creature younger than the spot allows", () => {
    // One creature per stage, and every spot: it works there exactly when its stage is old enough.
    const formFor: Record<string, string> = { baby: "blip", kid: "pebblin", young: "cragpup", adult: "gravelhorn" };
    for (const stage of stageOrder) {
      for (const id of spotIds) {
        const save = hatched(formFor[stage]!);
        expect(getForm(formFor[stage]!).stage).toBe(stage);
        const old = stageOrder.indexOf(stage) >= stageOrder.indexOf(spots[id].minStage);
        expect(startJob(save, id, DAY), `${stage} at ${id}`).toBe(old ? "started" : "too-young");
      }
    }
  });

  it("needs enough energy: just enough goes, a hair less is too tired", () => {
    const spot = spots.rocks;
    const enough = spot.energyCost + habitatTuning.energyFloor;
    const save = hatched("gravelhorn");
    save.creature!.stats.energy = enough;
    expect(startJob(save, "rocks", DAY)).toBe("started");
    expect(save.creature!.stats.energy).toBe(habitatTuning.energyFloor);

    const tired = hatched("gravelhorn");
    tired.creature!.stats.energy = enough - 0.5;
    expect(startJob(tired, "rocks", DAY)).toBe("tired");
    expect(tired.creature!.stats.energy).toBe(enough - 0.5);
    expect(tired.creature!.job ?? null).toBeNull();
  });

  it("is unavailable for an egg, a dead creature and a spot that does not exist", () => {
    const egg = newSave(DAY, 1);
    expect(startJob(egg, "meadow", DAY)).toBe("unavailable");

    const dead = hatched("blip");
    killCreature(dead, DAY);
    expect(startJob(dead, "meadow", DAY)).toBe("unavailable");

    const save = hatched("blip");
    expect(startJob(save, "nowhere" as never, DAY)).toBe("unavailable");
    expect(save.creature!.job ?? null).toBeNull();
  });
});

describe("coming home", () => {
  it("is back at the minute the job ends, and not a minute earlier", () => {
    const save = hatched("blip");
    startJob(save, "meadow", DAY);
    simulateTo(save, DAY + min(spots.meadow.minutes - 1));
    expect(save.creature!.job).not.toBeNull();
    expect(save.coins).toBe(0);
    expect(save.hauls).toHaveLength(0);

    simulateTo(save, DAY + min(spots.meadow.minutes));
    expect(save.creature!.job).toBeNull();
    expect(save.hauls).toHaveLength(1);
  });

  it("brings coins and material inside the spot's ranges, and counts one job done", () => {
    for (const id of spotIds) {
      const save = hatched("cindermane"); // old enough for every spot
      const spot = spots[id];
      startJob(save, id, DAY);
      simulateTo(save, DAY + min(spot.minutes));
      expect(save.coins, id).toBeGreaterThanOrEqual(spot.coins[0]);
      expect(save.coins, id).toBeLessThanOrEqual(spot.coins[1]);
      const got = save.inventory[spot.material] ?? 0;
      expect(got, id).toBeGreaterThanOrEqual(spot.amount[0]);
      expect(got, id).toBeLessThanOrEqual(spot.amount[1]);
      expect(save.hauls[0]).toEqual({ spot: id, at: DAY + min(spot.minutes), coins: save.coins, material: spot.material, amount: got });
      expect(save.creature!.counters.chores).toBe(1);
      expect(save.creature!.counters.chores).toBe(1);
    }
  });

  it("gives the same haul whether the time passes in one go or a minute at a time", () => {
    const a = hatched("cragpup");
    const b = hatched("cragpup");
    startJob(a, "pond", DAY);
    startJob(b, "pond", DAY);
    simulateTo(a, DAY + min(120));
    for (let m = 1; m <= 120; m++) simulateTo(b, DAY + min(m));
    expect(a).toEqual(b);
    expect(a.hauls).toHaveLength(1);
  });

  it("finishes while the app is closed: a whole day later the haul is waiting", () => {
    const save = hatched("blip");
    startJob(save, "herbs", DAY);
    simulateTo(save, DAY + 24 * 60 * MINUTE);
    expect(save.creature!.job).toBeNull();
    expect(save.hauls).toHaveLength(1);
    expect(save.coins).toBeGreaterThan(0);
  });

  it("still pays when night falls on the way, and the creature is already asleep when it gets home", () => {
    const save = aliveSave("blip", at(19, 58));
    startJob(save, "meadow", at(19, 58)); // back at 20:01, after the 20:00 bedtime
    simulateTo(save, at(20, 0));
    expect(save.creature!.sleep).toBe("night"); // bedtime came while it was out
    expect(save.creature!.job).not.toBeNull();
    simulateTo(save, at(20, 30));
    expect(save.creature!.job).toBeNull();
    expect(save.coins).toBeGreaterThan(0);
  });

  it("is back soon after the device clock is set back, not at the old finishing time", () => {
    const save = hatched("blip");
    startJob(save, "meadow", DAY);
    const earlier = DAY - 4 * 60 * MINUTE;
    simulateTo(save, earlier); // a big step back: the game carries on from the new time
    expect(save.creature!.job).not.toBeNull();
    simulateTo(save, earlier + min(spots.meadow.minutes + 1));
    expect(save.creature!.job).toBeNull();
    expect(save.hauls).toHaveLength(1);
    expect(save.hauls[0]!.at).toBeLessThanOrEqual(earlier + min(spots.meadow.minutes + 1));
  });

  it("gives the creature its full time out after a small step back of the clock", () => {
    const save = hatched("blip");
    startJob(save, "meadow", DAY);
    simulateTo(save, DAY + min(1));
    simulateTo(save, DAY + min(1) - min(30)); // under an hour back: ignored, time carries on once the clock catches up
    simulateTo(save, DAY + min(spots.meadow.minutes - 1));
    expect(save.creature!.job).not.toBeNull();
    simulateTo(save, DAY + min(spots.meadow.minutes));
    expect(save.creature!.job).toBeNull();
  });

  it("pays nothing if the creature dies before it gets home", () => {
    const save = hatched("blip");
    startJob(save, "meadow", DAY);
    killCreature(save, DAY + min(1));
    simulateTo(save, DAY + min(60));
    expect(save.coins).toBe(0);
    expect(save.hauls).toHaveLength(0);
    expect(save.creature!.counters.chores).toBe(0);
  });

  it("lets a job that is still out when the creature evolves finish, and counts it in the new stage", () => {
    const save = hatched("cragpup");
    startJob(save, "pond", DAY);
    forceEvolve(save, "gravelhorn", DAY + min(1));
    expect(save.creature!.counters.chores).toBe(0); // a new stage starts from nothing
    simulateTo(save, DAY + min(spots.pond.minutes));
    expect(save.creature!.counters.chores).toBe(1);
    expect(save.creature!.job).toBeNull();
  });
});

describe("calling the creature back", () => {
  it("an early call back that has earned nothing yet (one minute of three at the meadow) brings it home with nothing, and does not give the energy back", () => {
    const save = hatched("blip");
    startJob(save, "meadow", DAY);
    const energy = save.creature!.stats.energy;
    expect(callBack(save, DAY + min(1))).toBe("called");
    expect(save.creature!.job).toBeNull();
    expect(save.creature!.stats.energy).toBeLessThanOrEqual(energy);
    simulateTo(save, DAY + min(60));
    expect(save.coins).toBe(0);
    expect(save.hauls).toHaveLength(0);
    expect(save.creature!.counters.chores).toBe(0);
  });

  it("says there is nothing to call back when the creature is at home", () => {
    const save = hatched("blip");
    expect(callBack(save, DAY)).toBe("nothing");
    expect(callBack(newSave(DAY, 1), DAY)).toBe("nothing");
  });
});

describe("while the creature is away", () => {
  it("cannot be fed, cleaned, put to bed or petted, and nothing changes", () => {
    const save = hatched("blip");
    save.creature!.stats.hunger = 40;
    save.creature!.stats.energy = 60;
    startJob(save, "meadow", DAY);
    const stats = { ...save.creature!.stats };
    expect(feed(save, "meat", DAY)).toBe("unavailable");
    expect(clean(save, DAY)).toBe("unavailable");
    expect(toggleLights(save, DAY)).toBe("unavailable");
    expect(touch(save, "pet", DAY)).toEqual({ gained: 0, asleep: false });
    expect(save.creature!.stats).toEqual(stats);
  });
});

describe("the welcome-back cards", () => {
  it("shows the oldest first and says when there are none", () => {
    const save = hatched("cindermane");
    for (const id of ["meadow", "herbs"] as const) {
      startJob(save, id, save.lastSimulatedAt);
      simulateTo(save, save.lastSimulatedAt + min(spots[id].minutes));
    }
    expect(save.hauls.map((h) => h.spot)).toEqual(["meadow", "herbs"]);
    expect(dismissHaul(save)).toBe(true);
    expect(save.hauls.map((h) => h.spot)).toEqual(["herbs"]);
    expect(dismissHaul(save)).toBe(true);
    expect(dismissHaul(save)).toBe(false);
  });

  it("forgets the oldest cards past the limit, but keeps every coin", () => {
    const save = hatched("cindermane");
    const jobs = habitatTuning.unseenHaulsMax + 2;
    let t = DAY;
    let earned = 0; // the coins on the card of every job, counted as each one comes home
    for (let i = 0; i < jobs; i++) {
      save.creature!.stats.energy = 100; // keep it from getting tired: this test is about the cards
      startJob(save, "meadow", t);
      t += min(spots.meadow.minutes);
      simulateTo(save, t);
      earned += save.hauls.at(-1)!.coins;
    }
    expect(save.creature!.counters.chores).toBe(jobs);
    expect(save.hauls).toHaveLength(habitatTuning.unseenHaulsMax);
    const kept = save.hauls.reduce((sum, h) => sum + h.coins, 0);
    expect(save.hauls.at(-1)?.at).toBe(t); // the newest is kept
    expect(save.hauls[0]!.at).toBe(t - min(spots.meadow.minutes) * (habitatTuning.unseenHaulsMax - 1)); // the oldest kept is the one just inside the limit
    expect(save.coins).toBeGreaterThanOrEqual(kept + (jobs - habitatTuning.unseenHaulsMax) * spots.meadow.coins[0]); // the forgotten jobs' coins are still in the purse
    expect(save.coins).toBe(earned); // nothing was lost when the oldest cards were forgotten
  });
});

describe("jobs and evolving", () => {
  it("counts jobs in the stage, and a new stage starts again from none", () => {
    const save = hatched("cindermane");
    startJob(save, "meadow", DAY);
    simulateTo(save, DAY + min(spots.meadow.minutes));
    expect(save.creature!.counters.chores).toBe(1);
    forceEvolve(save, "gravelhorn", DAY + min(10));
    expect(save.creature!.counters.chores).toBe(0);
  });

  it("does not count the minutes a baby spends away on a job toward its field cells", () => {
    const save = hatched("blip");
    const c = save.creature!;
    c.place = "land";
    startJob(save, "meadow", DAY);
    simulateTo(save, DAY + min(spots.meadow.minutes - 1));
    expect(c.counters.fieldMinutes.land ?? 0).toBe(0);
    simulateTo(save, DAY + min(spots.meadow.minutes + 4)); // home again: the minute it comes back and the 4 after it count
    expect(c.job ?? null).toBeNull();
    expect(c.counters.fieldMinutes.land ?? 0).toBe(5);
  });
});
