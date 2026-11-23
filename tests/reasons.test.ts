// The words Adult Mode gives for a refused button (game/reasons.ts). Every number in a sentence must be the value the rule used, so each
// case below writes the expected number as a literal from the data files (spot costs 5, 5, 10, 10, 15 plus the floor 20; a fight 10 plus 20).
import { describe, expect, it } from "vitest";
import { fieldIds, fields } from "../src/data/fields";
import { getForm } from "../src/data/forms";
import { spotIds, spots } from "../src/data/habitat";
import type { SpotId } from "../src/data/habitat";
import { specialId } from "../src/data/special";
import { cleanRefusal, feedRefusal, goRefusal, lightsRefusal, medicineRefusal } from "../src/game/availability";
import { fightRefusal } from "../src/game/combat/fight";
import { jobRefusal } from "../src/game/habitat/jobs";
import { contextLine } from "../src/game/hud";
import { cleanReason, feedReason, fightReason, goReason, lightsReason, medicineReason, spotReason } from "../src/game/reasons";
import { MINUTE } from "../src/game/time";
import { at, careState, stageForm, withLockedField } from "./helpers";

const T0 = at(8);
const baby = stageForm("baby");
const kid = stageForm("kid");
const young = stageForm("young");
const adult = stageForm("adult");

// The energy a trip to each spot needs: its cost plus the floor of 20 (written out, not read from the data).
const NEEDS: Record<SpotId, number> = { meadow: 25, herbs: 25, trees: 30, pond: 30, rocks: 35 };
const NAMES: Record<SpotId, string> = { meadow: "Bug meadow", herbs: "Herb patch", trees: "Trees", pond: "Pond", rocks: "Rock pile" };
const OPENS: Record<SpotId, string> = { meadow: "Baby", herbs: "Baby", trees: "Young", pond: "Young", rocks: "Adult" };

describe("the care reasons", () => {
  it("says what is true about food, with the numbers the rule used", () => {
    const save = careState(young, { hunger: 95 });
    const c = save.creature!;
    expect(feedReason(save, c, feedRefusal(c, "pellet")!, T0)).toBe("Not hungry: food is 95 of 100. It refuses food at 95 or more.");
    c.stats.hunger = 99.99; // shown rounded down, like the header
    expect(feedReason(save, c, "full", T0)).toBe("Not hungry: food is 99 of 100. It refuses food at 95 or more.");
    expect(feedReason(save, c, "off-menu", T0)).toBe("That food is not on its menu.");
  });

  it("says what is true about cleaning, resting and medicine", () => {
    const save = careState(young, { hygiene: 99, poop: 0, energy: 93, sick: false });
    const c = save.creature!;
    expect(cleanReason(c, cleanRefusal(c)!, T0)).toBe("Nothing to clean: no poop, and hygiene is 99 (cleaning starts below 99).");
    expect(lightsReason(save, c, lightsRefusal(c)!, T0)).toBe("Not tired: energy is 93. It naps below 90.");
    expect(medicineReason(c, medicineRefusal(c)!, T0)).toBe("Not sick: medicine only works on a sick creature.");
    c.stats.energy = 89.99; // a number just under the line shows as 89 and is available
    expect(lightsRefusal(c)).toBeNull();
    c.stats.energy = 90;
    expect(lightsReason(save, c, lightsRefusal(c)!, T0)).toBe("Not tired: energy is 90. It naps below 90.");
  });

  it("says when the night ends, or only 'Asleep' when there is no night", () => {
    const save = careState(young, { sleep: "night" }, at(23));
    const c = save.creature!;
    // the default night is 8 pm to 7 am: at 11 pm it ends at 7 am, 8 hours away
    expect(lightsReason(save, c, "night", at(23))).toBe("Night sleep follows the clock: wakes 7 am (in 8:00).");
    expect(feedReason(save, c, "asleep", at(23))).toBe("Asleep: wakes 7 am (in 8:00).");
    save.settings.sleepStartHour = 8; // start equal to end: no night (only a hand-built save gets here)
    save.settings.sleepEndHour = 8;
    expect(lightsReason(save, c, "night", at(23))).toBe("Night sleep follows the clock.");
    expect(feedReason(save, c, "asleep", at(23))).toBe("Asleep.");
  });

  it("says when a nap ends", () => {
    const save = careState(young, { sleep: "nap", energy: 41.7 });
    expect(feedReason(save, save.creature!, "asleep", T0)).toBe("Napping: wakes when rested (energy 41 of 100).");
  });

  it("says when an away creature is back, and 'back any moment' only once the time is up", () => {
    const save = careState(young, { away: true }); // away until T0 + 3 minutes
    const c = save.creature!;
    expect(cleanReason(c, "away", T0)).toBe("Away at Bug meadow: back in 3:00. Care waits until it is home.");
    expect(cleanReason(c, "away", T0 + 3 * MINUTE - 500)).toBe("Away at Bug meadow: back in 0:00. Care waits until it is home."); // 0 to 1 s left
    expect(cleanReason(c, "away", T0 + 3 * MINUTE)).toBe("Away at Bug meadow: back any moment. Care waits until it is home.");
    expect(cleanReason(c, "away", T0 + 4 * MINUTE)).toBe("Away at Bug meadow: back any moment. Care waits until it is home.");
  });

  it("uses the context line's own words for an away, napping or sleeping creature", () => {
    // the part after " · " in the context line is the shared piece; the reason must carry exactly it
    const away = careState(young, { away: true });
    const awayLine = contextLine(away, T0 + 90_000, "room", null);
    expect(awayLine).toBe("Away at Bug meadow · back in 1:30");
    expect(feedReason(away, away.creature!, "away", T0 + 90_000)).toContain(awayLine.split(" · ")[1]!);
    const nap = careState(young, { sleep: "nap", energy: 20 });
    const napLine = contextLine(nap, T0, "room", null);
    expect(napLine).toBe("Napping · wakes when rested (energy 20 of 100)");
    expect(goReason(nap, nap.creature!, "asleep", "home", T0)).toBe(`Napping: ${napLine.split(" · ")[1]}.`);
    const night = careState(young, { sleep: "night" }, at(23));
    const nightLine = contextLine(night, at(23), "room", null);
    expect(nightLine).toBe("Asleep · wakes 7 am (in 8:00)");
    expect(feedReason(night, night.creature!, "asleep", at(23))).toBe(`Asleep: ${nightLine.split(" · ")[1]}.`);
  });

  it("says where it is, and which field is closed", () => {
    const save = careState(young, { place: "home" });
    const c = save.creature!;
    expect(goReason(save, c, goRefusal(c, "home")!, "home", T0)).toBe("Already at home.");
    const id = fieldIds[0]!;
    c.place = id;
    expect(goReason(save, c, goRefusal(c, id)!, id, T0)).toBe(`Already at the ${fields[id].name} field.`);
    c.place = "home";
    withLockedField(id, () => expect(goReason(save, c, goRefusal(c, id)!, id, T0)).toBe(`The ${fields[id].name} field is not open yet.`));
  });
});

describe("the spot and fight reasons", () => {
  it("names the energy a trip needs for every spot, just under and at the line", () => {
    for (const spot of spotIds) {
      const need = NEEDS[spot];
      const just = careState(adult, { energy: need - 0.01 }); // 0.01 short: refused
      expect(jobRefusal(just.creature!, spot), spot).toBe("tired");
      expect(spotReason(just, just.creature!, "tired", spot, T0), spot).toBe(
        `Too tired for ${NAMES[spot]}: it needs energy ${need} to go (it has ${need - 1}).`,
      );
      const enough = careState(adult, { energy: need });
      expect(jobRefusal(enough.creature!, spot), spot).toBeNull();
    }
  });

  it("says a fight needs energy 30, just under and at the line", () => {
    const just = careState(kid, { energy: 29.99 });
    expect(fightRefusal(just.creature!)).toBe("tired");
    expect(fightReason(just, just.creature!, "tired", T0)).toBe("Too tired to fight: it needs energy 30 (it has 29).");
    expect(fightRefusal(careState(kid, { energy: 30 }).creature!)).toBeNull();
  });

  it("says which stage opens a spot, with the creature's stage written like the strip does", () => {
    const b = careState(baby, {});
    expect(spotReason(b, b.creature!, jobRefusal(b.creature!, "pond")!, "pond", T0)).toBe("Too young for Pond: it opens at Young (now: Baby).");
    expect(spotReason(b, b.creature!, jobRefusal(b.creature!, "rocks")!, "rocks", T0)).toBe("Too young for Rock pile: it opens at Adult (now: Baby).");
    const k = careState(kid, {});
    expect(spotReason(k, k.creature!, jobRefusal(k.creature!, "trees")!, "trees", T0)).toBe("Too young for Trees: it opens at Young (now: Kid).");
  });

  it("writes the stage words above the same as the data's gates (so the sentences below are checked against the real rule)", () => {
    for (const spot of spotIds) expect(spots[spot].minStage, spot).toBe(OPENS[spot].toLowerCase());
    expect(spotIds.length).toBe(Object.keys(OPENS).length); // and no spot is missing from the table
  });

  it("says a baby cannot fight yet, and a Special grows no further", () => {
    const b = careState(baby, {});
    expect(fightReason(b, b.creature!, fightRefusal(b.creature!)!, T0)).toBe("Too young to fight: it starts at Kid (now: Baby).");
    const s = careState(specialId, {});
    expect(fightRefusal(s.creature!)).toBeNull(); // a special is a kid by stage: it can fight
    expect(jobRefusal(s.creature!, "meadow")).toBeNull();
    expect(jobRefusal(s.creature!, "herbs")).toBeNull();
    for (const spot of ["trees", "pond", "rocks"] as const) {
      expect(jobRefusal(s.creature!, spot), spot).toBe("too-young");
      expect(spotReason(s, s.creature!, "too-young", spot, T0), spot).toBe(`Too young for ${NAMES[spot]}: it opens at ${OPENS[spot]}, and a Special grows no further.`);
    }
  });

  it("says sick, asleep and away for spots and fights", () => {
    const sick = careState(young, { sick: true });
    expect(spotReason(sick, sick.creature!, jobRefusal(sick.creature!, "pond")!, "pond", T0)).toBe("Sick: it needs medicine before it can work.");
    expect(fightReason(sick, sick.creature!, fightRefusal(sick.creature!)!, T0)).toBe("Sick: it needs medicine before it can fight.");
    const asleep = careState(young, { sleep: "nap", energy: 50 });
    expect(spotReason(asleep, asleep.creature!, "asleep", "pond", T0)).toBe("Napping: wakes when rested (energy 50 of 100).");
    expect(fightReason(asleep, asleep.creature!, "asleep", T0)).toBe("Napping: wakes when rested (energy 50 of 100).");
    const away = careState(young, { away: true });
    expect(fightReason(away, away.creature!, fightRefusal(away.creature!)!, T0)).toBe("Away at Bug meadow: back in 3:00. Care waits until it is home.");
    expect(spotReason(away, away.creature!, jobRefusal(away.creature!, "pond")!, "pond", T0)).toBe("Away at Bug meadow: back in 3:00. Care waits until it is home.");
  });

  // The rules as they were (frozen, written as literals: costs 5, 5, 10, 10, 15 and 10; the floor 20; the stage gates).
  const STAGE_INDEX: Record<string, number> = { baby: 0, kid: 1, young: 2, adult: 3 };
  const SPOT_COST: Record<SpotId, number> = { meadow: 5, herbs: 5, trees: 10, pond: 10, rocks: 15 };
  const SPOT_GATE: Record<SpotId, string> = { meadow: "baby", herbs: "baby", trees: "young", pond: "young", rocks: "adult" };
  const STATES = [
    { name: "ready", set: {} },
    { name: "sick", set: { sick: true } },
    { name: "napping", set: { sleep: "nap" as const } },
    { name: "asleep at night", set: { sleep: "night" as const } },
    { name: "away", set: { away: true } },
  ];
  const oldSpot = (formId: string, state: (typeof STATES)[number], energy: number, spot: SpotId): string | null => {
    if (state.name === "away") return "busy";
    if (state.set.sleep) return "asleep";
    if (state.name === "sick") return "sick";
    if (STAGE_INDEX[getForm(formId).stage]! < STAGE_INDEX[SPOT_GATE[spot]]!) return "too-young";
    if (energy - SPOT_COST[spot] < 20) return "tired";
    return null;
  };
  const oldFight = (formId: string, state: (typeof STATES)[number], energy: number): string | null => {
    if (state.name === "away") return "busy";
    if (state.set.sleep) return "asleep";
    if (state.name === "sick") return "sick";
    if (STAGE_INDEX[getForm(formId).stage]! < STAGE_INDEX.kid!) return "too-young";
    if (energy - 10 < 20) return "tired";
    return null;
  };

  it("matches the old spot and fight rules for every spot, stage, state and energy at the line, and words each refusal", () => {
    let spotCases = 0;
    let fightCases = 0;
    for (const formId of [baby, kid, young, adult, specialId]) {
      for (const state of STATES) {
        for (const spot of spotIds) {
          for (const energy of [NEEDS[spot] - 0.01, NEEDS[spot]]) {
            const save = careState(formId, { ...state.set, energy });
            const c = save.creature!;
            const code = jobRefusal(c, spot);
            expect(code, `${formId} ${state.name} ${spot} energy ${energy}`).toBe(oldSpot(formId, state, energy, spot));
            spotCases++;
            if (!code) continue;
            const text = spotReason(save, c, code, spot, T0);
            expect(text, `${formId} ${state.name} ${spot} ${code}`).toMatch(/^[A-Z].+[.]$/);
            expect(text).not.toMatch(/undefined|NaN|\[object/);
            if (code === "tired") expect(text).toContain(`needs energy ${NEEDS[spot]} to go (it has ${Math.floor(energy)})`);
            if (code === "too-young") expect(text).toContain(`opens at ${OPENS[spot]}`);
          }
        }
        for (const energy of [29.99, 30]) {
          const save = careState(formId, { ...state.set, energy });
          const c = save.creature!;
          const code = fightRefusal(c);
          expect(code, `${formId} ${state.name} fight energy ${energy}`).toBe(oldFight(formId, state, energy));
          fightCases++;
          if (!code) continue;
          const text = fightReason(save, c, code, T0);
          expect(text, `${formId} ${state.name} fight ${code}`).toMatch(/^[A-Z].+[.]$/);
          expect(text).not.toMatch(/undefined|NaN|\[object/);
          if (code === "tired") expect(text).toContain(`needs energy 30 (it has ${Math.floor(energy)})`);
        }
      }
    }
    expect(spotCases).toBe(5 * 5 * spotIds.length * 2);
    expect(fightCases).toBe(5 * 5 * 2);
  });
});
