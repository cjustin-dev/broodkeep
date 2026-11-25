// Builds the saved games the Retire browser checks start from. retire-browser.mjs reads the JSON this writes (saves/<scenario>-<mode>.json).
// It uses the repo's game rules (read-only) and writes plain JSON to $VERIFY_OUT/saves. Nothing is written to the repo.
// Run it with ./gen-saves.sh, which bundles this file first.
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateBoard } from "../../src/game/board";
import { discover } from "../../src/game/book";
import { makeCreature } from "../../src/game/sim";
import { newSave } from "../../src/game/state";
import { layoutOf, problemWith } from "../../src/art/homeLayout";
import type { HomeSave } from "../../src/data/home";
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

// A living adult whose save holds a moved home layout (H2a). The layout is checked here against the game's own rules and kept as written: a save the page would throw away
// (layoutOf falls back to the starter layout) would make the browser check compare the starter home with itself.
function withHome(mode: Mode, pieces: HomeSave["pieces"], moved: Record<string, { col: number; row: number }>): Save {
  const save = living(mode, ADULT);
  save.home = { pieces };
  const layout = layoutOf(save.home);
  const problem = problemWith(layout);
  if (problem !== null) throw new Error(`withHome: the layout breaks a rule: ${problem}`);
  for (const [kind, at] of Object.entries(moved)) {
    const got = layout[kind as keyof typeof layout];
    if (!got || got.col !== at.col || got.row !== at.row) throw new Error(`withHome: ${kind} is not at (${at.col}, ${at.row}) after layoutOf, the page would not show the layout`);
  }
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
  // A Land kid whose save holds a request board (a profile that was once in Adult Mode, A2.3): a Kid Mode page must look exactly as on main, and show nothing of it.
  "kid-board": (mode) => {
    const save = living(mode, KID);
    save.creature!.stageStartedAt = T - 3 * 60 * MINUTE;
    // Ids rise with the draws (the 8th draw, number 7, carries an item) and the oldest request is first, as the game writes them.
    save.board = {
      open: [
        { id: 7, type: "feed", target: "meat", have: 1, item: "stew", drewAt: T - 2 * 60 * MINUTE },
        { id: 8, type: "field", target: "land", have: 7, item: null, drewAt: T - 60 * MINUTE },
        { id: 9, type: "job", target: "meadow", have: 0, item: null, drewAt: T - 30 * MINUTE },
      ],
      waits: [],
      drawn: 10,
      done: 5,
    };
    // The page drops a board entry it cannot read, and then the Kid pages would compare equal without the board in the save: the board must survive as written.
    if (JSON.stringify(migrateBoard(JSON.parse(JSON.stringify(save.board)))) !== JSON.stringify(save.board)) throw new Error("kid-board: the board does not survive migrateBoard");
    return save;
  },
  "adult-away": (mode) => {
    const save = living(mode, ADULT);
    // out at the bug meadow; the job ends after T, so it is still running at T
    save.creature!.job = { spot: "meadow", startedAt: T - 3 * MINUTE, endsAt: T + 3 * MINUTE };
    return save;
  },
  // The sofa two tiles right of its starter place (13 to 15) and the rug two tiles left (13 to 11): home-browser.mjs's home-layout reads their pixels.
  "adult-home-moved": (mode) => withHome(mode, { sofa: { col: 15, row: 1 }, rug: { col: 11, row: 4 } }, { sofa: { col: 15, row: 1 }, rug: { col: 11, row: 4 } }),
  // The bed moved out of the bedroom into the living room, next to the sofa (columns 17 to 19, rows 1 and 2): a sleeping creature walks there and lies down.
  "adult-home-bedmoved": (mode) => withHome(mode, { bed: { col: 17, row: 1 } }, { bed: { col: 17, row: 1 } }),
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
