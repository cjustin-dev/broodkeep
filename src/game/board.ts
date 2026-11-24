// The shape of the request board in the save (docs/adult-a2-plan.md section 11) and how a saved one is read back. The rules that run it are in
// requests.ts; this file only holds the data and keeps a bad one out (a saved game can come from storage or the account, so nothing in it is trusted).
// It imports no game rules, so state.ts can use it.

import { openFieldIds } from "../data/fields";
import { foods } from "../data/foods";
import { spots } from "../data/habitat";
import { requestTuning, requestTypes } from "../data/requests";
import type { RequestType } from "../data/requests";
import { isItemId } from "../data/shop";
import type { FieldId } from "./types";

// One open request. What it needs and what it pays come from data/requests.ts by `type`, so they are not saved.
export interface Request {
  id: number; // the number of the draw it was dealt in (0 for the first request ever drawn)
  type: RequestType;
  target: string | null; // a food id (feed), a field id (field), a spot id (job), an item id (buy); null for a fight
  have: number; // counted since it was drawn, 0 up to what the type needs
  item: string | null; // the item it also pays, chosen when it was drawn; null for none
  drewAt: number; // game time it was drawn: only for the bonus after 3 days, never for expiry
}

// The slot of a finished request, until the next one is drawn for it. `coins` and `item` are what it paid, for the card only.
export interface Wait {
  doneAt: number;
  coins: number;
  item: string | null;
}

export interface Board {
  open: Request[]; // oldest first
  waits: Wait[]; // oldest first
  drawn: number; // how many requests have ever been drawn: the item rhythm and the seed of the next draw
  done: number; // how many have ever been paid: the note over the room compares it
}

export const freshBoard = (): Board => ({ open: [], waits: [], drawn: 0, done: 0 });

// Whether `target` is something a request of this type can name. Own-key checks: "constructor" is not an id. A feed is never the treat (two of them
// make the creature sick), and a field must be one the creature can be taken to.
export function targetOk(type: RequestType, target: unknown): boolean {
  switch (type) {
    case "feed":
      return typeof target === "string" && Object.hasOwn(foods, target) && target !== "treat";
    case "field":
      return typeof target === "string" && openFieldIds.includes(target as FieldId);
    case "job":
      return typeof target === "string" && Object.hasOwn(spots, target);
    case "buy":
      return isItemId(target);
    case "fight":
      return target === null;
  }
}

const isWhole = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const isItemOrNone = (value: unknown): value is string | null => value === null || isItemId(value);

function readRequest(value: unknown): Request | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Partial<Request>;
  if (typeof v.type !== "string" || !(requestTypes as string[]).includes(v.type)) return null;
  const type = v.type as RequestType;
  if (!isWhole(v.id) || !targetOk(type, v.target) || !isItemOrNone(v.item)) return null;
  if (typeof v.have !== "number" || !Number.isFinite(v.have) || typeof v.drewAt !== "number" || !Number.isFinite(v.drewAt)) return null;
  return { id: v.id, type, target: v.target as string | null, have: Math.min(requestTuning.need[type], Math.max(0, v.have)), item: v.item, drewAt: v.drewAt };
}

function readWait(value: unknown): Wait | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Partial<Wait>;
  if (typeof v.doneAt !== "number" || !Number.isFinite(v.doneAt) || typeof v.coins !== "number" || !Number.isFinite(v.coins) || !isItemOrNone(v.item))
    return null;
  return { doneAt: v.doneAt, coins: Math.min(requestTuning.paidMax, Math.max(0, Math.round(v.coins))), item: v.item };
}

// A board read from storage or the account: a save from before the board has none (an empty one), a bad entry is dropped, and the slots never
// exceed the limit (open requests first). It must never throw: it runs for every profile at the picker.
export function migrateBoard(value: unknown): Board {
  const v = typeof value === "object" && value !== null ? (value as Partial<Board>) : {};
  // Two open requests for one type and target would both be paid by one meal, and two with one id would share a card: the later one goes.
  const ids = new Set<number>();
  const asked = new Set<string>();
  const open = (Array.isArray(v.open) ? v.open : [])
    .map(readRequest)
    .filter((r): r is Request => r !== null)
    .filter((r) => {
      const key = `${r.type}:${r.target}`;
      if (ids.has(r.id) || asked.has(key)) return false;
      ids.add(r.id);
      asked.add(key);
      return true;
    })
    .slice(0, requestTuning.slots);
  const waits = (Array.isArray(v.waits) ? v.waits : [])
    .map(readWait)
    .filter((w): w is Wait => w !== null)
    .slice(0, requestTuning.slots - open.length);
  // The next draw takes the number after the highest on the board, so a bad or low count never gives an open request's id to a new one.
  const drawn = Math.max(isWhole(v.drawn) ? v.drawn : 0, ...open.map((r) => r.id + 1));
  return { open, waits, drawn, done: isWhole(v.done) ? v.done : 0 };
}
