// The shop's rules (adult track A2.2a, docs/adult-a2-plan.md section 9): buying with coins and materials, the 10 second undo, and which wallpaper is
// on the wall. What an item does to the care rules is in perks.ts; the list and the prices are in data/shop.ts. Like the other actions, each of
// these catches the save up to "now" first (a job that ended before now has paid by then). `nowMs` is game time.

import { materialIds, materials } from "../data/habitat";
import { withoutWall } from "../data/home";
import type { MaterialId } from "../data/habitat";
import { isItemId, isWallId, items } from "../data/shop";
import type { ItemId } from "../data/shop";
import { tuning } from "../data/tuning";
import { simulateTo } from "./sim";
import { logEvent } from "./state";
import type { Save } from "./state";

export type BuyRefusal = "unknown" | "owned" | "poor";
export type BuyResult = "bought" | BuyRefusal;
export type UndoResult = "undone" | "none" | "late";

export interface Missing {
  coins: number;
  materials: Partial<Record<MaterialId, number>>;
}

// What the player still lacks for an item: coins and each material (only the ones that are short).
export function missingFor(save: Save, id: ItemId): Missing {
  const price = items[id].price;
  const missing: Missing = { coins: Math.max(0, price.coins - save.coins), materials: {} };
  for (const material of materialIds) {
    const need = price.materials[material] ?? 0;
    const short = need - (save.inventory[material] ?? 0);
    if (short > 0) missing.materials[material] = short;
  }
  return missing;
}

// Why an item cannot be bought right now, or null. The order is the order the buy checks them.
export function buyRefusal(save: Save, id: string): BuyRefusal | null {
  if (!isItemId(id)) return "unknown";
  if (save.owned.includes(id)) return "owned";
  const missing = missingFor(save, id);
  return missing.coins > 0 || Object.keys(missing.materials).length > 0 ? "poor" : null;
}

// "Needs 3 more coins and 2 more Fiber." for an item the player cannot afford yet.
export function poorText(save: Save, id: ItemId): string {
  const missing = missingFor(save, id);
  const parts: string[] = [];
  if (missing.coins > 0) parts.push(`${missing.coins} more ${missing.coins === 1 ? "coin" : "coins"}`);
  for (const material of materialIds) {
    const short = missing.materials[material];
    if (short) parts.push(`${short} more ${materials[material].name}`);
  }
  return `Needs ${parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0]}.`;
}

// Buy an item: all the coins and materials leave in one step, or nothing changes. A wallpaper goes on the wall at once.
export function buy(save: Save, id: string, nowMs: number): BuyResult {
  simulateTo(save, nowMs);
  const refusal = buyRefusal(save, id);
  if (refusal) return refusal;
  const item = items[id as ItemId];
  save.coins -= item.price.coins;
  for (const material of materialIds) {
    const need = item.price.materials[material];
    if (need) save.inventory[material] = (save.inventory[material] ?? 0) - need;
  }
  const wallBefore = save.wall;
  save.owned.push(item.id);
  if (item.kind === "wallpaper") save.wall = item.id;
  save.lastBuy = { item: item.id, at: nowMs, wall: wallBefore };
  logEvent(save, nowMs, `Bought ${item.name}`);
  return "bought";
}

// Milliseconds left to undo the last purchase, or null when there is nothing to undo. A purchase "in the future" (the clock was set back since)
// has no window, so the window is never longer than `undoSeconds`.
export function undoLeftMs(save: Save, nowMs: number): number | null {
  if (!save.lastBuy) return null;
  const since = nowMs - save.lastBuy.at;
  const window = tuning.shop.undoSeconds * 1000;
  return since >= 0 && since <= window ? window - since : null;
}

// Take the last purchase back for a full refund, if it is still inside the window. The refund is the item's price, exactly.
export function undoBuy(save: Save, nowMs: number): UndoResult {
  simulateTo(save, nowMs);
  const last = save.lastBuy;
  if (!last) return "none";
  if (undoLeftMs(save, nowMs) === null) {
    save.lastBuy = null;
    return "late";
  }
  const item = items[last.item as ItemId];
  save.lastBuy = null;
  if (!save.owned.includes(item.id)) return "none";
  save.coins += item.price.coins;
  for (const material of materialIds) {
    const paid = item.price.materials[material];
    if (paid) save.inventory[material] = (save.inventory[material] ?? 0) + paid;
  }
  save.owned = save.owned.filter((id) => id !== item.id);
  if (save.wall === item.id) save.wall = last.wall;
  const home = withoutWall(save.home, item.id); // (a room that shows it loses it: it is not owned any more)
  if (home) save.home = home;
  logEvent(save, nowMs, `Undid ${item.name}`);
  return "undone";
}

// Put an owned wallpaper on the wall, or null for the plain wall. Returns whether the wall changed.
export function useWall(save: Save, id: string | null): boolean {
  if (id !== null && !(isWallId(id) && save.owned.includes(id))) return false;
  if (save.wall === id) return false;
  save.wall = id;
  return true;
}
