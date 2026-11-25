// The request board's rules (adult track A2.3, docs/adult-a2-plan.md section 11): which requests are drawn, how the things the player does count toward
// them, when they pay, and how the board refills. Adult Mode only: with the setting off nothing here counts, draws or changes anything, so a Kid Mode
// profile plays exactly as before. The list, the needs and the coin numbers are in data/requests.ts; the saved shape and how it is read back are in
// board.ts. The actions only count (`noteRequest`); the simulation does the rest, one minute at a time (`stepRequests`), so a request finishes the same
// way whether the app was open or closed.

import { combatTuning } from "../data/combat";
import { fields, openFieldIds } from "../data/fields";
import { getForm } from "../data/forms";
import { foods } from "../data/foods";
import { materialIds, spotIds, spots } from "../data/habitat";
import type { MaterialId, SpotId } from "../data/habitat";
import { requestTuning, requestTypes } from "../data/requests";
import type { RequestType } from "../data/requests";
import { itemIds, items } from "../data/shop";
import type { ItemId } from "../data/shop";
import { tuning } from "../data/tuning";
import type { Board, Request, Wait } from "./board";
import { menuOf } from "./growth";
import { makeRng } from "./rng";
import type { Rng } from "./rng";
import { logEvent } from "./state";
import type { Creature, Save } from "./state";
import { MINUTE } from "./time";
import { stageOrder } from "./types";
import type { FieldId, FoodId, Stage } from "./types";

const DAY = 24 * 60 * MINUTE;

// The same rule as `isAdultMode` in hud.ts, which this file cannot import: hud.ts reads combat/fight.ts, and a won fight is counted here.
const adultOn = (save: Save): boolean => save.settings.adultMode === true;

const stageIndex = (c: Creature): number => stageOrder.indexOf(getForm(c.formId).stage);
const opensAt = (c: Creature, minStage: Stage): boolean => stageIndex(c) >= stageOrder.indexOf(minStage);

// What the creature's stage can gather: the materials its open spots drop (a won fight drops the same ones).
function gatherable(c: Creature): Set<MaterialId> {
  return new Set(spotIds.filter((id) => opensAt(c, spots[id].minStage)).map((id) => spots[id].material));
}

// An item the creature can pay for: each material in its price is in the bag, or can be gathered at its stage (coins can always be earned).
function payable(save: Save, c: Creature, id: ItemId): boolean {
  const gather = gatherable(c);
  return materialIds.every((m) => {
    const need = items[id].price.materials[m] ?? 0;
    return need === 0 || (save.inventory[m] ?? 0) >= need || gather.has(m);
  });
}

// Whether the creature can do what the request asks, now. (A saved board can name something it cannot, and so can the board of the last creature.)
export function fits(save: Save, c: Creature, r: Request): boolean {
  switch (r.type) {
    case "feed":
      return menuOf(c).includes(r.target as FoodId);
    case "field":
      return true;
    case "job":
      return opensAt(c, spots[r.target as SpotId].minStage);
    case "fight":
      return opensAt(c, combatTuning.minStage);
    case "buy":
      return save.owned.includes(r.target as string) || payable(save, c, r.target as ItemId);
  }
}

// What a request of this type could name right now: the creature can do it, no open request of the same type names it, and (a buy) the item is not owned,
// not carried by an open request as its reward, and one the creature can pay for.
export function targetsFor(save: Save, c: Creature, type: RequestType): Array<string | null> {
  const { open } = save.board;
  const named = new Set(open.filter((r) => r.type === type).map((r) => r.target));
  const carried = new Set(open.map((r) => r.item));
  let pool: Array<string | null>;
  switch (type) {
    case "feed":
      pool = menuOf(c).filter((food) => food !== "treat"); // (two treats make it sick)
      break;
    case "field":
      pool = [...openFieldIds];
      break;
    case "job":
      pool = spotIds.filter((id) => opensAt(c, spots[id].minStage));
      break;
    case "fight":
      pool = opensAt(c, combatTuning.minStage) ? [null] : [];
      break;
    case "buy":
      pool = itemIds.filter((id) => !save.owned.includes(id) && !carried.has(id) && payable(save, c, id));
      break;
  }
  return pool.filter((target) => !named.has(target));
}

// Draws one request into the board, or says there was nothing to draw (false). The draw has a generator of its own, seeded from the simulation's
// (`live`, read and never advanced) and the number of draws so far, so it takes nothing from the game's random numbers: a profile with the board off
// plays as it always did, and the same save and time give the same board however the minutes were split.
function deal(save: Save, c: Creature, live: number, t: number): boolean {
  const { board } = save;
  const options = requestTypes.map((type) => ({ type, targets: targetsFor(save, c, type) })).filter((o) => o.targets.length > 0);
  if (options.length === 0) return false;
  const rng = makeRng((live ^ Math.imul(board.drawn + 1, 0x9e3779b1)) >>> 0);
  const { type, targets } = rng.pick(options);
  const target = rng.pick(targets);
  let item: string | null = null;
  if (board.drawn % requestTuning.itemEvery === requestTuning.itemEvery - 1) {
    // The item is one the player does not own and no open buy request names, so a reward never finishes a purchase request for nothing.
    const named = new Set([...board.open.filter((r) => r.type === "buy").map((r) => r.target), type === "buy" ? target : null]);
    // (a room is never a gift: it is worth days of coins)
    const pool = itemIds.filter((id) => items[id].kind !== "room" && !save.owned.includes(id) && !named.has(id));
    if (pool.length > 0) item = rng.pick(pool);
  }
  board.open.push({ id: board.drawn, type, target, have: 0, item, drewAt: t });
  board.drawn += 1;
  return true;
}

// ---- counting (the actions and the simulation call this when the thing happens) ----

export type RequestEvent = { kind: "feed"; food: string } | { kind: "field"; field: string } | { kind: "job"; spot: string } | { kind: "fight" };

// One meal of a food, one minute at a field, one finished job, or one won fight. It counts for each open request of that type and target (and for
// nothing else), and a request that reaches what it needs is paid at once.
export function noteRequest(save: Save, event: RequestEvent, t: number): void {
  if (!adultOn(save)) return;
  const target = event.kind === "feed" ? event.food : event.kind === "field" ? event.field : event.kind === "job" ? event.spot : null;
  for (const r of [...save.board.open]) {
    if (r.type !== event.kind || r.target !== target) continue;
    r.have = Math.min(requestTuning.need[r.type], r.have + 1);
    if (r.have >= requestTuning.need[r.type]) complete(save, r, t);
  }
}

// A purchase counts once it can no longer be undone: the item is owned and is not the purchase still inside its undo window. A purchase dated after
// `t` (the clock was set back) does not count until the clock has passed its window, so the window cannot reopen on one that was counted.
export function purchaseCounted(save: Save, id: string, t: number): boolean {
  if (!save.owned.includes(id)) return false;
  const last = save.lastBuy;
  return last === null || last.item !== id || t - last.at > tuning.shop.undoSeconds * 1000;
}

// The oldest open request (the lower id when two are as old), if it has been open for the stale days or more: it pays a quarter more.
export function staleRequest(board: Board, t: number): Request | null {
  const oldest = [...board.open].sort((a, b) => a.drewAt - b.drewAt || a.id - b.id)[0];
  return oldest !== undefined && t - oldest.drewAt >= requestTuning.staleDays * DAY ? oldest : null;
}

// What a request pays if it is done at `t`: its coins, and a quarter more (rounded up) for the stale one.
export function coinsFor(board: Board, r: Request, t: number): number {
  const base = requestTuning.coins[r.type];
  return staleRequest(board, t) === r ? Math.ceil(base * (1 + requestTuning.staleBonus)) : base;
}

// Pay a finished request: its coins, and its item if the player still does not own it; its slot waits to be drawn again.
function complete(save: Save, r: Request, t: number): void {
  const { board } = save;
  const coins = coinsFor(board, r, t);
  save.coins += coins;
  let item: string | null = null;
  if (r.item !== null && !save.owned.includes(r.item)) {
    save.owned.push(r.item); // (owned, not hung: a wallpaper stays off the wall until the player chooses it)
    item = r.item;
  }
  board.open = board.open.filter((open) => open !== r);
  board.waits.push({ doneAt: t, coins, item });
  board.done += 1;
  logEvent(save, t, `Request done: ${requestWords(r)}, ${coins} ${coins === 1 ? "coin" : "coins"}${item !== null ? ` and ${items[item as ItemId].name}` : ""}`);
}

// ---- the simulation (called once for every simulated minute) ----

// One minute of the board, while Adult Mode is on and a creature is alive: a minute at a field is counted, a purchase that can no longer be undone is
// paid, a request the creature cannot do is dropped, a waiting slot that has waited long enough is freed, and every missing slot is drawn. `rng` is the
// simulation's: it is read for the seed and never advanced. `t` is the end of the minute.
export function stepRequests(save: Save, rng: Rng, t: number): void {
  const c = save.creature;
  if (!adultOn(save) || save.phase !== "alive" || !c) return;
  const { board } = save;
  // A clock set back leaves times in the future: bring them back, so a refill is never more than 15 minutes away and an age is never negative.
  for (const r of board.open) r.drewAt = Math.min(r.drewAt, t);
  for (const w of board.waits) w.doneAt = Math.min(w.doneAt, t);
  if (c.place !== "home" && c.sleep === null && !c.job) noteRequest(save, { kind: "field", field: c.place }, t);
  for (const r of [...board.open]) if (r.type === "buy" && purchaseCounted(save, r.target as string, t)) complete(save, r, t);
  board.open = board.open.filter((r) => fits(save, c, r));
  board.waits = board.waits.filter((w) => t < w.doneAt + requestTuning.refillMinutes * MINUTE);
  while (board.open.length + board.waits.length < requestTuning.slots) if (!deal(save, c, rng.state(), t)) break;
}

// ---- words (the card and the log) ----

const needOf = (r: Request): number => requestTuning.need[r.type];

// "Feed Meat ×2", "20 minutes in the Land field", "Finish a job at Bug meadow", "Win a fight", "Buy Comfy Bed".
export function requestWords(r: Request): string {
  switch (r.type) {
    case "feed":
      return `Feed ${foods[r.target as FoodId].name} ×${needOf(r)}`;
    case "field":
      return `${needOf(r)} minutes in the ${fields[r.target as FieldId].name} field`;
    case "job":
      return `Finish a job at ${spots[r.target as SpotId].name}`;
    case "fight":
      return "Win a fight";
    case "buy":
      return `Buy ${items[r.target as ItemId].name}`;
  }
}

// "1 of 2 meals": the exact numbers under the picture.
export function requestProgress(r: Request): string {
  const unit = { feed: "meals", field: "minutes", job: "job", fight: "win", buy: "purchase" }[r.type];
  return `${Math.floor(r.have)} of ${needOf(r)} ${unit}`;
}

// The note over the room for `count` requests that were just paid (the newest waits say what they paid): "Request done: +3 coins and Stew".
export function paidNote(waits: Wait[], count: number): string {
  const head = count === 1 ? "Request done" : `${count} requests done`;
  // A finished slot is dropped 15 minutes after it was paid, so after a long catch-up some of what was paid is gone: the note says that it was paid
  // and states no amount, rather than an amount that is too small.
  if (waits.length < count) return head;
  const paid = waits.slice(-count);
  const coins = paid.reduce((sum, w) => sum + w.coins, 0);
  const gifts = paid.flatMap((w) => (w.item === null ? [] : [items[w.item as ItemId].name]));
  return `${head}: +${coins} ${coins === 1 ? "coin" : "coins"}${gifts.length > 0 ? ` and ${gifts.join(", ")}` : ""}`;
}

// Whole minutes until the slot of a finished request is drawn again (at least 1 while it waits).
export function minutesToNext(doneAt: number, now: number): number {
  return Math.max(1, Math.ceil((Math.min(doneAt, now) + requestTuning.refillMinutes * MINUTE - now) / MINUTE));
}
