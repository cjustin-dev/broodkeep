// Builds the saved games the shop contact sheet and the shop browser checks start from (saves/shop-<scenario>-<mode>.json). It uses the repo's game
// rules (read-only) and writes plain JSON to $VERIFY_OUT/saves. Nothing is written to the repo. Run it with ./gen-saves-shop.sh, which bundles it first.
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discover } from "../../src/game/book";
import { killCreature } from "../../src/game/dev";
import { makeCreature } from "../../src/game/sim";
import { newSave } from "../../src/game/state";
import type { Save } from "../../src/game/state";

type Mode = "kid" | "adult";
const HATS = ["hat-knit", "hat-acorn", "hat-fisher", "hat-crown"];

// Game time for every save: 2026-11-22T15:00:00Z (daylight, awake). The creature hatched on 2026-11-12T10:00:00Z.
const T = Date.UTC(2026, 10, 22, 15, 0, 0);
const BORN = Date.UTC(2026, 10, 12, 10, 0, 0);
const SECOND = 1000;
const ADULT = "gravelhorn";

type Bag = Partial<Record<"fiber" | "herb" | "wood" | "fish" | "stone", number>>;

// A living adult at home at T, well fed and rested, with the given wallet and shop state.
function living(mode: Mode, wallet: { coins: number; bag: Bag }, shop: Partial<Pick<Save, "owned" | "wall" | "lastBuy">> = {}, formId = ADULT): Save {
  const save = newSave(T, 1234);
  if (mode === "adult") save.settings.adultMode = true;
  const creature = makeCreature(formId, BORN, save.egg!.pattern);
  creature.stageStartedAt = BORN;
  Object.assign(creature.stats, { hunger: 70, happiness: 90, energy: 90, hygiene: 90, wellness: 90 });
  save.creature = creature;
  save.egg = null;
  save.phase = "alive";
  discover(save, formId, BORN);
  save.lastSimulatedAt = T;
  save.coins = wallet.coins;
  save.inventory = { ...wallet.bag };
  Object.assign(save, shop);
  return save;
}

const all: Bag = { fiber: 5, herb: 5, wood: 5, fish: 5, stone: 5 };

const scenarios: Record<string, (mode: Mode) => Save> = {
  rich: (mode) => living(mode, { coins: 100, bag: all }), // can buy any one item (the bag holds 5 Fiber, so not the bed and the mat together)
  "long-name": (mode) => living(mode, { coins: 100, bag: all }, {}, "hollowbloom"), // the longest form names are 11 letters (Bubblebelly, Hollowbloom)
  poor: (mode) => living(mode, { coins: 10, bag: { fiber: 1 } }), // can buy nothing; short of coins and materials
  mixed: (mode) => living(mode, { coins: 30, bag: { fiber: 2, herb: 2, stone: 1 } }), // Meadow yes; Dusk, mat and bed short of something
  "exact-meadow": (mode) => living(mode, { coins: 12, bag: { herb: 2 } }), // exactly the Meadow price: buying it leaves 0 and 0
  "one-short-meadow": (mode) => living(mode, { coins: 11, bag: { herb: 2 } }), // one coin short of Meadow
  "owned-walls": (mode) => living(mode, { coins: 5, bag: {} }, { owned: ["wall-dusk", "wall-meadow"], wall: "wall-meadow" }),
  "owned-all": (mode) => living(mode, { coins: 5, bag: {} }, { owned: ["comfy-bed", "feeding-mat", "wall-meadow", "wall-dusk"], wall: "wall-dusk" }),
  "just-bought": (mode) => living(mode, { coins: 65, bag: { fiber: 2, herb: 5, wood: 3, fish: 5, stone: 5 } }, { owned: ["comfy-bed"], wall: null, lastBuy: { item: "comfy-bed", at: T - 3 * SECOND, wall: null } }),
};

// The hats (A2.4): all four owned and the wallet nearly empty; the same wearing the Knit Cap; one that has a creature out in the land field; one at work in the habitat; a dead one
// wearing it; and a save that can pay for exactly the Knit Cap (12 coins, 2 Fiber).
Object.assign(scenarios, {
  "hats-owned": (mode: Mode) => living(mode, { coins: 5, bag: {} }, { owned: [...HATS] }),
  "hat-worn": (mode: Mode) => living(mode, { coins: 5, bag: {} }, { owned: [...HATS], hat: "hat-knit" }),
  "hat-field": (mode: Mode) => {
    const save = living(mode, { coins: 5, bag: {} }, { owned: [...HATS], hat: "hat-knit" });
    save.creature!.place = "land";
    return save;
  },
  "hat-dead": (mode: Mode) => {
    const save = living(mode, { coins: 5, bag: {} }, { owned: [...HATS], hat: "hat-knit" });
    killCreature(save, T);
    return save;
  },
  // Out on a trip to the trees (it set off a minute ago and is back in ten): the habitat draws it at work, wearing the cap.
  "hat-working": (mode: Mode) => {
    const save = living(mode, { coins: 5, bag: {} }, { owned: [...HATS], hat: "hat-knit" });
    save.creature!.job = { spot: "trees", startedAt: T - 60 * SECOND, endsAt: T + 600 * SECOND };
    return save;
  },
  "hat-exact": (mode: Mode) => living(mode, { coins: 12, bag: { fiber: 2 } }),
  // A young Scorchlet asleep at night, with the Knit Cap on and without: it walks to the bed and lies down, and its picture lying is the one whose blanket box a hat moves (the
  // top of the box is row 26 bare and row 24 in the Knit Cap, tests/hats.test.ts), so the two saves show whether the blanket is fitted to the hatless picture ("hat-bed").
  "hat-asleep": (mode: Mode) => asleep(living(mode, { coins: 5, bag: {} }, { owned: [...HATS], hat: "hat-knit" }, "scorchlet")),
  "hat-asleep-bare": (mode: Mode) => asleep(living(mode, { coins: 5, bag: {} }, { owned: [...HATS] }, "scorchlet")),
});

function asleep(save: Save): Save {
  save.creature!.sleep = "night";
  return save;
}

const outDir = join(process.env.VERIFY_OUT ?? join(tmpdir(), "broodkeep-verify"), "saves") + "/";
mkdirSync(outDir, { recursive: true });
for (const [name, build] of Object.entries(scenarios)) {
  for (const mode of ["kid", "adult"] as const) {
    const save = build(mode);
    writeFileSync(`${outDir}shop-${name}-${mode}.json`, JSON.stringify(save, null, 2) + "\n");
  }
  console.log(`wrote shop-${name}-kid.json and shop-${name}-adult.json`);
}
