// A scripted player raises a creature from the egg to every Land and Water adult, and checks the times of docs/paradise-plan.md
// section 2: the baby becomes a kid after 4 field cells (1 hour in a field), the kid a young after 24 hours, the young an adult after
// 48 hours. Each field's 16 adults are reached by food (4 young) and by care (4 tiers). If a number in tuning.ts moves so that a
// line or a tier can no longer be reached, this test says which.
import { describe, expect, it } from "vitest";
import { clean, feed, giveMedicine, goTo, toggleLights, touch } from "../src/game/actions";
import { setStat } from "../src/game/dev";
import { tierOf } from "../src/game/growth";
import { simulateTo } from "../src/game/sim";
import { HOUR, MINUTE } from "../src/game/time";
import type { FieldId, FoodId, Stage } from "../src/game/types";
import { getForm } from "../src/data/forms";
import { aliveSave, at } from "./helpers";

// How the young stage is looked after. "top up" feeds before hunger is low, which fills the stomach to the brim (hunger cells).
// "neglect" is a stretch where the player forgets the creature (a hungry call nobody answers).
interface Care {
  topUp: boolean;
  neglectHours?: number;
}

interface Line {
  young: string;
  food: FoodId;
  adults: [string, string, string, string];
}
const playable: Array<{ field: FieldId; kid: string; lines: Line[] }> = [
  {
    field: "land",
    kid: "pebblin",
    lines: [
      { young: "cragpup", food: "meat", adults: ["gravelhorn", "cindermane", "scrapjaw", "gutterfang"] },
      { young: "dugling", food: "carrot", adults: ["moonlop", "barrowbun", "tuskmole", "mudlop"] },
      { young: "frillet", food: "worm", adults: ["sunfrill", "plateback", "bogviper", "slugwyrm"] },
      { young: "sporeling", food: "pellet", adults: ["hollowbloom", "potterling", "needlecap", "mossheap"] },
    ],
  },
  {
    field: "water",
    kid: "drizzle",
    lines: [
      { young: "lanternfin", food: "seafood", adults: ["murkfang", "puffglow", "rustgill", "wilteel"] },
      { young: "kelpet", food: "seaweed", adults: ["coralback", "bubblebelly", "brinetusk", "limpseal"] },
      { young: "scuttlet", food: "shrimp", adults: ["rampclaw", "shellsnug", "chipclaw", "softshell"] },
      { young: "bellet", food: "pellet", adults: ["stormbell", "inkpot", "spinewad", "droopstar"] },
    ],
  },
];
const tiers: Array<{ tier: number; care: Care }> = [
  { tier: 1, care: { topUp: true } },
  { tier: 2, care: { topUp: false } },
  { tier: 3, care: { topUp: false, neglectHours: 3 } },
  { tier: 4, care: { topUp: false, neglectHours: 8 } },
];

// The stage a creature must be in at game time t, by the plan's times (the baby leaves after 1 hour in the field).
function stageAt(t: number, t0: number): Stage {
  if (t < t0 + HOUR) return "baby";
  if (t < t0 + 25 * HOUR) return "kid";
  if (t < t0 + 73 * HOUR) return "young";
  return "adult";
}

function raise(field: FieldId, food: FoodId, care: Care): { adult: string; tier: number; history: string[] } {
  const t0 = at(8);
  const save = aliveSave("blip", t0);
  goTo(save, field, t0); // the player takes the baby out to the field straight away
  const youngStart = t0 + 25 * HOUR;
  const history: string[] = [];
  let tier = 0;
  for (let t = t0; t < t0 + 73 * HOUR + 30 * MINUTE; ) {
    t += 10 * MINUTE;
    simulateTo(save, t);
    const c = save.creature!;
    expect(save.phase, `alive at hour ${(t - t0) / HOUR}`).toBe("alive");
    expect(getForm(c.formId).stage, `stage at hour ${(t - t0) / HOUR}`).toBe(stageAt(t, t0));
    if (history.at(-1) !== c.formId) history.push(c.formId);
    if (t === t0 + 73 * HOUR - 10 * MINUTE) tier = tierOf(c); // the last look before the young grows up

    const hoursYoung = (t - youngStart) / HOUR;
    const neglecting = care.neglectHours !== undefined && hoursYoung >= 2 && hoursYoung < 2 + care.neglectHours;
    if (neglecting) {
      if (hoursYoung < 2 + 10 / 60) setStat(save, "hunger", 10); // forgot to feed: the call is up and nobody answers it
      continue;
    }
    if (c.sleep) {
      clean(save, t);
      if (c.sick) giveMedicine(save, t);
      continue;
    }
    if (c.sick) giveMedicine(save, t);
    if (c.poop > 0) clean(save, t);
    const stage = getForm(c.formId).stage;
    if (c.stats.hunger < (stage === "kid" ? 70 : stage === "young" && care.topUp ? 82 : 40)) {
      feed(save, stage === "kid" ? food : "pellet", t);
    }
    if (c.stats.happiness < 100) for (let i = 0; i < 6; i++) touch(save, "pet", t);
    if (c.stats.energy < 20) toggleLights(save, t);
  }
  return { adult: save.creature!.formId, tier, history };
}

for (const { field, kid, lines } of playable) {
  describe(`raising a creature to every ${field} adult`, () => {
    for (const line of lines) {
      for (const { tier, care } of tiers) {
        const adult = line.adults[tier - 1]!;
        it(`${line.food} then tier ${tier} care gives ${adult}, at the times of the plan`, () => {
          const result = raise(field, line.food, care);
          expect(result.history).toEqual(["blip", kid, line.young, adult]);
          expect(result.tier).toBe(tier);
          expect(result.adult).toBe(adult);
        });
      }
    }
  });
}
