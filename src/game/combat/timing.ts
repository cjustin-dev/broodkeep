// Timed combat: how a tap on the shrinking ring is graded, and the words for it (docs/adult-a4-plan.md section 10). Pure rules, no screen.
// The windows are the Rhythm Grove's (timingWindows in data/rhythm.ts), so a Perfect means the same in both.

import { timingWindows } from "../../data/rhythm";
import type { BattleAction } from "./battle";

export type Timing = "perfect" | "good" | "normal";

// Grade a tap `offsetMs` after the instant the ring meets its target (negative is early). Anything that is not a number counts as a miss.
export function gradeTap(offsetMs: number): Timing {
  const distance = Math.abs(offsetMs);
  if (distance <= timingWindows.perfectMs) return "perfect";
  if (distance <= timingWindows.goodMs) return "good";
  return "normal";
}

// The one line said over the room after a round: "Perfect attack", "Good guard", or "Early" and "Late" for a tap outside the Good window. `offsetMs` is
// null when nobody tapped (the pad closed by itself): nothing is said. A Perfect guard is only a Perfect when it parried a blow.
export function timingWord(action: BattleAction, grade: Timing, offsetMs: number | null, parried: boolean): string | null {
  if (grade === "perfect") return action === "guard" && !parried ? null : `Perfect ${action}`;
  if (grade === "good") return `Good ${action}`;
  if (offsetMs === null || !Number.isFinite(offsetMs)) return null;
  return offsetMs < 0 ? "Early" : "Late";
}
