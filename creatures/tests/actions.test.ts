import { describe, expect, it } from "vitest";
import { clean, feed, giveMedicine, goTo, startJob, startNewEgg, tapEgg, toggleLights, touch } from "../src/game/actions";
import { killCreature, setPoop, setSick, setStat } from "../src/game/dev";
import { simulateTo } from "../src/game/sim";
import { newSave } from "../src/game/state";
import { HOUR, MINUTE } from "../src/game/time";
import { aliveSave, at } from "./helpers";

describe("feeding", () => {
  it("fills the creature, counts the food, and turns into poop later", () => {
    const t0 = at(9);
    const save = aliveSave("pebblin", t0);
    setStat(save, "hunger", 40);
    expect(feed(save, "meat", t0)).toBe("ate");
    expect(save.creature?.stats.hunger).toBe(75);
    expect(save.creature?.counters.servings.meat).toBe(1);
    expect(save.creature?.poop).toBe(0);
    simulateTo(save, t0 + 131 * MINUTE); // meat takes 90 to 130 minutes
    expect(save.creature?.poop).toBe(1);
  });

  it("refuses food when full", () => {
    const t0 = at(9);
    const save = aliveSave("pebblin", t0);
    setStat(save, "hunger", 96);
    expect(feed(save, "carrot", t0)).toBe("full");
    expect(save.creature?.counters.servings.carrot).toBeUndefined();
  });

  it("does not feed a sleeping creature", () => {
    const save = aliveSave("pebblin", at(19));
    setStat(save, "hunger", 30);
    expect(feed(save, "carrot", at(21))).toBe("sleeping");
  });

  it("has nothing to feed when there is only an egg or a dead creature", () => {
    const egg = newSave(at(9), 1);
    expect(feed(egg, "carrot", at(9))).toBe("unavailable");
    const dead = aliveSave("pebblin", at(9));
    killCreature(dead, at(9));
    expect(feed(dead, "carrot", at(9))).toBe("unavailable");
  });

  it("treat makes happy but is bad for wellness", () => {
    const t0 = at(9);
    const save = aliveSave("pebblin", t0);
    setStat(save, "hunger", 30);
    setStat(save, "happiness", 40);
    feed(save, "treat", t0);
    expect(save.creature?.stats.happiness).toBe(65);
    expect(save.creature?.stats.wellness).toBe(92);
  });

  it("the first treat is safe, but several in a row can make it sick", () => {
    let sickAfterFirst = 0;
    let sickAfterFour = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const t0 = at(9);
      const save = aliveSave("pebblin", t0, seed);
      setStat(save, "hunger", 10);
      feed(save, "treat", t0);
      if (save.creature!.sick) sickAfterFirst++;
      for (let i = 0; i < 3; i++) {
        setStat(save, "hunger", 10);
        feed(save, "treat", t0 + (i + 1) * MINUTE);
      }
      if (save.creature!.sick) sickAfterFour++;
    }
    expect(sickAfterFirst).toBe(0);
    expect(sickAfterFour).toBeGreaterThan(20);
  });
});

describe("treat window", () => {
  it("treat eaten long ago no longer adds to the risk", () => {
    let sick = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const t0 = at(9);
      const save = aliveSave("pebblin", t0, seed);
      setStat(save, "hunger", 10);
      feed(save, "treat", t0);
      setStat(save, "hunger", 10);
      feed(save, "treat", t0 + 181 * MINUTE); // just outside the 180 minute window
      if (save.creature!.sick) sick++;
    }
    expect(sick).toBe(0);
  });
});

describe("cleaning", () => {
  it("clears the poop and makes the creature clean", () => {
    const t0 = at(9);
    const save = aliveSave("pebblin", t0);
    setPoop(save, 3);
    setStat(save, "hygiene", 30);
    expect(clean(save, t0)).toBe("cleaned");
    expect(save.creature?.poop).toBe(0);
    expect(save.creature?.stats.hygiene).toBe(100);
    expect(clean(save, t0)).toBe("nothing");
  });

  it("poop left lying around makes it sick, but a single poop does not", () => {
    const t0 = at(8);
    const messy = aliveSave("pebblin", t0);
    setPoop(messy, 3);
    simulateTo(messy, at(20));
    expect(messy.creature?.sick).toBe(true);

    const tidy = aliveSave("pebblin", t0);
    setPoop(tidy, 1);
    simulateTo(tidy, at(20));
    expect(tidy.creature?.sick).toBe(false);
  });
});

describe("medicine", () => {
  it("cures a sick creature and does not relapse at once", () => {
    const t0 = at(9);
    const save = aliveSave("pebblin", t0);
    setSick(save, true);
    setStat(save, "wellness", 0);
    expect(giveMedicine(save, t0)).toBe("cured");
    expect(save.creature?.sick).toBe(false);
    expect(save.creature?.stats.wellness).toBe(40);
    simulateTo(save, t0 + 10 * MINUTE);
    expect(save.creature?.sick).toBe(false);
  });

  it("never pushes wellness above 100", () => {
    const save = aliveSave("pebblin", at(9));
    setSick(save, true);
    setStat(save, "wellness", 90);
    giveMedicine(save, at(9));
    expect(save.creature?.stats.wellness).toBe(100);
  });

  it("is not needed when healthy", () => {
    const save = aliveSave("pebblin", at(9));
    expect(giveMedicine(save, at(9))).toBe("not-sick");
  });

  it("low wellness makes it sick by itself", () => {
    const save = aliveSave("pebblin", at(9));
    setStat(save, "wellness", 20);
    simulateTo(save, at(9, 1));
    expect(save.creature?.sick).toBe(true);
    expect(save.creature?.call).toBe("sick");
  });
});

describe("lights and naps", () => {
  it("naps when tired and wakes up when rested", () => {
    const t0 = at(10);
    const save = aliveSave("pebblin", t0);
    setStat(save, "energy", 50);
    expect(toggleLights(save, t0)).toBe("napping");
    simulateTo(save, t0 + 3 * HOUR + 15 * MINUTE);
    expect(save.creature?.sleep).toBe("nap"); // 50 + 0.25 a minute is not full yet
    simulateTo(save, t0 + 3 * HOUR + 25 * MINUTE);
    expect(save.creature?.sleep).toBeNull();
    // It woke at full energy, then lost a hair during its first awake minutes.
    expect(save.creature?.stats.energy).toBeGreaterThan(99);
  });

  it("a nap is not neglect: calls stop while it sleeps", () => {
    const t0 = at(10);
    const save = aliveSave("pebblin", t0);
    setStat(save, "energy", 50);
    setStat(save, "hunger", 10);
    simulateTo(save, t0 + 2 * MINUTE);
    expect(save.creature?.call).toBe("hungry");
    toggleLights(save, t0 + 2 * MINUTE);
    simulateTo(save, t0 + 3 * HOUR);
    expect(save.creature?.sleep).toBe("nap");
    expect(save.creature?.call).toBeNull();
    expect(save.creature?.counters.careMistakes).toBe(0);
  });

  it("can be woken from a nap", () => {
    const t0 = at(10);
    const save = aliveSave("pebblin", t0);
    setStat(save, "energy", 50);
    toggleLights(save, t0);
    expect(toggleLights(save, t0 + MINUTE)).toBe("woke");
    expect(save.creature?.sleep).toBeNull();
  });

  it("does not nap when it is not tired", () => {
    const t0 = at(10);
    const save = aliveSave("pebblin", t0);
    setStat(save, "energy", 95);
    expect(toggleLights(save, t0)).toBe("not-tired");
  });

  it("cannot be woken during the night", () => {
    const save = aliveSave("pebblin", at(19));
    expect(toggleLights(save, at(21))).toBe("night");
    expect(save.creature?.sleep).toBe("night");
  });
});

describe("tap reactions", () => {
  it("petting adds happiness, up to a limit each hour", () => {
    const t0 = at(10);
    const save = aliveSave("pebblin", t0);
    setStat(save, "happiness", 30);
    let total = 0;
    for (let i = 0; i < 20; i++) total += touch(save, "pet", t0).gained;
    expect(total).toBe(15);
    expect(save.creature?.stats.happiness).toBe(45);
    // An hour later the limit starts over.
    expect(touch(save, "tickle", t0 + 61 * MINUTE).gained).toBe(3);
  });

  it("poking does not change happiness", () => {
    const save = aliveSave("pebblin", at(10));
    setStat(save, "happiness", 30);
    expect(touch(save, "poke", at(10)).gained).toBe(0);
    expect(save.creature?.stats.happiness).toBe(30);
  });

  it("a sleeping creature is not affected", () => {
    const save = aliveSave("pebblin", at(19));
    expect(touch(save, "pet", at(21))).toEqual({ gained: 0, asleep: true });
  });
});

describe("going to a field", () => {
  it("takes it out to an open field and home again, and says so in the log", () => {
    const t0 = at(9);
    const save = aliveSave("pebblin", t0);
    expect(goTo(save, "land", t0)).toBe("went");
    expect(save.creature?.place).toBe("land");
    expect(save.log.at(-1)?.text).toBe("Went to the Land field");
    expect(goTo(save, "home", t0 + MINUTE)).toBe("went");
    expect(save.creature?.place).toBe("home");
    expect(save.log.at(-1)?.text).toBe("Went home");
  });

  it("does nothing when it is already there", () => {
    const t0 = at(9);
    const save = aliveSave("pebblin", t0);
    expect(goTo(save, "home", t0)).toBe("already");
    goTo(save, "land", t0);
    const logged = save.log.length;
    expect(goTo(save, "land", t0 + MINUTE)).toBe("already");
    expect(save.log).toHaveLength(logged);
  });

  it("refuses a locked field, and the creature stays where it was", () => {
    const t0 = at(9);
    const save = aliveSave("pebblin", t0);
    const logged = save.log.length;
    expect(goTo(save, "water", t0)).toBe("locked");
    expect(goTo(save, "sky", t0)).toBe("locked");
    expect(save.creature?.place).toBe("home");
    expect(save.log).toHaveLength(logged);
  });

  it("refuses a sleeping creature, one away on a job, an egg and a dead creature", () => {
    const sleeping = aliveSave("pebblin", at(19));
    expect(goTo(sleeping, "land", at(21))).toBe("sleeping");
    expect(sleeping.creature?.place).toBe("home");

    const t0 = at(9);
    const working = aliveSave("pebblin", t0);
    expect(startJob(working, "meadow", t0)).toBe("started");
    expect(goTo(working, "land", t0 + MINUTE)).toBe("unavailable");
    expect(working.creature?.place).toBe("home");

    expect(goTo(newSave(t0, 1), "land", t0)).toBe("unavailable");

    const dead = aliveSave("pebblin", t0);
    killCreature(dead, t0);
    expect(goTo(dead, "land", t0 + MINUTE)).toBe("unavailable");
  });
});

describe("after a death", () => {
  it("starts a new egg, and only when dead", () => {
    const t0 = at(10);
    const save = aliveSave("pebblin", t0);
    expect(startNewEgg(save, t0)).toBe(false);
    killCreature(save, t0);
    expect(save.phase).toBe("dead");
    expect(startNewEgg(save, t0 + MINUTE)).toBe(true);
    expect(save.phase).toBe("egg");
    expect(save.creature).toBeNull();
    expect(save.death).toBeNull();
    expect(tapEgg(save, t0 + MINUTE)).toBe("tapped");
  });
});
