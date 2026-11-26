// What the adult HUD says (ui/AdultHud.tsx), worked out here with no screen code so tests can check every line.
// Every number comes from the code that runs the game: the drain from care.ts, the stage length from growth.ts, the refusal line from tuning.ts.
// (docs/adult-a1-plan.md has the rules and the edge cases.)

import { spots } from "../data/habitat";
import { bookTotal } from "../data/book";
import { combatTuning } from "../data/combat";
import { getForm } from "../data/forms";
import { specialId } from "../data/special";
import { tuning } from "../data/tuning";
import { bondInfo, bondOf, nextUnlock } from "./bond";
import { statChangePerMinute } from "./care";
import type { DrainStat } from "./care";
import { sulkChance } from "./combat/battle";
import type { Owned } from "./perks";
import { rungOf } from "./combat/fight";
import { stageHours } from "./growth";
import { clamp } from "./state";
import type { CallKind, Creature, Save } from "./state";
import { MINUTE, hourOf, isNightHour } from "./time";

export type HudStat = DrainStat | "wellness";
export const hudStats: HudStat[] = ["hunger", "happiness", "energy", "hygiene", "wellness"];

// Adult Mode is on only when the saved setting is exactly `true` (a missing field, or any other value, is off).
export const isAdultMode = (save: Save): boolean => save.settings.adultMode === true;

export type HudScreen = "room" | "habitat" | "arena";

// ---- how times and numbers are written ----

// A short span for "empty in": "<1m", "45m", "9h 20m", "14h", ">99h". Whole minutes, rounded down.
export function formatSpan(minutes: number): string {
  if (minutes === Infinity) return ">99h";
  if (!Number.isFinite(minutes) || minutes < 1) return "<1m";
  const total = Math.floor(minutes);
  if (total < 60) return `${total}m`;
  const hours = Math.floor(total / 60);
  if (hours >= 100) return ">99h";
  if (hours >= 10) return `${hours}h`;
  const rest = total % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

// The same without the minutes once it is an hour or more, for a narrow cell: "<1m", "45m", "9h", ">99h".
export function formatSpanShort(minutes: number): string {
  const text = formatSpan(minutes);
  return text.includes(" ") ? text.slice(0, text.indexOf("h") + 1) : text;
}

// Hours and minutes as a clock face, for a stage timer: "11:24". Never negative; whole minutes, rounded down.
export function formatHm(minutes: number): string {
  const total = Number.isFinite(minutes) ? Math.max(0, Math.floor(minutes)) : 0;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// Minutes and seconds, for a job that is nearly done: "2:31".
export function formatMmSs(ms: number): string {
  const total = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export const hourLabel = (h: number): string => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "am" : "pm"}`;

// The clock in the strip, in game time: "7:05 pm".
export function clockText(nowMs: number): string {
  const h = hourOf(nowMs);
  const mm = String(new Date(nowMs).getMinutes()).padStart(2, "0");
  return `${h % 12 === 0 ? 12 : h % 12}:${mm} ${h < 12 ? "am" : "pm"}`;
}

// ---- the stat cells ----

// The number the bar shows. Rounded DOWN: every rule compares the exact value with a whole number (food is refused at 95 or more, a call
// starts below 25), and `x < N` is the same as `floor(x) < N` for a whole N, so the number on the screen and the rule always agree.
export const shownValue = (value: number): number => Math.floor(Math.min(100, Math.max(0, value)));

export type Level = "good" | "amber" | "red";

// Amber below 30, red below 15, on the number that is shown.
export function statLevel(value: number): Level {
  const shown = shownValue(value);
  return shown < 15 ? "red" : shown < 30 ? "amber" : "good";
}

// Which cell the "!" goes on for the creature's call. Only one call exists at a time.
export const callCell: Record<CallKind, HudStat> = {
  hungry: "hunger",
  sad: "happiness",
  dirty: "hygiene",
  sick: "wellness",
  sleepy: "energy",
};

export interface Span {
  toward: "empty" | "full";
  minutes: number; // whole minutes until it reaches 0 (or 100)
}

// Whole minutes until `done` is true, taking a step of `change` each minute and holding the value between 0 and 100 exactly as decayStats
// does. Counting with the same arithmetic (not dividing) keeps the answer equal to what the simulation will do, even at a round number
// where a division and repeated subtraction part by a rounding error. The cap only guards against a rate of nearly nothing.
function minutesUntil(value: number, change: number, done: (v: number) => boolean): number {
  let v = value;
  let minutes = 0;
  while (!done(v) && minutes < 20_000) {
    v = clamp(v + change);
    minutes += 1;
  }
  return minutes;
}

// How long until a stat runs out (or, for energy while asleep, fills up) at the rate it has right now. It ignores that night is coming and
// that a nap ends by itself. Null for wellness, which has no steady rate.
export function timeToEmpty(c: Creature, stat: HudStat, asleep: boolean, owned: Owned = []): Span | null {
  if (stat === "wellness") return null;
  const change = statChangePerMinute(c, stat, asleep, owned);
  const value = c.stats[stat];
  if (change < 0) return { toward: "empty", minutes: minutesUntil(value, change, (v) => v <= 0) };
  if (change > 0) return { toward: "full", minutes: minutesUntil(value, change, (v) => v >= 100) };
  return null;
}

// "9h left", "full in 2h", "empty", "full" (the narrow text under a cell), or null when there is none to give.
export function cellSpan(c: Creature, stat: HudStat, asleep: boolean, owned: Owned = []): string | null {
  const span = timeToEmpty(c, stat, asleep, owned);
  if (!span) return null;
  const value = c.stats[stat];
  if (span.toward === "empty") return value <= 0 ? "empty" : `${formatSpanShort(span.minutes)} left`;
  return value >= 100 ? "full" : `full in ${formatSpanShort(span.minutes)}`;
}

// Whole minutes until hunger is below the line where it refuses food (0 when it would eat now), at the rate it has right now.
export function minutesUntilItEats(c: Creature, asleep: boolean, owned: Owned = []): number {
  return minutesUntil(c.stats.hunger, statChangePerMinute(c, "hunger", asleep, owned), (v) => v < tuning.fullAtHunger);
}

// What wellness is doing this minute, from the same conditions updateWellness (care.ts) tests: sick, or an empty stat draining it, or
// everything fine and it recovering, or neither.
export type WellnessState = "sick" | "falling" | "rising" | "steady";

export function wellnessState(c: Creature): WellnessState {
  const s = c.stats;
  const w = tuning.wellness;
  if (c.sick) return "sick";
  if (s.hunger <= 0 || s.hygiene <= 0 || s.energy <= 0) return "falling";
  if (s.hunger > w.healthyHungerAbove && s.hygiene > w.healthyHygieneAbove && s.wellness < 100) return "rising";
  return "steady";
}

const callBelow: Record<DrainStat, number> = {
  hunger: tuning.calls.hungryBelow,
  happiness: tuning.calls.sadBelow,
  hygiene: tuning.calls.dirtyHygieneBelow,
  energy: tuning.calls.sleepyBelow,
};

// A change per minute as a change per hour, one decimal at most: 0.0714 a minute is "4.3".
const perHour = (change: number): string => String(Math.round(Math.abs(change) * 60 * 10) / 10);

// The lines on a stat's detail card (a tap on its cell). Every number comes from the code that runs the game.
export function detailLines(c: Creature, stat: HudStat, asleep: boolean, owned: Owned = []): string[] {
  const lines: string[] = [];
  if (stat === "wellness") {
    const w = tuning.wellness;
    const state = wellnessState(c);
    if (state === "sick") lines.push("Sick: wellness keeps falling until it gets medicine.");
    else if (state === "falling") lines.push("Falling: a stat at 0 is draining it.");
    else if (state === "rising") lines.push(`Recovering ${perHour(w.regen)} an hour while food and cleanliness stay above ${w.healthyHungerAbove}.`);
    else if (c.stats.wellness >= 100) lines.push("Full.");
    else lines.push(`Holding. It recovers only while food and cleanliness are above ${w.healthyHungerAbove}.`);
    if (!c.sick) lines.push(`Below ${w.sickBelow} it gets sick.`);
  } else {
    const awake = statChangePerMinute(c, stat, false, owned);
    const sleeping = statChangePerMinute(c, stat, true, owned);
    lines.push(
      stat === "energy"
        ? `Falls ${perHour(awake)} an hour awake and rises ${perHour(sleeping)} an hour asleep.`
        : `Falls ${perHour(awake)} an hour awake and ${perHour(sleeping)} an hour asleep.`,
    );
    if (stat === "hygiene" && c.poop > 0) {
      lines.push(`Poop on the floor: ${c.poop}. Each one makes it fall ${perHour(tuning.poopHygieneDrainPerMinute)} an hour faster awake.`);
    }
    const span = timeToEmpty(c, stat, asleep, owned);
    if (span) {
      if (span.toward === "empty") lines.push(c.stats[stat] <= 0 ? "Empty now." : `Empty in ${formatSpan(span.minutes)} at this rate.`);
      else lines.push(c.stats[stat] >= 100 ? "Full." : `Full in ${formatSpan(span.minutes)} at this rate.`);
    }
    if (stat === "hunger") {
      const eats = minutesUntilItEats(c, asleep, owned);
      lines.push(
        eats > 0
          ? `It refuses food at ${tuning.fullAtHunger} or more, and eats again in about ${formatSpan(eats)}.`
          : `It refuses food at ${tuning.fullAtHunger} or more.`,
      );
    }
    lines.push(
      stat === "hygiene"
        ? `It calls below ${callBelow[stat]}, or with ${tuning.calls.dirtyPoopAtLeast} or more poop.`
        : `It calls for attention below ${callBelow[stat]}.`,
    );
  }
  const chance = sulkChance(c.stats.discipline);
  const sulk = Math.round(chance * 100);
  lines.push(
    chance <= 0
      ? `Discipline ${shownValue(c.stats.discipline)}: in a fight it follows every command.`
      : `Discipline ${shownValue(c.stats.discipline)}: in a fight it ignores a command in ${sulk > 0 ? `${sulk}%` : "under 1%"} of rounds.`,
  );
  return lines;
}

// ---- the strip ----

export function stageLabel(c: Creature): string {
  if (c.formId === specialId) return "Special"; // a kid by size, but it grows no further
  const stage = getForm(c.formId).stage;
  return stage[0]!.toUpperCase() + stage.slice(1);
}

// ---- Bond (game/bond.ts, docs/adult-a3-plan.md section 4) ----

// What a screen reader says for the Bond chip: the level and what is left to the next one.
export function bondLabel(c: Creature): string {
  const { level, into, span, next } = bondInfo(bondOf(c).xp);
  return next === null ? `Bond level ${level}, the top level` : `Bond level ${level}, ${into} of ${span} to level ${next}`;
}

// How far through its level the Bond is, 0 to 100 (the top level is full).
export function bondPercent(c: Creature): number {
  const { into, span, next } = bondInfo(bondOf(c).xp);
  return next === null ? 100 : Math.floor((100 * into) / span);
}

// The lines of the card the chip opens: where it stands, the next thing a level gives that the game really has, and what each way of touching does.
export function bondLines(c: Creature): string[] {
  const { level, into, span, next } = bondInfo(bondOf(c).xp);
  const lines = [`Bond level ${level} of ${tuning.bond.levelAt.length}.`, next === null ? "The top level." : `${into} of ${span} to level ${next}.`];
  const unlock = nextUnlock(level);
  if (unlock) lines.push(`Level ${unlock.level}: ${unlock.text}.`);
  lines.push("Hold to pet, or tap three times to tickle: both build Bond.", "Poke: gets attention.");
  return lines;
}

export const bookPercent = (save: Save): number => Math.min(100, Math.floor((100 * save.book.length) / bookTotal()));

// ---- the context line ----

// The first moment after now at which the night is over, found the way the simulation finds it (the hour on the local clock, minute by
// minute), so a daylight saving change cannot make the two disagree. Null when it is not night now, or there is no night (start hour equal to end).
export function nextWake(nowMs: number, startHour: number, endHour: number): number | null {
  if (startHour === endHour || !isNightHour(hourOf(nowMs), startHour, endHour)) return null;
  const first = Math.floor(nowMs / MINUTE) * MINUTE;
  for (let i = 1; i <= 25 * 60; i++) {
    const t = first + i * MINUTE;
    if (!isNightHour(hourOf(t), startHour, endHour)) return t;
  }
  return null;
}

export const callText: Record<CallKind, string> = {
  hungry: "Hungry",
  sad: "Sad",
  dirty: "Needs cleaning",
  sick: "Sick",
  sleepy: "Sleepy",
};

// How long until the stage is over at the latest, as a clock face. A baby can grow up sooner (the first field with 4 cells), so for it
// the time is a limit. The countdown never reads more than the stage's length or less than nothing (an old gap: a device clock set back
// leaves the stage's start in the future, see known-issues.md).
export function stageTail(c: Creature, nowMs: number): string {
  if (c.formId === specialId) return "Grows no further";
  const hours = stageHours(c);
  if (hours === null) return "Final form";
  const left = Math.min(hours * 60, Math.max(0, hours * 60 - (nowMs - c.stageStartedAt) / MINUTE));
  if (Math.floor(left) <= 0) return "Ready to grow up";
  return getForm(c.formId).stage === "baby" ? `Grows up within ${formatHm(left)}` : `Grows up in ${formatHm(left)}`;
}

// What a fight on the arena screen knows (the fight is not in the save, it lives in ui/game.ts).
export interface FightInfo {
  foeName: string;
  rung: number;
}

// The pieces of the context line that the reasons for a refused button (reasons.ts) say too, so the two cannot word the same fact differently.

// When an away creature is back: "back in 2:31", or "back any moment" once the time is up.
export function backText(job: NonNullable<Creature["job"]>, nowMs: number): string {
  const left = job.endsAt - nowMs;
  return left > 0 ? `back in ${formatMmSs(left)}` : "back any moment";
}

// When a night sleep ends: "wakes 7 am (in 2:14)". Null when there is no night (the start hour equals the end hour), which a saved game can only be given by hand.
export function wakeText(save: Save, nowMs: number): string | null {
  const wake = nextWake(nowMs, save.settings.sleepStartHour, save.settings.sleepEndHour);
  return wake === null ? null : `wakes ${hourLabel(hourOf(wake))} (in ${formatHm(Math.ceil((wake - nowMs) / MINUTE))})`;
}

// When a nap ends: "wakes when rested (energy 41 of 100)".
export const napText = (c: Creature): string => `wakes when rested (energy ${shownValue(c.stats.energy)} of 100)`;

// The one line under the stats. The most time-sensitive fact for the screen it is on. Which fact wins: dead, egg, away on a job, asleep,
// then what the screen is for.
export function contextLine(save: Save, nowMs: number, screen: HudScreen, fight: FightInfo | null): string {
  if (save.phase === "dead") return "Passed away";
  if (save.phase === "egg") {
    const egg = save.egg;
    if (!egg) return "Egg";
    const left = tuning.egg.minutes - ((nowMs - egg.startedAt) / MINUTE + egg.shavedMinutes);
    return Math.floor(left) <= 0 ? "Egg · hatching now" : `Egg · hatches in ${formatSpan(left)}`;
  }
  const c = save.creature;
  if (!c) return "";

  if (c.job) return `Away at ${spots[c.job.spot].name} · ${backText(c.job, nowMs)}`;
  if (c.sleep === "night") {
    const wake = wakeText(save, nowMs);
    return wake === null ? "Asleep" : `Asleep · ${wake}`;
  }
  if (c.sleep === "nap") return `Napping · ${napText(c)}`;

  if (screen === "arena") {
    const rung = fight ? fight.rung : rungOf(c);
    return `Arena · rung ${rung} of ${combatTuning.ladder.length}${fight ? ` · vs ${fight.foeName}` : ""}`;
  }
  if (screen === "habitat") {
    const hauls = save.hauls.length;
    return hauls > 0 ? `Habitat · ${hauls} ${hauls === 1 ? "haul" : "hauls"} to collect` : "Habitat · pick a place to send it to work";
  }
  const head = c.call ? callText[c.call] : `Awake${save.settings.sleepStartHour === save.settings.sleepEndHour ? "" : ` · sleeps at ${hourLabel(save.settings.sleepStartHour)}`}`;
  return `${head} · ${stageTail(c, nowMs)}`;
}
