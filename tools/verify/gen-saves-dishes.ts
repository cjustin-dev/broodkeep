// Builds the saved games the dish contact sheet and the dish browser checks start from (saves/dishes-<scenario>-<mode>.json). It uses the repo's game
// rules (read-only) and writes plain JSON to $VERIFY_OUT/saves. Nothing is written to the repo. Run it with ./gen-saves-dishes.sh, which bundles it first.
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { specialId } from "../../src/data/special";
import { discover } from "../../src/game/book";
import { makeCreature } from "../../src/game/sim";
import { newSave } from "../../src/game/state";
import type { Save } from "../../src/game/state";

type Mode = "kid" | "adult";

// Game time for every save: 2026-11-22T15:00:00Z (daylight, awake). A kid hatched 3 hours before, so its 24 hours are far from over.
const T = Date.UTC(2026, 10, 22, 15, 0, 0);
const HOUR = 3_600_000;
const SECOND = 1000;
const ALL = ["hearty-bowl", "green-bowl", "sweet-bowl", "stew", "garden-mix"];

type Bag = Partial<Record<"fiber" | "herb" | "wood" | "fish" | "stone", number>>;
const bag5: Bag = { fiber: 5, herb: 5, wood: 5, fish: 5, stone: 5 };

// A living creature of the form at home at T, awake, with the given hunger, wallet and owned items.
function living(mode: Mode, formId: string, o: { hunger?: number; coins?: number; bag?: Bag; owned?: string[]; lastBuy?: Save["lastBuy"]; hoursLeft?: number } = {}): Save {
  const save = newSave(T, 1234);
  if (mode === "adult") save.settings.adultMode = true;
  const born = o.hoursLeft === undefined ? T - 3 * HOUR : T - (24 - o.hoursLeft) * HOUR; // a kid's stage lasts 24 hours (tuning.growth.kidHours)
  const creature = makeCreature(formId, born, save.egg!.pattern);
  creature.stageStartedAt = born;
  Object.assign(creature.stats, { hunger: o.hunger ?? 60, happiness: 90, energy: 90, hygiene: 90, wellness: 90 });
  save.creature = creature;
  save.egg = null;
  save.phase = "alive";
  discover(save, formId, born);
  save.lastSimulatedAt = T;
  save.coins = o.coins ?? 5;
  save.inventory = { ...(o.bag ?? {}) };
  save.owned = (o.owned ?? []) as Save["owned"];
  if (o.lastBuy !== undefined) save.lastBuy = o.lastBuy;
  return save;
}

const scenarios: Record<string, (mode: Mode) => Save> = {
  "kid-none": (mode) => living(mode, "pebblin"), // a Land kid that owns nothing: the tray must be as it was
  "kid-hearty": (mode) => living(mode, "pebblin", { owned: ["hearty-bowl"] }),
  "kid-all": (mode) => living(mode, "pebblin", { owned: ALL }),
  "kid-all-hungry": (mode) => living(mode, "pebblin", { owned: ALL, hunger: 65 }), // a 35 meal ends at 100: the second one is refused as full
  "kid-all-full": (mode) => living(mode, "pebblin", { owned: ALL, hunger: 97 }),
  "kid-ending": (mode) => living(mode, "pebblin", { owned: ALL, hoursLeft: 0.025 }), // 90 seconds of its 24 hours left: it grows up in the next two minutes
  "kid-stew": (mode) => living(mode, "pebblin", { owned: ["stew"] }),
  "water-all": (mode) => living(mode, "drizzle", { owned: ALL }),
  "sky-all": (mode) => living(mode, "cinderling", { owned: ALL }),
  "young-all": (mode) => living(mode, "cragpup", { owned: ALL }), // a young: no dish is offered, since only a kid's servings count
  "special-all": (mode) => living(mode, specialId, { owned: ALL }), // the special kid has no field foods
  "baby-all": (mode) => living(mode, "blip", { owned: ALL }),
  "adult-all": (mode) => living(mode, "cindermane", { owned: ALL }), // an adult: no dish is offered, since only a kid's servings count
  // The shop, for a Land kid:
  rich: (mode) => living(mode, "pebblin", { coins: 100, bag: bag5 }),
  poor: (mode) => living(mode, "pebblin", { coins: 10, bag: { fiber: 1 } }),
  "exact-hearty": (mode) => living(mode, "pebblin", { coins: 25, bag: { fish: 3 } }),
  "one-short-hearty": (mode) => living(mode, "pebblin", { coins: 25, bag: { fish: 2 } }),
  "owned-foods": (mode) => living(mode, "pebblin", { coins: 5, owned: ALL }),
  "just-bought-stew": (mode) =>
    living(mode, "pebblin", { coins: 65, bag: { fiber: 5, herb: 5, wood: 3, fish: 5, stone: 3 }, owned: ["stew"], lastBuy: { item: "stew", at: T - 3 * SECOND, wall: null } }),
};

const outDir = join(process.env.VERIFY_OUT ?? join(tmpdir(), "broodkeep-verify"), "saves") + "/";
mkdirSync(outDir, { recursive: true });
for (const [name, build] of Object.entries(scenarios)) {
  for (const mode of ["kid", "adult"] as const) {
    const save = build(mode);
    writeFileSync(`${outDir}dishes-${name}-${mode}.json`, JSON.stringify(save, null, 2) + "\n");
  }
  console.log(`wrote dishes-${name}-kid.json and dishes-${name}-adult.json`);
}
