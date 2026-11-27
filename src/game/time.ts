// Time helpers. All game times are milliseconds since 1970 (like Date.now()).
// "Game time" is real time plus clockOffsetMs. The offset is how dev mode skips ahead.

import type { Save } from "./state";

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;

export function gameNow(save: Save, realNowMs: number): number {
  return realNowMs + save.clockOffsetMs;
}

// The calendar day of a moment on the player's own clock, as a whole number of days (so two moments on the same local day give the same number, and a daylight saving change cannot make
// a day 23 or 25 hours: the day's own year, month and date are counted, not hours).
export function localDay(ms: number): number {
  const d = new Date(ms);
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
}

// A moment of game time on the real clock: game time less the dev offset (always 0 outside dev mode). Bedtime, the clock in the header and the light in the pictures follow this,
// so speeding the game up never moves them. Elapsed time, timers and the day counts stay on game time.
export function realClock(save: Save, gameMs: number): number {
  return gameMs - save.clockOffsetMs;
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
