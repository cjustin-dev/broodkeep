// Can the creature be cared for right now, and if not, why? One function per care action, each returning a code or null.
// actions.ts asks these after it has caught the save up, and the Adult Mode buttons ask the same functions, so a button and its action
// cannot disagree. The codes come in the order the action checks them, which is the order that decides the action's word when two
// things are wrong at once (a sleeping baby asked for meat is "unavailable", not "sleeping": the menu is checked first).
// They take a creature that is already caught up to "now" and never change it.

import { fields } from "../data/fields";
import { tuning } from "../data/tuning";
import { menuOf } from "./growth";
import type { Creature } from "./state";
import type { FoodId, Place } from "./types";

// "away" means out working in the habitat: it cannot be cared for until it is home.

export type FeedRefusal = "away" | "off-menu" | "asleep" | "full";

export function feedRefusal(c: Creature, food: FoodId): FeedRefusal | null {
  if (c.job) return "away";
  if (!menuOf(c).includes(food)) return "off-menu"; // only what the menu offers (pellets, the treat, its own field's foods)
  if (c.sleep) return "asleep";
  if (c.stats.hunger >= tuning.fullAtHunger) return "full";
  return null;
}

// The Feed button opens a tray of foods instead of feeding. Every food on the menu passes the menu step, and the rest of the checks do not
// look at which food it is, so the button asks about the pellet, which is always on the menu (so "off-menu" never comes back from here).
export const feedButtonRefusal = (c: Creature): FeedRefusal | null => feedRefusal(c, "pellet");

export type CleanRefusal = "away" | "nothing";

// Cleaning does something when there is poop or hygiene is below this.
export const cleanAtHygiene = 99;

export function cleanRefusal(c: Creature): CleanRefusal | null {
  if (c.job) return "away";
  if (c.poop === 0 && c.stats.hygiene >= cleanAtHygiene) return "nothing"; // nothing to clean up, and the creature itself is clean
  return null;
}

export type LightsRefusal = "away" | "night" | "not-tired";

// A napping creature is never refused: the button wakes it.
export function lightsRefusal(c: Creature): LightsRefusal | null {
  if (c.job) return "away";
  if (c.sleep === "night") return "night"; // night sleep follows the clock
  if (c.sleep === "nap") return null;
  if (c.stats.energy >= tuning.napBelowEnergy) return "not-tired";
  return null;
}

export type MedicineRefusal = "away" | "not-sick";

export function medicineRefusal(c: Creature): MedicineRefusal | null {
  if (c.job) return "away";
  if (!c.sick) return "not-sick"; // (there is no sleep rule: the action has none)
  return null;
}

export type GoRefusal = "away" | "asleep" | "already" | "locked";

// The Go button opens a tray of places, so it is refused for the first two reasons only.
export function goButtonRefusal(c: Creature): "away" | "asleep" | null {
  if (c.job) return "away";
  if (c.sleep) return "asleep";
  return null;
}

export function goRefusal(c: Creature, place: Place): GoRefusal | null {
  const button = goButtonRefusal(c);
  if (button) return button;
  if (place === c.place) return "already";
  if (place !== "home" && !fields[place].plan) return "locked"; // a field with no plan is not open yet
  return null;
}
