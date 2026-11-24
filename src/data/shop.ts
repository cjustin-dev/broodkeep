// What the shop sells (adult track A2.2a). Four items: two for the room's care rules and two wallpapers. Prices were set from a measured day
// of play (tools/verify/run-income.sh, docs/adult-a2-plan.md section 9): a day is the three-visit player's 12 coins. All of them are `[tune]`.
// What an item does is in game/perks.ts (the care rules) and art/room.ts (the picture); this file is only the list, the prices and the words.

import { tuning } from "./tuning";
import type { MaterialId } from "./habitat";

export type ItemId = "comfy-bed" | "feeding-mat" | "wall-meadow" | "wall-dusk";
export type ItemKind = "furniture" | "wallpaper";

export interface Item {
  id: ItemId;
  name: string;
  kind: ItemKind;
  effect: string; // one line for the card, worked out from the tuning numbers
  price: { coins: number; materials: Partial<Record<MaterialId, number>> };
}

const bedHappiness = Math.round(tuning.shop.bedHappinessFactor * 100);

export const items: Record<ItemId, Item> = {
  "comfy-bed": {
    id: "comfy-bed",
    name: "Comfy Bed",
    kind: "furniture",
    effect: `While it sleeps at home, happiness falls ${bedHappiness}% as fast.`,
    price: { coins: 35, materials: { fiber: 3, wood: 2 } },
  },
  "feeding-mat": {
    id: "feeding-mat",
    name: "Feeding Mat",
    kind: "furniture",
    effect: `A meal that ends at ${tuning.fullAtHunger - tuning.shop.matHungerGrace} or more counts as a hunger cell (young stage).`,
    price: { coins: 25, materials: { fiber: 3, herb: 2 } },
  },
  "wall-meadow": {
    id: "wall-meadow",
    name: "Wallpaper: Meadow",
    kind: "wallpaper",
    effect: "A green wall for the room.",
    price: { coins: 12, materials: { herb: 2 } },
  },
  "wall-dusk": {
    id: "wall-dusk",
    name: "Wallpaper: Dusk",
    kind: "wallpaper",
    effect: "An evening blue wall for the room.",
    price: { coins: 12, materials: { stone: 2 } },
  },
};
export const itemIds = Object.keys(items) as ItemId[];

// An id read from a save or the screen: only the shop's own (so "constructor" and the like are not items).
export const isItemId = (id: unknown): id is ItemId => typeof id === "string" && Object.hasOwn(items, id);
export const isWallId = (id: unknown): id is ItemId => isItemId(id) && items[id].kind === "wallpaper";

// The wall colours: the plain wall (the room's own), and each wallpaper's base, stripe and baseboard.
export interface Wall {
  base: string;
  stripe: string;
  board: string;
}
export const plainWall: Wall = { base: "#efe3f7", stripe: "#e4d3f0", board: "#8a6bd1" };
export const walls: Record<"wall-meadow" | "wall-dusk", Wall> = {
  "wall-meadow": { base: "#dff0d2", stripe: "#cde6bd", board: "#4f8a3f" },
  "wall-dusk": { base: "#8e8ac4", stripe: "#827eb8", board: "#3b3570" },
};
