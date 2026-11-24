// Builds the saved games the request board contact sheet and the board browser checks start from (saves/board-<scenario>-<mode>.json). It uses the
// repo's game rules (read-only) and writes plain JSON to $VERIFY_OUT/saves. Nothing is written to the repo. Run it with ./gen-saves-board.sh, which
// bundles it first. Every scenario is written for both modes: the Kid Mode file holds the same board (a Kid Mode profile that was once an Adult Mode
// one), and the browser checks must show nothing of it there.
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discover } from "../../src/game/book";
import type { Board, Request, Wait } from "../../src/game/board";
import { makeCreature } from "../../src/game/sim";
import { newSave } from "../../src/game/state";
import type { Save } from "../../src/game/state";

type Mode = "kid" | "adult";

// Game time for every save: 2026-11-22T15:00:00Z (daylight, awake). The clock is frozen at it in the browser, so no whole minute passes and a board
// is shown exactly as written here. A kid hatched 3 hours before, so its 24 hours are far from over.
const T = Date.UTC(2026, 10, 22, 15, 0, 0);
const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const SECOND = 1000;

type Bag = Partial<Record<"fiber" | "herb" | "wood" | "fish" | "stone", number>>;

// A living Land kid at home at T, awake, with the given wallet and board.
function living(mode: Mode, o: { board?: Partial<Board>; coins?: number; bag?: Bag; owned?: string[]; lastBuy?: Save["lastBuy"]; hunger?: number } = {}): Save {
  const save = newSave(T, 1234);
  if (mode === "adult") save.settings.adultMode = true;
  const born = T - 3 * HOUR;
  const creature = makeCreature("pebblin", born, save.egg!.pattern);
  creature.stageStartedAt = born;
  Object.assign(creature.stats, { hunger: o.hunger ?? 60, happiness: 90, energy: 90, hygiene: 90, wellness: 90 });
  save.creature = creature;
  save.egg = null;
  save.phase = "alive";
  discover(save, "pebblin", born);
  save.lastSimulatedAt = T;
  save.coins = o.coins ?? 12;
  save.inventory = { ...(o.bag ?? {}) };
  save.owned = (o.owned ?? []) as Save["owned"];
  if (o.lastBuy !== undefined) save.lastBuy = o.lastBuy;
  save.board = { open: [], waits: [], drawn: 0, done: 0, ...o.board };
  return save;
}

const request = (r: Pick<Request, "id" | "type" | "target"> & Partial<Request>): Request => ({ have: 0, item: null, drewAt: T - HOUR, ...r });
const busy = (n: number): Wait[] => Array.from({ length: n }, () => ({ doneAt: T, coins: 0, item: null })); // slots that wait for 15 minutes: nothing is drawn

const scenarios: Record<string, (mode: Mode) => Save> = {
  // Three open requests, one of them paying an item: the usual board.
  three: (mode) =>
    living(mode, {
      board: {
        open: [
          request({ id: 8, type: "feed", target: "meat", have: 1, drewAt: T - 2 * HOUR }),
          request({ id: 9, type: "field", target: "sky", have: 7 }),
          request({ id: 7, type: "job", target: "meadow", item: "stew", drewAt: T - 30 * MINUTE }),
        ],
        drawn: 10,
        done: 5,
      },
    }),
  // The other two types and a pellet request that pays a wallpaper.
  "types-b": (mode) =>
    living(mode, {
      board: {
        open: [
          request({ id: 12, type: "fight", target: null }),
          request({ id: 13, type: "buy", target: "feeding-mat" }),
          request({ id: 11, type: "feed", target: "pellet", item: "wall-dusk" }),
        ],
        drawn: 14,
        done: 9,
      },
    }),
  // The oldest request has been open 4 days: it pays a quarter more (a Carrot request pays 2, so 3).
  stale: (mode) =>
    living(mode, {
      board: {
        open: [
          request({ id: 1, type: "feed", target: "carrot", drewAt: T - 4 * DAY }),
          request({ id: 2, type: "job", target: "herbs", drewAt: T - DAY }),
          request({ id: 3, type: "field", target: "water", drewAt: T - 2 * HOUR }),
        ],
        drawn: 4,
      },
    }),
  // The longest words: a 21 letter title, the longest field title and the longest item names as rewards.
  longest: (mode) =>
    living(mode, {
      board: {
        open: [
          request({ id: 3, type: "buy", target: "wall-meadow", item: "wall-dusk" }),
          request({ id: 4, type: "field", target: "water" }),
          request({ id: 7, type: "job", target: "meadow", item: "wall-meadow" }),
        ],
        drawn: 8,
      },
    }),
  // One open request and two finished ones, 3 and 14 minutes ago: "Next request in 12 min" and "in 1 min".
  done: (mode) =>
    living(mode, {
      board: {
        open: [request({ id: 20, type: "feed", target: "worm" })],
        waits: [
          { doneAt: T - 3 * MINUTE, coins: 3, item: null },
          { doneAt: T - 14 * MINUTE, coins: 5, item: "wall-dusk" },
        ],
        drawn: 21,
        done: 12,
      },
    }),
  // An Adult Mode profile whose board has not been dealt yet.
  empty: (mode) => living(mode),
  // A purchase 5 seconds ago that is still undoable, with a request for it.
  "undo-pending": (mode) =>
    living(mode, {
      coins: 75,
      bag: { fiber: 7, herb: 3 },
      owned: ["feeding-mat"],
      lastBuy: { item: "feeding-mat", at: T - 5 * SECOND, wall: null },
      board: {
        open: [request({ id: 2, type: "buy", target: "feeding-mat" }), request({ id: 3, type: "feed", target: "meat" }), request({ id: 4, type: "field", target: "land" })],
        drawn: 5,
      },
    }),
  // The shop as it was, with a board behind it: the default tab must be the item list.
  rich: (mode) =>
    living(mode, {
      coins: 100,
      bag: { fiber: 5, herb: 5, wood: 5, fish: 5, stone: 5 },
      board: { open: [request({ id: 0, type: "feed", target: "pellet" })], waits: busy(2), drawn: 1 },
    }),
  // One request that two pellets finish (hunger 60 to 80 to 100): the live check eats them in the room.
  "live-feed": (mode) =>
    living(mode, { hunger: 60, board: { open: [request({ id: 5, type: "feed", target: "pellet", drewAt: T - 10 * MINUTE })], waits: busy(2), drawn: 6, done: 2 } }),
};

const outDir = join(process.env.VERIFY_OUT ?? join(tmpdir(), "broodkeep-verify"), "saves") + "/";
mkdirSync(outDir, { recursive: true });
for (const [name, build] of Object.entries(scenarios)) {
  for (const mode of ["kid", "adult"] as const) {
    const save = build(mode);
    writeFileSync(`${outDir}board-${name}-${mode}.json`, JSON.stringify(save, null, 2) + "\n");
  }
  console.log(`wrote board-${name}-kid.json and board-${name}-adult.json`);
}
