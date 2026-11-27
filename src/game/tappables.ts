// Field tappables, the rules (docs/adult-a3-plan.md section 17). Pure: nothing here reads the clock or a random source of its own. A draw takes the visit's generator (`Rng`, game/rng.ts) and
// a time is a number of milliseconds on the game's field clock, so a test can force every case. The state that holds a visit is `Game.tapVisit` and `Game.tappables` (ui/game.ts), never saved.

import { materialIds } from "../data/habitat";
import type { MaterialId } from "../data/habitat";
import { pickups, tapKinds, tapTuning as t } from "../data/tappables";
import type { TapKind } from "../data/tappables";
import { drawGift, payBond, payGift } from "./initiatives";
import type { Rng } from "./rng";
import { logEvent } from "./state";
import type { Creature, Save } from "./state";
import type { FieldId } from "./types";

export interface Tappable {
  id: number;
  kind: TapKind;
  x: number; // the picture's top left corner, in game pixels
  y: number;
  born: number; // the field clock when it appeared
}

// One stay in one field. Ends when the creature leaves it (see `Game.stepTappables`).
export interface Visit {
  bornAt: number; // the creature it is for
  place: FieldId;
  rng: Rng; // every draw of the visit, from one seed
  made: number; // tappables made so far
  pickupMade: boolean; // the visit's one pickup is out (or was)
  nextId: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

// The wait to the next spawn, 20,000 to 40,000 ms (both ends reachable).
export const nextWait = (rng: Rng): number => rng.int(t.delayMs[0], t.delayMs[1]);

// The kinds that can be made now: a bug only for a creature that could play Bug Catch (no session open, not asleep, sick, too young) and with none already out; the pickup once a visit.
export function possibleKinds(visit: Visit, tappables: readonly Tappable[], canTrain: boolean): Record<TapKind, boolean> {
  return { sparkle: true, rustle: true, bug: canTrain && !tappables.some((p) => p.kind === "bug"), pickup: !visit.pickupMade };
}

// The kind to make. The draw walks sparkle, rustle, bug, pickup: `r x total` is taken down by each weight and the first kind it falls inside is the one (strictly inside, so a kind with weight 0 is
// never taken). A kind that is not possible weighs 0 for this draw. Sparkle and rustle are always possible, so the total is never 0.
export function pickKind(can: Record<TapKind, boolean>, rng: Rng): TapKind {
  const weights = tapKinds.map((kind) => (can[kind] ? t.weights[kind] : 0));
  const total = weights.reduce((sum, w) => sum + w, 0);
  let left = rng.next() * total;
  for (const [i, kind] of tapKinds.entries()) {
    const w = weights[i] as number;
    if (w > 0 && left < w) return kind;
    left -= w;
  }
  return tapKinds.find((_, i) => (weights[i] as number) > 0) as TapKind; // (only reached when rounding left `left` at the very end)
}

// The picture's box.
export const boxOf = (p: { x: number; y: number }): Box => ({ x: p.x, y: p.y, w: t.size, h: t.size });

const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// Where a new tappable goes: up to `tries` draws (x, then y) inside the ground band, the first that keeps clear of the creature (its box widened by the hit pad) and 2 pixels from every other
// tappable. Null when every try was in the way (the spawn waits for the next step).
export function place(rng: Rng, creature: Box, others: readonly Tappable[]): { x: number; y: number } | null {
  const wide: Box = { x: creature.x - t.pad, y: creature.y - t.pad, w: creature.w + 2 * t.pad, h: creature.h + 2 * t.pad };
  for (let k = 0; k < t.tries; k++) {
    const x = rng.int(t.band.xMin, t.band.xMax);
    const y = rng.int(t.band.yMin, t.band.yMax);
    const box = boxOf({ x, y });
    if (overlaps(box, wide)) continue;
    const apart = others.every((o) => !overlaps(box, { x: o.x - t.gap, y: o.y - t.gap, w: t.size + 2 * t.gap, h: t.size + 2 * t.gap }));
    if (apart) return { x, y };
  }
  return null;
}

// Whether a point (game pixels) touches a tappable: its picture widened by the hit pad.
export const touches = (p: { x: number; y: number }, x: number, y: number): boolean =>
  x >= p.x - t.pad && x <= p.x + t.size + t.pad && y >= p.y - t.pad && y <= p.y + t.size + t.pad;

// The tappable a touch at (x, y) is for: of those it touches, the one whose middle is nearest (the newest when two are as near). Null for none.
export function tappableAt<T extends { id: number; x: number; y: number }>(tappables: readonly T[], x: number, y: number): T | null {
  let best: T | null = null;
  let bestDistance = Infinity;
  for (const p of tappables) {
    if (!touches(p, x, y)) continue;
    const d = Math.hypot(p.x + t.size / 2 - x, p.y + t.size / 2 - y);
    if (d < bestDistance || (d === bestDistance && best !== null && p.id > best.id)) {
      best = p;
      bestDistance = d;
    }
  }
  return best;
}

// A sparkle's pay: 1 material in 2 (an even draw of the five), otherwise 1 coin. Returns the note.
export function paySparkle(save: Save, rng: Rng, nowMs: number): string {
  const material = rng.chance(t.sparkleMaterialChance);
  const id = material ? (rng.pick([...materialIds]) as MaterialId) : null;
  return payGift(save, id ? { kind: "material", id } : { kind: "coins", amount: 1 }, nowMs);
}

// A rustle: the creature goes to see. In 1 case in 2 it finds something (a gift, drawn as an initiative's gift is), otherwise it is a moment together: Bond XP. Returns the note and what happened.
export function payRustle(save: Save, c: Creature, rng: Rng, nowMs: number): { note: string; found: boolean; level: number | null } {
  if (rng.chance(t.rustleGiftChance)) return { note: payGift(save, drawGift(() => rng.next()), nowMs), found: true, level: null };
  const level = payBond(save, c, t.rustleXp, nowMs);
  return { note: `A moment together: +${t.rustleXp} Bond XP.`, found: false, level };
}

// A field's own pickup: 1 of its material. One line in the log and the note.
export function payPickup(save: Save, field: FieldId, nowMs: number): string {
  const p = pickups[field];
  save.inventory[p.material] = (save.inventory[p.material] ?? 0) + 1;
  const note = `Found ${p.article} ${p.name}.`;
  logEvent(save, nowMs, note.slice(0, -1));
  return note;
}
