// What the shop sells (adult track A2.2, A2.4). Thirteen items: two for the room's care rules (A2.2a), two wallpapers (A2.2a), five foods (A2.2b) and four hats (A2.4). Prices were
// set from a measured day of play (tools/verify/run-income.sh, docs/adult-a2-plan.md sections 9 and 10): a day is the three-visit player's 12 coins.
// All of them are `[tune]`. What an item does is in game/perks.ts (the care rules), game/dishes.ts (the foods), art/room.ts (the picture) and art/hat.ts (the hats);
// this file is only the list, the prices and the words.

import { fieldIds, fields } from "./fields";
import { foods } from "./foods";
import { tuning } from "./tuning";
import type { MaterialId } from "./habitat";

export type HatId = "hat-knit" | "hat-acorn" | "hat-fisher" | "hat-crown";
export type ItemId =
  | "comfy-bed"
  | "feeding-mat"
  | "wall-meadow"
  | "wall-dusk"
  | "hearty-bowl"
  | "green-bowl"
  | "sweet-bowl"
  | "stew"
  | "garden-mix"
  | HatId;
export type ItemKind = "furniture" | "wallpaper" | "food" | "hat";

// Which of a field's three foods (the order of `plan.foods` in data/fields.ts): the filling one, the light one, the sweet one.
export type FoodKind = 0 | 1 | 2;
export const foodKindNames = ["filling", "light", "sweet"] as const;

// A shop food, a "dish" (game/dishes.ts): a meal of the creature's own `food` kind, fed from the tray. A dish with no `also` counts one whole food cell
// (`servingsPerFoodCell` servings); one with `also` counts one serving of its own food and one of the `also` kind.
export interface Dish {
  food: FoodKind;
  also?: FoodKind;
}

export interface Item {
  id: ItemId;
  name: string;
  kind: ItemKind;
  effect: string; // one line for the card, worked out from the tuning numbers
  price: { coins: number; materials: Partial<Record<MaterialId, number>> };
  dish?: Dish; // a food: what a meal of it counts (kind "food" only)
}

const bedHappiness = Math.round(tuning.shop.bedHappinessFactor * 100);
const boostServings = tuning.growth.servingsPerFoodCell; // a booster counts one whole cell

// "Meat, Seafood, Chicken": the foods of that kind in every field. (The food items' `effect` is a getter that calls these, so the list is read from the
// fields data when a card is drawn, not when this file loads.)
const foodsOfKind = (kind: FoodKind): string =>
  fieldIds
    .flatMap((id) => fields[id].plan?.foods[kind] ?? [])
    .map((food) => foods[food].name)
    .join(", ");
const boosterEffect = (kind: FoodKind): string =>
  `The ${foodKindNames[kind]} food (${foodsOfKind(kind)}) counts ${boostServings} servings (kid stage).`;
const recipeEffect = (kind: FoodKind, also: FoodKind): string =>
  `A ${foodKindNames[kind]} meal that also counts 1 serving of the ${foodKindNames[also]} food (kid stage).`;

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
  "hearty-bowl": {
    id: "hearty-bowl",
    name: "Hearty Bowl",
    kind: "food",
    get effect() {
      return boosterEffect(0);
    },
    price: { coins: 25, materials: { fish: 3 } },
    dish: { food: 0 },
  },
  "green-bowl": {
    id: "green-bowl",
    name: "Green Bowl",
    kind: "food",
    get effect() {
      return boosterEffect(1);
    },
    price: { coins: 25, materials: { herb: 3 } },
    dish: { food: 1 },
  },
  "sweet-bowl": {
    id: "sweet-bowl",
    name: "Sweet Bowl",
    kind: "food",
    get effect() {
      return boosterEffect(2);
    },
    price: { coins: 25, materials: { fiber: 3 } },
    dish: { food: 2 },
  },
  stew: {
    id: "stew",
    name: "Stew",
    kind: "food",
    get effect() {
      return recipeEffect(0, 1);
    },
    price: { coins: 35, materials: { wood: 2, stone: 2 } },
    dish: { food: 0, also: 1 },
  },
  "garden-mix": {
    id: "garden-mix",
    name: "Garden Mix",
    kind: "food",
    get effect() {
      return recipeEffect(1, 2);
    },
    price: { coins: 35, materials: { fish: 2, stone: 2 } },
    dish: { food: 1, also: 2 },
  },
  // The hats are for looks only (art/hat.ts draws them): a cosmetic is about one day of the measured income, as the wallpapers are.
  "hat-knit": {
    id: "hat-knit",
    name: "Knit Cap",
    kind: "hat",
    effect: "A red knit cap with a pom-pom. For looks only.",
    price: { coins: 12, materials: { fiber: 2 } },
  },
  "hat-acorn": {
    id: "hat-acorn",
    name: "Acorn Cap",
    kind: "hat",
    effect: "A brown acorn cap. For looks only.",
    price: { coins: 12, materials: { wood: 2 } },
  },
  "hat-fisher": {
    id: "hat-fisher",
    name: "Fisher Hat",
    kind: "hat",
    effect: "A yellow fisher's hat with a brim. For looks only.",
    price: { coins: 12, materials: { fish: 2 } },
  },
  "hat-crown": {
    id: "hat-crown",
    name: "Stone Crown",
    kind: "hat",
    effect: "A grey crown with three points. For looks only.",
    price: { coins: 12, materials: { stone: 2 } },
  },
};
export const itemIds = Object.keys(items) as ItemId[];

// An id read from a save or the screen: only the shop's own (so "constructor" and the like are not items).
export const isItemId = (id: unknown): id is ItemId => typeof id === "string" && Object.hasOwn(items, id);
export const isWallId = (id: unknown): id is ItemId => isItemId(id) && items[id].kind === "wallpaper";
export const isHatId = (id: unknown): id is HatId => isItemId(id) && items[id].kind === "hat";

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
