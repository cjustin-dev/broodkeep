// Tells a tap, a pan and a pinch apart from the pointers that land on the home's picture (docs/home-plan.md section 3.3). No DOM and no timers: the Stage feeds it
// pointer events (positions in CSS pixels) and acts on what it answers, so every rule is tested on its own (tests/gesture.test.ts).
//
//   one finger that stays within SLOP of where it landed   -> a tap on release (the Stage may also pet it after a hold)
//   one finger that goes past SLOP                         -> a pan: the home follows the finger from where it landed, and a tap or a pet no longer happens
//   a second finger, anywhere on the picture               -> a pinch: the first finger's hold ends at once; a pinch never taps
//   a pinch with one finger lifted                         -> a pan by the finger left, from where it is

import type { Point } from "../art/camera";

export const SLOP = 8; // CSS pixels

export type Action =
  | { type: "pan"; dx: number; dy: number } // the home follows the fingers by (dx, dy) CSS pixels
  | { type: "pinch"; scale: number; center: Point; dx: number; dy: number } // the distance between the fingers changed by `scale`, around `center`; the middle moved by (dx, dy)
  | { type: "end" }; // the last finger of a pan or pinch lifted: settle the zoom on a whole number

type Mode = "none" | "tap" | "pan" | "pinch";

const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
const middle = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export class GestureTracker {
  mode: Mode = "none";
  private down_ = new Map<number, { start: Point; now: Point }>();
  private last: Point = { x: 0, y: 0 }; // the point a pan is measured from
  private pinchD = 0;
  private pinchC: Point = { x: 0, y: 0 };

  // The first two fingers down, which are the ones a pinch is made of.
  private firstTwo(): [{ now: Point }, { now: Point }] {
    const it = this.down_.values();
    return [it.next().value as { now: Point }, it.next().value as { now: Point }];
  }

  get pointers(): number {
    return this.down_.size;
  }

  // A finger landed. Returns true when the Stage must end a hold that is running (a second finger does that at once).
  down(id: number, p: Point): boolean {
    this.down_.set(id, { start: p, now: p });
    if (this.down_.size === 1) {
      this.mode = "tap";
      return false;
    }
    if (this.down_.size === 2) {
      const [a, b] = this.firstTwo();
      this.mode = "pinch";
      this.pinchD = dist(a.now, b.now);
      this.pinchC = middle(a.now, b.now);
      return true;
    }
    return false; // (a third finger changes nothing: the pinch keeps the first two)
  }

  move(id: number, p: Point): Action[] {
    const f = this.down_.get(id);
    if (!f) return [];
    f.now = p;
    if (this.mode === "tap" && dist(f.start, p) > SLOP) {
      this.mode = "pan";
      this.last = f.start; // the first pan step covers the distance from where the finger landed, so the home does not jump behind it
    }
    if (this.mode === "pan" && this.down_.size === 1) {
      const dx = p.x - this.last.x;
      const dy = p.y - this.last.y;
      this.last = p;
      return dx === 0 && dy === 0 ? [] : [{ type: "pan", dx, dy }];
    }
    if (this.mode === "pinch" && this.down_.size >= 2) {
      const [a, b] = this.firstTwo();
      const d = dist(a.now, b.now);
      const c = middle(a.now, b.now);
      const scale = this.pinchD > 0 && d > 0 ? d / this.pinchD : 1;
      const action: Action = { type: "pinch", scale, center: c, dx: c.x - this.pinchC.x, dy: c.y - this.pinchC.y };
      this.pinchD = d;
      this.pinchC = c;
      return scale === 1 && action.dx === 0 && action.dy === 0 ? [] : [action];
    }
    return [];
  }

  // A finger lifted. `tap` is true when it was a single finger that never left SLOP.
  up(id: number, p: Point): { tap: boolean; actions: Action[] } {
    const f = this.down_.get(id);
    if (!f) return { tap: false, actions: [] };
    f.now = p;
    const wasTap = this.mode === "tap" && this.down_.size === 1 && dist(f.start, p) <= SLOP;
    this.down_.delete(id);
    return { tap: wasTap, actions: this.after() };
  }

  // The system took a finger away (a call, a gesture of the browser): the same as lifting it, never a tap.
  cancel(id: number): Action[] {
    if (!this.down_.delete(id)) return [];
    return this.after();
  }

  private after(): Action[] {
    if (this.down_.size === 0) {
      const settle = this.mode === "pan" || this.mode === "pinch";
      this.mode = "none";
      return settle ? [{ type: "end" }] : [];
    }
    if (this.down_.size === 1) {
      // One finger of a pinch is left: it pans, from where it is now.
      const rest = [...this.down_.values()][0] as { start: Point; now: Point };
      this.mode = "pan";
      this.last = rest.now;
    } else {
      // Three or more were down and one lifted: the pinch is now made of the first two of those that are left, so it counts its distance and middle from them.
      const [a, b] = this.firstTwo();
      this.pinchD = dist(a.now, b.now);
      this.pinchC = middle(a.now, b.now);
    }
    return [];
  }
}
