// Builds the saved games the habitat browser checks and the habitat contact sheet start from (saves/hab-<scenario>-<mode>.json, beside the
// Retire ones). It uses the repo's game rules (read-only) and writes plain JSON to $VERIFY_OUT/saves. Nothing is written to the repo.
// Run it with ./gen-saves-habitat.sh, which bundles this file first.
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spots } from "../../src/data/habitat";
import { discover } from "../../src/game/book";
import { makeCreature } from "../../src/game/sim";
import { newSave } from "../../src/game/state";
import type { Creature, Save } from "../../src/game/state";

type Mode = "kid" | "adult";

// Game time for every save: 2026-11-22T15:00:00Z (awake hours). The creatures hatched on 2026-11-12T10:00:00Z.
const T = Date.UTC(2026, 10, 22, 15, 0, 0);
const BORN = Date.UTC(2026, 10, 12, 10, 0, 0);
const MINUTE = 60_000;
const SECOND = 1000;

const ADULT = "gravelhorn"; // src/data/forms/land.ts: stage "adult"
const YOUNG = "cragpup"; // stage "young": Rock pile is shut to it
const BABY = "blip"; // stage "baby": Trees, Pond and Rock pile are shut to it

// A living creature at home at T in the chosen mode (Kid Mode has no settings.adultMode key at all), well fed and rested.
function living(mode: Mode, formId: string, change?: (c: Creature) => void): Save {
  const save = newSave(T, 1234);
  if (mode === "adult") save.settings.adultMode = true;
  const creature = makeCreature(formId, BORN, save.egg!.pattern);
  creature.stageStartedAt = BORN;
  Object.assign(creature.stats, { hunger: 70, happiness: 90, energy: 90, hygiene: 90, wellness: 90 });
  change?.(creature);
  save.creature = creature;
  save.egg = null;
  save.phase = "alive";
  discover(save, formId, BORN);
  save.lastSimulatedAt = T;
  return save;
}

// A creature that set off `startedAgo` ago. The trip's energy cost was taken when it set off, as the game does (beginJob in game/habitat/jobs.ts).
const away = (spot: "meadow" | "herbs" | "trees" | "pond" | "rocks", startedAgo: number, length: number) => (c: Creature) => {
  c.job = { spot, startedAt: T - startedAgo, endsAt: T - startedAgo + length };
  c.stats.energy -= spots[spot].energyCost;
};

const scenarios: Record<string, (mode: Mode) => Save> = {
  home: (mode) => living(mode, ADULT), // every spot open, energy 90
  young: (mode) => living(mode, YOUNG), // Rock pile shut (opens at Adult)
  baby: (mode) => living(mode, BABY), // Trees, Pond and Rock pile shut (open at Young and Adult)
  tired: (mode) => living(mode, ADULT, (c) => void (c.stats.energy = 29.5)), // shown as 29: Pond needs 30 and Rock pile 35, the meadow needs 25
  edge: (mode) => living(mode, ADULT, (c) => void (c.stats.energy = 30)), // Pond is open (30 - 10 = 20, the floor), Rock pile is not
  nap: (mode) => living(mode, ADULT, (c) => void ((c.sleep = "nap"), (c.stats.energy = 40))),
  sick: (mode) => living(mode, ADULT, (c) => void (c.sick = true)),
  "away-pond": (mode) => living(mode, ADULT, away("pond", 2 * MINUTE, 6 * MINUTE)), // a third of the way: 1 coin, no fish; energy 80
  "away-rocks": (mode) => living(mode, ADULT, away("rocks", 4 * MINUTE, 8 * MINUTE)), // half way: 2 coins, 1 Stone; energy 75
  "away-start": (mode) => living(mode, ADULT, away("meadow", 30 * SECOND, 3 * MINUTE)), // just left: nothing earned yet; energy 85
  "away-herbs": (mode) => living(mode, ADULT, away("herbs", 2 * MINUTE + 55 * SECOND, 3 * MINUTE)), // nearly back: 1 coin, 1 Herb; energy 85
};

const outDir = join(process.env.VERIFY_OUT ?? join(tmpdir(), "broodkeep-verify"), "saves") + "/";
mkdirSync(outDir, { recursive: true });
for (const [name, build] of Object.entries(scenarios)) {
  for (const mode of ["kid", "adult"] as const) {
    const save = build(mode);
    const file = `${outDir}hab-${name}-${mode}.json`;
    writeFileSync(file, JSON.stringify(save, null, 2) + "\n");
    const c = save.creature;
    console.log(`wrote ${file} creature=${c?.formId ?? "null"} energy=${c?.stats.energy} job=${c?.job?.spot ?? "none"} adultMode=${save.settings.adultMode === true}`);
  }
}
