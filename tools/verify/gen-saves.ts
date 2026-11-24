// Builds the saved games the Retire browser checks start from. retire-browser.mjs reads the JSON this writes (saves/<scenario>-<mode>.json).
// It uses the repo's game rules (read-only) and writes plain JSON to $VERIFY_OUT/saves. Nothing is written to the repo.
// Run it with ./gen-saves.sh, which bundles this file first.
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discover } from "../../src/game/book";
import { makeCreature } from "../../src/game/sim";
import { newSave } from "../../src/game/state";
import type { RetiredLife, Save } from "../../src/game/state";

type Mode = "kid" | "adult";

// Game time for every save: 2026-11-22T15:00:00Z. The adult hatched on 2026-11-12T10:00:00Z.
const T = Date.UTC(2026, 10, 22, 15, 0, 0);
const BORN = Date.UTC(2026, 10, 12, 10, 0, 0);
const MINUTE = 60_000;

const ADULT = "gravelhorn"; // src/data/forms/land.ts: stage "adult", name "Gravelhorn"
const YOUNG = "cragpup"; // src/data/forms/land.ts: stage "young"
const KID = "pebblin"; // src/data/forms/land.ts: stage "kid", the Land field's kid

// A new game at T in the chosen mode. Kid Mode has no settings.adultMode key at all (only `true` turns Adult Mode on).
function base(mode: Mode): Save {
  const save = newSave(T, 1234);
  if (mode === "adult") save.settings.adultMode = true;
  return save;
}

// A living creature at home, well fed and rested at T, so nothing starves before the check acts.
function living(mode: Mode, formId: string): Save {
  const save = base(mode);
  const creature = makeCreature(formId, BORN, save.egg!.pattern);
  creature.stageStartedAt = BORN;
  Object.assign(creature.stats, { hunger: 70, happiness: 90, energy: 90, hygiene: 90, wellness: 90 });
  save.creature = creature;
  save.egg = null;
  save.phase = "alive";
  discover(save, formId, BORN);
  save.lastSimulatedAt = T;
  return save;
}

// Completed lives, oldest first (the order the save keeps them). The constructor record is the one with a form id the data does not know.
const LIVES: RetiredLife[] = [
  { formId: "gravelhorn", bornAt: Date.UTC(2026, 9, 1, 9), retiredAt: Date.UTC(2026, 9, 10, 9) },
  { formId: "moonlop", bornAt: Date.UTC(2026, 9, 15, 9), retiredAt: Date.UTC(2026, 9, 30, 9) },
  { formId: "constructor", bornAt: Date.UTC(2026, 10, 2, 9), retiredAt: Date.UTC(2026, 10, 5, 9) },
  { formId: "barrowbun", bornAt: Date.UTC(2026, 10, 6, 9), retiredAt: Date.UTC(2026, 10, 8, 9) },
];

const scenarios: Record<string, (mode: Mode) => Save> = {
  "adult-home": (mode) => living(mode, ADULT),
  "young-home": (mode) => living(mode, YOUNG),
  // A Land kid that owns nothing (A2.2b): the Feed tray of a profile with no dish must be as it was on main. The dish row itself, which exists only with a dish
  // owned (main would drop the unknown id), is checked by gen-saves-dishes.ts and dishes-browser.mjs, not by this old-against-new comparison.
  "kid-home": (mode) => {
    const save = living(mode, KID);
    save.creature!.stageStartedAt = T - 3 * 60 * MINUTE; // a kid's stage lasts 24 hours: this one is 3 hours in, so it does not grow up while the page is open
    return save;
  },
  "adult-away": (mode) => {
    const save = living(mode, ADULT);
    // out at the bug meadow; the job ends after T, so it is still running at T
    save.creature!.job = { spot: "meadow", startedAt: T - 3 * MINUTE, endsAt: T + 3 * MINUTE };
    return save;
  },
  "adult-fight": (mode) => living(mode, ADULT), // the browser check starts the fight through the Arena screen
  egg: (mode) => base(mode), // a new game: phase egg, no creature
  "adult-home-lives": (mode) => {
    const save = living(mode, ADULT);
    save.retired = LIVES.map((life) => ({ ...life }));
    return save;
  },
};

const outDir = join(process.env.VERIFY_OUT ?? join(tmpdir(), "broodkeep-verify"), "saves") + "/";
mkdirSync(outDir, { recursive: true });
for (const [name, build] of Object.entries(scenarios)) {
  for (const mode of ["kid", "adult"] as const) {
    const save = build(mode);
    const file = `${outDir}${name}-${mode}.json`;
    writeFileSync(file, JSON.stringify(save, null, 2) + "\n");
    console.log(`wrote ${file} phase=${save.phase} creature=${save.creature?.formId ?? "null"} adultMode=${save.settings.adultMode === true} retired=${save.retired.length}`);
  }
}
