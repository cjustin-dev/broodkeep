// Builds the saved games the Book recipe contact sheet and browser checks start from (saves/recipes-<scenario>-<mode>.json). It uses the repo's game rules
// (read-only) and writes plain JSON to $VERIFY_OUT/saves. Nothing is written to the repo. Run it with ./gen-saves-recipes.sh, which bundles it first.
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bookIds } from "../../src/data/book";
import { planOf } from "../../src/data/fields";
import { getForm } from "../../src/data/forms";
import { specialId } from "../../src/data/special";
import { discover } from "../../src/game/book";
import { lineageOf } from "../../src/data/book";
import { makeCreature } from "../../src/game/sim";
import { newSave } from "../../src/game/state";
import type { Creature, Save } from "../../src/game/state";

type Mode = "kid" | "adult";

// Game time for every save: 2026-11-22T15:00:00Z (daylight, awake), as the other generators have it.
const T = Date.UTC(2026, 10, 22, 15, 0, 0);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const land = planOf("land");
const water = planOf("water");
const sky = planOf("sky");
const young = land.youngOther; // a Land young (the fourth)
const adultsOf = (plan: typeof land, y: string): string[] => plan.adults[y]!;

// A living creature of the form at home at T, awake and well, with its line in the Book. `set` changes it before the Book is filled.
function living(mode: Mode, formId: string, set: (c: Creature, save: Save) => void = () => undefined): Save {
  const save = newSave(T, 1234);
  if (mode === "adult") save.settings.adultMode = true;
  const creature = makeCreature(formId, T - 3 * HOUR, save.egg!.pattern);
  Object.assign(creature.stats, { hunger: 80, happiness: 90, energy: 90, hygiene: 90, wellness: 90 });
  save.creature = creature;
  save.egg = null;
  save.phase = "alive";
  for (const id of lineageOf(formId)) discover(save, id, T - 3 * HOUR);
  save.lastSimulatedAt = T;
  set(creature, save);
  return save;
}

const raiseAll = (save: Save, except: string[] = []): void => {
  save.book = bookIds().filter((id) => !except.includes(id));
};

// A Land young half a minute short of 48 hours, with 5 hunger and 5 happy cells and no mistake in this stage (so its adult is tier 1): one minute of play grows it up.
// `set` gives the record of its earlier stages: no mistake, one, or none kept (a save from before the star).
const growing = (mode: Mode, set: (c: Creature) => void): Save =>
  living(mode, young, (c) => {
    Object.assign(c.counters, { hungerCells: 5, happyCells: 5, careMistakes: 0 });
    c.stageStartedAt = T - 48 * HOUR + 30_000;
    set(c);
  });

const scenarios: Record<string, (mode: Mode) => Save> = {
  // Nothing raised: an egg and an empty Book.
  egg: (mode) => {
    const save = newSave(T, 1234);
    if (mode === "adult") save.settings.adultMode = true;
    return save;
  },
  baby: (mode) => living(mode, "blip"), // a known life with no mistake: the Forecast says the run is possible
  "baby-mistake": (mode) => living(mode, "blip", (c) => (c.counters.careMistakes = 1)), // a mistake: the Forecast says nothing
  kid: (mode) => living(mode, land.kid),
  young: (mode) => living(mode, young, (c) => (c.pastMistakes = 0)),
  "young-unknown": (mode) => living(mode, young, (c) => delete c.pastMistakes), // made before the star existed: no record, no line
  "adult-perfect": (mode) =>
    living(mode, adultsOf(land, young)[0]!, (c, save) => {
      c.perfect = true;
      c.pastMistakes = 0;
      save.perfect = [c.formId];
    }),
  "adult-plain": (mode) => living(mode, adultsOf(land, young)[2]!, (c) => (c.pastMistakes = 4)),
  "growing-perfect": (mode) => growing(mode, (c) => (c.pastMistakes = 0)),
  "growing-mistake": (mode) => growing(mode, (c) => (c.pastMistakes = 1)),
  "growing-unknown": (mode) => growing(mode, (c) => delete c.pastMistakes),
  special: (mode) => living(mode, specialId, (c) => (c.pastMistakes = 0)),
  // Completed lives: a perfect one, a plain one and one whose form this version does not know; a living adult beside them.
  lives: (mode) =>
    living(mode, adultsOf(water, water.youngOther)[1]!, (c, save) => {
      c.pastMistakes = 0;
      for (const id of [adultsOf(land, young)[0]!, adultsOf(land, young)[3]!]) discover(save, id, T - 9 * DAY);
      save.retired = [
        { formId: adultsOf(land, young)[0]!, bornAt: T - 12 * DAY, retiredAt: T - 9 * DAY, perfect: true },
        { formId: adultsOf(land, young)[3]!, bornAt: T - 8 * DAY, retiredAt: T - 5 * DAY },
        { formId: "constructor", bornAt: T - 4 * DAY, retiredAt: T - 2 * DAY },
      ];
      save.perfect = [adultsOf(land, young)[0]!];
    }),
  // Two fields raised, five stars: four of Land's tier 1 adults and the Water kid, and one star for a real form that is not in the Book (a bad file's), which must show nowhere.
  stars: (mode) =>
    living(mode, adultsOf(land, young)[0]!, (c, save) => {
      c.perfect = true;
      c.pastMistakes = 0;
      save.book = [];
      for (const plan of [land, water]) for (const id of [plan.kid, ...Object.values(plan.young), plan.youngOther, ...Object.values(plan.adults).flat()]) discover(save, id as string, T - DAY);
      discover(save, "blip", T - DAY);
      const landFirsts = Object.values(land.adults).map((tiers) => tiers[0]!);
      save.perfect = [...landFirsts, water.kid, adultsOf(sky, sky.youngOther)[0]!];
    }),
  // Everything raised but the last tier 4 adult of the Sky: the next creature to find is that one. The Special page is the last page, so its cell is the end of the panel.
  bottom: (mode) =>
    living(mode, adultsOf(land, young)[0]!, (c, save) => {
      raiseAll(save, [adultsOf(sky, sky.youngOther)[3]!]);
      c.pastMistakes = 0;
    }),
  full: (mode) =>
    living(mode, adultsOf(land, young)[0]!, (c, save) => {
      raiseAll(save);
      c.perfect = true;
      c.pastMistakes = 0;
      save.perfect = [c.formId, ...Object.values(sky.adults).map((tiers) => tiers[0]!)];
    }),
};

const outDir = join(process.env.VERIFY_OUT ?? join(tmpdir(), "broodkeep-verify"), "saves") + "/";
mkdirSync(outDir, { recursive: true });
for (const [name, build] of Object.entries(scenarios)) {
  for (const mode of ["kid", "adult"] as const) {
    writeFileSync(`${outDir}recipes-${name}-${mode}.json`, JSON.stringify(build(mode), null, 2) + "\n");
  }
  console.log(`wrote recipes-${name}-kid.json and recipes-${name}-adult.json`);
}
// Every form's name, from the repo's own data: the checks that look for the name of a creature that is not raised read it from here, not from the page.
writeFileSync(`${outDir}recipes-names.json`, JSON.stringify(bookIds().map((id) => getForm(id).name)) + "\n");
console.log("wrote recipes-names.json");
