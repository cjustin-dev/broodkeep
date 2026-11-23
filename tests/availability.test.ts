// The availability functions (game/availability.ts) against the real care actions. The actions call these functions now, so the check of
// "the action did what the function said" alone could not notice a check that was moved. Two things stand guard: a frozen copy of the rules as
// they were before A1.3 (the `old...` oracles below, thresholds written as literals), and single cases with literal answers for the order.
import { describe, expect, it } from "vitest";
import { fieldIds, fields } from "../src/data/fields";
import { foods } from "../src/data/foods";
import { specialId } from "../src/data/special";
import { clean, feed, giveMedicine, goTo, toggleLights } from "../src/game/actions";
import {
  cleanRefusal,
  feedButtonRefusal,
  feedRefusal,
  goButtonRefusal,
  goRefusal,
  lightsRefusal,
  medicineRefusal,
} from "../src/game/availability";
import { menuOf } from "../src/game/growth";
import type { Creature } from "../src/game/state";
import type { FoodId, Place } from "../src/game/types";
import { at, careState, stageForm, withLockedField } from "./helpers";

const T0 = at(8); // morning, awake by the clock; every action below runs at T0, so the caught-up state is the state the test sets
type Sleep = Creature["sleep"];

// One form of each stage, and the special one (a kid by stage that never grows).
const SAMPLE = [stageForm("baby"), stageForm("kid"), stageForm("young"), stageForm("adult"), specialId];
const SLEEPS: Sleep[] = [null, "nap", "night"];
const AWAY = [false, true];

// ---- the rules as they were before A1.3 (frozen: do not edit to match the code) ----

const oldFeed = (c: Creature, food: FoodId, menu: FoodId[]): string => {
  if (c.job) return "unavailable";
  if (!menu.includes(food)) return "unavailable";
  if (c.sleep) return "sleeping";
  if (c.stats.hunger >= 95) return "full";
  return "ate";
};
const oldClean = (c: Creature): string => (c.job ? "unavailable" : c.poop === 0 && c.stats.hygiene >= 99 ? "nothing" : "cleaned");
const oldMedicine = (c: Creature): string => (c.job ? "unavailable" : !c.sick ? "not-sick" : "cured");
const oldLights = (c: Creature): string => {
  if (c.job) return "unavailable";
  if (c.sleep === "night") return "night";
  if (c.sleep === "nap") return "woke";
  if (c.stats.energy >= 90) return "not-tired";
  return "napping";
};
const oldGo = (c: Creature, place: Place, locked: boolean): string => {
  if (c.job) return "unavailable";
  if (c.sleep) return "sleeping";
  if (place === c.place) return "already";
  if (place !== "home" && locked) return "locked";
  return "went";
};

const HUNGER = [0, 50, 94.99, 95, 100];
const ENERGY = [0, 89.99, 90, 100];
const HYGIENE = [0, 98.99, 99, 100];
const POOP = [0, 1, 3, 5];

describe("feedRefusal", () => {
  it("matches the old Feed rules and the real action for every food, state and boundary value", () => {
    let combos = 0;
    for (const formId of SAMPLE) {
      for (const sleep of SLEEPS) {
        for (const away of AWAY) {
          for (const hunger of HUNGER) {
            const probe = careState(formId, {}).creature!;
            const menu = menuOf(probe);
            const offMenu = (Object.keys(foods) as FoodId[]).find((f) => !menu.includes(f));
            for (const food of [...menu, ...(offMenu ? [offMenu] : [])]) {
              const save = careState(formId, { sleep, away, hunger });
              const c = save.creature!;
              const code = feedRefusal(c, food);
              const wanted = oldFeed(c, food, menu);
              expect(feed(save, food, T0), `${formId} ${sleep} away=${away} hunger=${hunger} ${food}`).toBe(wanted);
              expect(code === null, `${formId} ${sleep} away=${away} hunger=${hunger} ${food}`).toBe(wanted === "ate");
              combos++;
            }
          }
        }
      }
    }
    expect(combos).toBeGreaterThan(500); // the sweep really ran (a loop that never entered would pass)
  });

  it("checks in the action's order: away, then the menu, then sleep, then full", () => {
    const baby = stageForm("baby");
    const babyMenu = menuOf(careState(baby, {}).creature!);
    expect(babyMenu).not.toContain("meat"); // a baby has no field yet, so meat is off its menu
    // asleep AND off the menu: the menu step comes first, so the word is "unavailable" (not "sleeping")
    const asleep = careState(baby, { sleep: "night" });
    expect(feedRefusal(asleep.creature!, "meat")).toBe("off-menu");
    expect(feed(asleep, "meat", T0)).toBe("unavailable");
    // asleep AND full: asleep comes first
    expect(feedRefusal(careState(baby, { sleep: "nap", hunger: 100 }).creature!, "pellet")).toBe("asleep");
    // away wins over everything
    expect(feedRefusal(careState(baby, { away: true, sleep: "nap", hunger: 100 }).creature!, "meat")).toBe("away");
  });

  it("is full at 95 and not at 94.99", () => {
    const baby = stageForm("baby");
    expect(feedRefusal(careState(baby, { hunger: 94.99 }).creature!, "pellet")).toBeNull();
    expect(feedRefusal(careState(baby, { hunger: 95 }).creature!, "pellet")).toBe("full");
  });

  it("gives the Feed button the answer every menu food gives", () => {
    for (const formId of SAMPLE) {
      for (const sleep of SLEEPS) {
        for (const away of AWAY) {
          for (const hunger of HUNGER) {
            const c = careState(formId, { sleep, away, hunger }).creature!;
            const codes = new Set(menuOf(c).map((food) => feedRefusal(c, food)));
            expect(codes.size, `${formId} ${sleep} ${away} ${hunger}`).toBe(1);
            expect(feedButtonRefusal(c)).toBe([...codes][0]);
          }
        }
      }
    }
  });
});

describe("cleanRefusal", () => {
  it("matches the old Clean rules and the real action", () => {
    let combos = 0;
    for (const away of AWAY) {
      for (const sleep of SLEEPS) {
        for (const hygiene of HYGIENE) {
          for (const poop of POOP) {
            const save = careState(stageForm("young"), { away, sleep, hygiene, poop });
            const c = save.creature!;
            const code = cleanRefusal(c);
            const wanted = oldClean(c);
            expect(clean(save, T0), `away=${away} ${sleep} hygiene=${hygiene} poop=${poop}`).toBe(wanted);
            expect(code === null).toBe(wanted === "cleaned");
            combos++;
          }
        }
      }
    }
    expect(combos).toBe(2 * 3 * 4 * 4);
  });

  it("has literal answers at the edges", () => {
    const y = stageForm("young");
    expect(cleanRefusal(careState(y, { hygiene: 98.99, poop: 0 }).creature!)).toBeNull();
    expect(cleanRefusal(careState(y, { hygiene: 99, poop: 0 }).creature!)).toBe("nothing");
    expect(cleanRefusal(careState(y, { hygiene: 100, poop: 1 }).creature!)).toBeNull();
    expect(cleanRefusal(careState(y, { hygiene: 100, poop: 5 }).creature!)).toBeNull();
    expect(cleanRefusal(careState(y, { hygiene: 0, poop: 0, away: true }).creature!)).toBe("away");
  });
});

describe("lightsRefusal", () => {
  it("matches the old Lights rules and the real action", () => {
    let combos = 0;
    for (const away of AWAY) {
      for (const sleep of SLEEPS) {
        for (const energy of ENERGY) {
          const save = careState(stageForm("young"), { away, sleep, energy });
          const c = save.creature!;
          const code = lightsRefusal(c);
          const wanted = oldLights(c);
          expect(toggleLights(save, T0), `away=${away} ${sleep} energy=${energy}`).toBe(wanted);
          expect(code === null).toBe(wanted === "woke" || wanted === "napping");
          combos++;
        }
      }
    }
    expect(combos).toBe(2 * 3 * 4);
  });

  it("has literal answers: tired naps, rested does not, a nap always wakes, night never", () => {
    const y = stageForm("young");
    expect(lightsRefusal(careState(y, { energy: 89.99 }).creature!)).toBeNull();
    expect(lightsRefusal(careState(y, { energy: 90 }).creature!)).toBe("not-tired");
    expect(lightsRefusal(careState(y, { sleep: "nap", energy: 100 }).creature!)).toBeNull();
    expect(lightsRefusal(careState(y, { sleep: "night", energy: 0 }).creature!)).toBe("night");
    expect(lightsRefusal(careState(y, { away: true }).creature!)).toBe("away");
  });
});

describe("medicineRefusal", () => {
  it("matches the old Medicine rules and the real action (and has no sleep rule)", () => {
    let combos = 0;
    for (const away of AWAY) {
      for (const sleep of SLEEPS) {
        for (const sick of [false, true]) {
          const save = careState(stageForm("young"), { away, sleep, sick });
          const c = save.creature!;
          const code = medicineRefusal(c);
          const wanted = oldMedicine(c);
          expect(giveMedicine(save, T0), `away=${away} ${sleep} sick=${sick}`).toBe(wanted);
          expect(code === null).toBe(wanted === "cured");
          combos++;
        }
      }
    }
    expect(combos).toBe(2 * 3 * 2);
    expect(medicineRefusal(careState(stageForm("young"), { sleep: "night", sick: true }).creature!)).toBeNull(); // a sick sleeper can be given medicine
  });
});

describe("goRefusal", () => {
  const places: Place[] = ["home", ...fieldIds];

  it("matches the old Go rules and the real action for every place, with each field open and locked", () => {
    let combos = 0;
    for (const lockedField of [null, ...fieldIds]) {
      for (const away of AWAY) {
        for (const sleep of SLEEPS) {
          for (const here of places) {
            for (const target of places) {
              const run = (): void => {
                const save = careState(stageForm("young"), { away, sleep, place: here });
                const c = save.creature!;
                const code = goRefusal(c, target);
                const wanted = oldGo(c, target, lockedField === target);
                expect(goTo(save, target, T0), `locked=${lockedField} away=${away} ${sleep} ${here}->${target}`).toBe(wanted);
                expect(code === null).toBe(wanted === "went");
                combos++;
              };
              if (lockedField) withLockedField(lockedField, run);
              else run();
            }
          }
        }
      }
    }
    expect(combos).toBe((1 + fieldIds.length) * 2 * 3 * places.length * places.length);
    for (const id of fieldIds) expect(fields[id].plan).not.toBeNull(); // withLockedField put every plan back
  });

  it("checks sleep before 'already here', as the action does", () => {
    const c = careState(stageForm("young"), { sleep: "nap", place: "home" }).creature!;
    expect(goRefusal(c, "home")).toBe("asleep");
    expect(goRefusal(careState(stageForm("young"), { place: "home" }).creature!, "home")).toBe("already");
  });

  it("refuses a field with no plan, but never home", () => {
    const id = fieldIds[0]!;
    withLockedField(id, () => {
      const c = careState(stageForm("young"), { place: "home" }).creature!;
      expect(goRefusal(c, id)).toBe("locked");
      expect(goRefusal(careState(stageForm("young"), { place: id }).creature!, "home")).toBeNull();
    });
  });

  it("gives the Go button its two reasons only", () => {
    expect(goButtonRefusal(careState(stageForm("young"), { away: true, sleep: "nap" }).creature!)).toBe("away");
    expect(goButtonRefusal(careState(stageForm("young"), { sleep: "night" }).creature!)).toBe("asleep");
    expect(goButtonRefusal(careState(stageForm("young"), { place: "home" }).creature!)).toBeNull();
  });
});
