// Creature initiatives, the rules (docs/adult-a3-plan.md section 14). Pure: nothing here reads the clock or a random source of its own. A draw takes `rand` (0 up to, not including, 1)
// and a time is a number of milliseconds on the game's initiative clock, so a test can force every case. The state that holds an initiative is `Game.initiative` (ui/game.ts), never saved.

import { initiativeKinds, initiativeTuning as t } from "../data/initiatives";
import type { InitiativeKind } from "../data/initiatives";
import { materialIds, materials } from "../data/habitat";
import type { MaterialId } from "../data/habitat";
import { feedRefusal } from "./availability";
import { addBondXp, bondLevel } from "./bond";
import { menuOf } from "./growth";
import { logEvent } from "./state";
import type { Creature, Save } from "./state";
import type { FoodId } from "./types";

export type Gift = { kind: "coins"; amount: number } | { kind: "material"; id: MaterialId };

export interface Initiative {
  kind: InitiativeKind;
  bornAt: number; // the creature it was made for: another one (a retire and a hatch) ends it
  at: number; // the initiative clock when it was made
  food: FoodId | null; // a craving: what it asks for
  gift: Gift | null; // a gift: what the bubble shows and what a tap pays
  tosses: number; // a play: the tosses so far
  playFrom: number | null; // a play: the clock at the first toss
}

// The wait to the next initiative, 60,000 to 90,000 ms (both ends reachable).
export const nextDelay = (rand: () => number): number => t.delayMs[0] + Math.floor(rand() * (t.delayMs[1] - t.delayMs[0] + 1));

// A form's step for a kind: 0, 1 or 2, always the same for the same form and kind (FNV-1a over "<form>:<kind>"), so every form has a character of its own.
export function stepOf(formId: string, kind: InitiativeKind): number {
  let h = 0x811c9dc5;
  for (const ch of `${formId}:${kind}`) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return h % t.stepSteps;
}

// How much a kind weighs for this form at this Bond level (before what is possible now).
export const weightOf = (formId: string, level: number, kind: InitiativeKind): number =>
  t.base[kind] + stepOf(formId, kind) + (kind === "play" ? t.playPerBond * (level - 1) : 0);

// The two kinds this creature leans to, heaviest first (ties in the order play, craving, gift). It depends on the form and the Bond level only, never on what is possible now.
export function preferenceOf(c: Creature): InitiativeKind[] {
  const level = bondLevel(c);
  const order = initiativeKinds.map((kind, i) => ({ kind, i, w: weightOf(c.formId, level, kind) }));
  order.sort((a, b) => b.w - a.w || a.i - b.i);
  return order.slice(0, 2).map((o) => o.kind);
}

// The words for a preference, as the Bond card says them: "Prefers: play, cravings."
const preferenceWord: Record<InitiativeKind, string> = { play: "play", craving: "cravings", gift: "gifts" };
export const preferenceLine = (c: Creature): string => `Prefers: ${preferenceOf(c).map((k) => preferenceWord[k]).join(", ")}.`;

// The foods it could ask for now: its menu without the treat (it can make the creature sick), among those a meal would be taken at this moment (not while it is full).
export const cravingFoods = (c: Creature): FoodId[] => menuOf(c).filter((food) => food !== "treat" && feedRefusal(c, food) === null);

// Play and a gift can always be offered; a craving only when there is something to ask for.
export const possible = (c: Creature): Record<InitiativeKind, boolean> => ({ play: true, craving: cravingFoods(c).length > 0, gift: true });

// The kind to offer. The draw walks play, craving, gift: `rand() × total` is taken down by each weight and the first kind it falls inside is the one (strictly inside, so a kind with weight 0 is
// never taken). A kind that is not possible now weighs 0 for this draw.
export function pickKind(c: Creature, rand: () => number): InitiativeKind {
  const level = bondLevel(c);
  const can = possible(c);
  const weights = initiativeKinds.map((kind) => (can[kind] ? weightOf(c.formId, level, kind) : 0));
  const total = weights.reduce((sum, w) => sum + w, 0);
  let left = rand() * total;
  for (const [i, kind] of initiativeKinds.entries()) {
    const w = weights[i] as number;
    if (w > 0 && left < w) return kind;
    left -= w;
  }
  return initiativeKinds.find((_, i) => (weights[i] as number) > 0) as InitiativeKind; // (only reached when rounding left `left` at the very end)
}

// A found gift: 2 coins in 1 case in 3, otherwise 1 of the five materials (an even draw). One draw for the kind of gift and one more only for a material. A rustle in a field (game/tappables.ts) uses it too.
export const drawGift = (rand: () => number): Gift =>
  rand() < t.giftCoinChance ? { kind: "coins", amount: t.giftCoins } : { kind: "material", id: materialIds[Math.floor(rand() * materialIds.length)] as MaterialId };

// A new initiative for this creature at `clock`: the kind, and for a craving the food, for a gift the item.
export function newInitiative(c: Creature, clock: number, rand: () => number): Initiative {
  const kind = pickKind(c, rand);
  let food: FoodId | null = null;
  let gift: Gift | null = null;
  if (kind === "craving") {
    const foods = cravingFoods(c);
    food = foods[Math.floor(rand() * foods.length)] as FoodId;
  } else if (kind === "gift") {
    gift = drawGift(rand);
  }
  return { kind, bornAt: c.bornAt, at: clock, food, gift, tosses: 0, playFrom: null };
}

// A craving whose food the creature would no longer be given (it ate something else and is full, or went to sleep) cannot be answered: the next step drops it. A play or a gift is never moot.
export const isMoot = (i: Initiative, c: Creature): boolean => i.kind === "craving" && (i.food === null || feedRefusal(c, i.food) !== null);

// Whether the initiative is over by time: a play 15 s after its first toss or after its sixth toss, the others 30 s after they were made.
export function isOver(i: Initiative, clock: number): boolean {
  if (i.kind === "play" && i.playFrom !== null) return i.tosses >= t.tosses || clock - i.playFrom >= t.playMs;
  return clock - i.at >= t.fadeMs;
}

// A toss of the ball: counts it (the first starts the 15 s) and says whether it counted. A play that is over, or anything but a play, takes none.
export function countToss(i: Initiative, clock: number): boolean {
  if (i.kind !== "play" || isOver(i, clock)) return false;
  if (i.playFrom === null) i.playFrom = clock;
  i.tosses++;
  return true;
}

// Bond XP for an answer, with the level-up in the log the way a pet's is. Returns the level reached, or null.
export function payBond(save: Save, c: Creature, xp: number, nowMs: number): number | null {
  const level = addBondXp(c, xp);
  if (level !== null) logEvent(save, nowMs, `Bond level ${level}`);
  return level;
}

// A gift's pay, one line in the log and the note the player sees.
export function giftNote(gift: Gift): string {
  return gift.kind === "coins" ? `Found ${gift.amount} ${gift.amount === 1 ? "coin" : "coins"}.` : `Found some ${materials[gift.id].name.toLowerCase()}.`;
}
export function payGift(save: Save, gift: Gift, nowMs: number): string {
  if (gift.kind === "coins") save.coins += gift.amount;
  else save.inventory[gift.id] = (save.inventory[gift.id] ?? 0) + 1;
  const note = giftNote(gift);
  logEvent(save, nowMs, note.slice(0, -1));
  return note;
}
