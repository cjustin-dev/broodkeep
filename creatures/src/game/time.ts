// Time helpers. All game times are milliseconds since 1970 (like Date.now()).
// "Game time" is real time plus clockOffsetMs. The offset is how dev mode skips ahead.

import type { Save } from "./state";

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;

export function gameNow(save: Save, realNowMs: number): number {
  return realNowMs + save.clockOffsetMs;
}

// Hour of day (0 to 23) on the player's own clock.
export function hourOf(ms: number): number {
  return new Date(ms).getHours();
}

// True if this hour is inside the sleeping hours. The range may wrap past midnight (20 to 7).
export function isNightHour(hour: number, startHour: number, endHour: number): boolean {
  if (startHour === endHour) return false;
  return startHour < endHour ? hour >= startHour && hour < endHour : hour >= startHour || hour < endHour;
}
