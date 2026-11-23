// The Growth Forecast's numbers (docs/adult-a1-plan.md, section 3b), worked out with no screen code. It is a read model over game/growth.ts:
// the leader is `leadingForm`, a rival's gap is found by adding inputs to a COPY of the creature and asking `leadingForm` again, and the stage
// time, the cells and the tiers come from growth.ts and the tuning numbers. Nothing here writes to a creature or a save.

import { fieldOfForm, fields, openFieldIds, planOf } from "../data/fields";
import { foods } from "../data/foods";
import { getForm } from "../data/forms";
import { specialId } from "../data/special";
import { tuning } from "../data/tuning";
import { statChangePerMinute } from "./care";
import { canBecomeSpecial, fieldCells, foodCells, leadingForm, nextForm, stageHours, tierOf } from "./growth";
import type { Tier } from "./growth";
import { callText, clockText, formatHm } from "./hud";
import type { CallKind, Creature } from "./state";
import { HOUR, MINUTE } from "./time";
import type { FieldId, FoodId } from "./types";

const g = tuning.growth;

export type Stage = "baby" | "kid" | "young" | "adult" | "special";

// The special is a kid by size, but it grows no further, so it is its own stage here.
const stageOf = (c: Creature): Stage => (c.formId === specialId ? "special" : getForm(c.formId).stage);

// ---- inputs, and what a what-if adds ----

// One thing the player can do that the growth rules count.
export type Input = { kind: "field"; field: FieldId } | { kind: "food"; food: FoodId } | { kind: "hunger" } | { kind: "happy" } | { kind: "mistake" };

// What a what-if adds to a copy of the creature: awake minutes per field, servings per food, care cells, mistakes.
export interface Added {
  fieldMinutes?: Partial<Record<FieldId, number>>;
  servings?: Partial<Record<FoodId, number>>;
  hungerCells?: number;
  happyCells?: number;
  mistakes?: number;
}

const whole = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);

function addInput(add: Added, input: Input, amount: number): void {
  const n = whole(amount);
  switch (input.kind) {
    case "field":
      add.fieldMinutes = { ...add.fieldMinutes, [input.field]: (add.fieldMinutes?.[input.field] ?? 0) + n };
      break;
    case "food":
      add.servings = { ...add.servings, [input.food]: (add.servings?.[input.food] ?? 0) + n };
      break;
    case "hunger":
      add.hungerCells = (add.hungerCells ?? 0) + n;
      break;
    case "happy":
      add.happyCells = (add.happyCells ?? 0) + n;
      break;
    case "mistake":
      add.mistakes = (add.mistakes ?? 0) + n;
      break;
  }
}

// A copy of the creature with the inputs added. The care cells stop at their maximum, as they do in the game. The original is never touched.
function withAdded(c: Creature, add: Added): Creature {
  const copy = structuredClone(c);
  const k = copy.counters;
  for (const [field, minutes] of Object.entries(add.fieldMinutes ?? {})) {
    k.fieldMinutes[field as FieldId] = (k.fieldMinutes[field as FieldId] ?? 0) + whole(minutes);
  }
  for (const [food, servings] of Object.entries(add.servings ?? {})) {
    k.servings[food as FoodId] = (k.servings[food as FoodId] ?? 0) + whole(servings);
  }
  k.hungerCells = Math.min(g.careCellsMax, k.hungerCells + whole(add.hungerCells ?? 0));
  k.happyCells = Math.min(g.careCellsMax, k.happyCells + whole(add.happyCells ?? 0));
  k.careMistakes += whole(add.mistakes ?? 0);
  return copy;
}

// ---- the result of a forecast, or of a what-if ----

export interface Outcome {
  leader: string | null; // the form it grows into if the time were up now
  tier: Tier | null; // the tier its care gives (young only)
  growsNow: boolean; // the game would change its form at the next minute
  // A baby with two fields at the cells that end the stage: one field gets there first and the stage ends, so a what-if that adds minutes to
  // two fields cannot say which wins (the game would give it to the first to arrive). The leader is then not shown.
  ambiguous: boolean;
}

function outcomeOf(c: Creature, nowMs: number): Outcome {
  const reached = stageOf(c) === "baby" ? openFieldIds.filter((id) => fieldCells(c, id) >= g.fieldCellsToKid).length : 0;
  return { leader: leadingForm(c), tier: stageOf(c) === "young" ? tierOf(c) : null, growsNow: nextForm(c, nowMs) !== null, ambiguous: reached > 1 };
}

// ---- the rows of the stage ----

export interface Row {
  id: string;
  input: Input;
  label: string;
  value: number; // the whole number shown: cells, or mistakes
  pips: number | null; // how many pips the row has (its most), or null when it has no most
  note: string;
  leads: boolean; // this row's form is the leader
  unit: string; // what one tap of the stepper adds
  perTap: number;
  maxTaps: number;
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

function rowsOf(c: Creature, leader: string | null): Row[] {
  switch (stageOf(c)) {
    case "baby":
      return openFieldIds.map((id) => ({
        id: `field:${id}`,
        input: { kind: "field", field: id },
        label: fields[id].name,
        value: fieldCells(c, id),
        pips: g.fieldCellsToKid,
        note: `${(c.counters.fieldMinutes[id] ?? 0) % g.fieldCellMinutes} of ${g.fieldCellMinutes} awake minutes toward the next cell`,
        leads: leader === planOf(id).kid,
        unit: "minutes",
        perTap: g.fieldCellMinutes,
        maxTaps: 2 * g.fieldCellsToKid,
      }));
    case "kid": {
      const field = fieldOfForm(c.formId);
      if (!field) return [];
      const plan = planOf(field);
      return plan.foods.map((food) => ({
        id: `food:${food}`,
        input: { kind: "food", food },
        label: foods[food].name,
        value: foodCells(c, food),
        pips: null,
        note: `${plural(c.counters.servings[food] ?? 0, "serving")}, ${g.servingsPerFoodCell} make a cell`,
        leads: leader === plan.young[food],
        unit: "servings",
        perTap: 1,
        maxTaps: 20,
      }));
    }
    case "young":
      return [
        {
          id: "hunger",
          input: { kind: "hunger" },
          label: "Hunger cells",
          value: c.counters.hungerCells,
          pips: g.careCellsMax,
          note: `A meal that takes hunger from under ${tuning.fullAtHunger} to ${tuning.fullAtHunger} or more`,
          leads: false,
          unit: "cells",
          perTap: 1,
          maxTaps: Math.max(0, g.careCellsMax - c.counters.hungerCells),
        },
        {
          id: "happy",
          input: { kind: "happy" },
          label: "Happy cells",
          value: c.counters.happyCells,
          pips: g.careCellsMax,
          note: "Happiness reaching 100 from below",
          leads: false,
          unit: "cells",
          perTap: 1,
          maxTaps: Math.max(0, g.careCellsMax - c.counters.happyCells),
        },
        {
          id: "mistakes",
          input: { kind: "mistake" },
          label: "Care mistakes",
          value: c.counters.careMistakes,
          pips: null,
          note: `Tier 1 allows none, tier 2 up to ${g.tier2MaxMistakes}, tier 3 up to ${g.tier3MaxMistakes}`,
          leads: false,
          unit: "mistakes",
          perTap: 1,
          maxTaps: Math.max(0, g.tier3MaxMistakes + 1 - c.counters.careMistakes),
        },
      ];
    default:
      return [];
  }
}

// ---- what a what-if says ----

// The outcome with taps of the stepper rows added (row id to taps; a tap adds the row's `perTap`). A wrong id or a count outside the row's
// range is ignored or cut back, so the preview never goes past what the game could count.
export function whatIf(c: Creature, nowMs: number, taps: Record<string, number>): Outcome {
  const add: Added = {};
  for (const row of rowsOf(c, leadingForm(c))) addInput(add, row.input, Math.min(row.maxTaps, whole(taps[row.id] ?? 0)) * row.perTap);
  return outcomeOf(withAdded(c, add), nowMs);
}

// ---- rivals: what it would take to change the leader ----

export interface Rival {
  label: string;
  becomes: string | null; // the form that would lead after the change
  amount: number | null; // how much of the input it takes (null: nothing in range does it)
  unit: string;
  enough: boolean; // the time left allows that much
  text: string;
}

// The least amount (1, 2, 3 ... up to `cap`) that, added, makes `done(leader after)` true. Every step runs the real `leadingForm` on a copy.
function firstChange(c: Creature, cap: number, add: (n: number) => Added, done: (leader: string | null) => boolean): { n: number; leader: string | null } | null {
  for (let n = 1; n <= cap; n++) {
    const leader = leadingForm(withAdded(c, add(n)));
    if (done(leader)) return { n, leader };
  }
  return null;
}

const name = (id: string | null): string => (id ? getForm(id).name : "nothing");

// ---- the bounds behind "Locked" ----

// The least hunger a meal adds when it is eaten (a meal needs hunger under the full line, so a clamp at 100 can leave only this much).
const minMeal = Math.min(100 - tuning.fullAtHunger, ...openFieldIds.flatMap((id) => planOf(id).foods.map((food) => foods[food].hunger)));

// The most meals still possible in `left` minutes: each adds at least `minMeal`, and only room (what is empty now plus what the drain empties,
// at its awake rate, the fastest) lets the next one in.
export function mostMeals(c: Creature, left: number): number {
  const drain = -statChangePerMinute(c, "hunger", false);
  return Math.floor(Math.max(0, 100 - c.stats.hunger + drain * left) / minMeal);
}

// The most mistakes still possible in `left` minutes: one per `patienceMinutes` of an unanswered call, counting the one already running.
export function mostMistakes(c: Creature, left: number): number {
  return Math.floor(((c.call ? c.callMinutes : 0) + left) / tuning.calls.patienceMinutes);
}

// Could the creature still be turned into the special by neglect before the stage's time is up?
const canGoSpecial = (c: Creature, left: number): boolean => canBecomeSpecial(c) && (c.counters.neglectMinutes ?? 0) + left >= g.neglectHours * 60;

// The best tier it can still reach. Only a creature with no mistakes can do better than it does now, and with every cell full it gets the
// best tier the rules give.
function bestTier(c: Creature): Tier {
  return c.counters.careMistakes === 0 ? tierOf(withAdded(c, { hungerCells: g.careCellsMax, happyCells: g.careCellsMax })) : tierOf(c);
}

// The most care cells of each kind still possible in `left` minutes. A hunger cell needs a meal, so it is limited by the meals. A happy cell
// needs happiness to fall under 100 and come back, and it only falls on a step: at most one cell per step, and one right now.
const mostHappyCells = (left: number): number => left + 1;

// True only when nothing the player can still do changes the leader. Anything that is not proved is "still open".
function isLocked(c: Creature, left: number): boolean {
  if (canGoSpecial(c, left)) return false;
  switch (stageOf(c)) {
    case "baby": {
      const now = openFieldIds.map((id) => fieldCells(c, id));
      const most = openFieldIds.map((id) => Math.floor(((c.counters.fieldMinutes[id] ?? 0) + left) / g.fieldCellMinutes));
      if (most.every((cells, i) => cells === now[i])) return true; // no field can get another cell
      const top = Math.max(...now);
      return now.filter((cells) => cells === top).length === 1 && most.every((cells, i) => now[i] === top || cells < top);
    }
    case "kid": {
      const field = fieldOfForm(c.formId);
      if (!field) return false;
      const meals = mostMeals(c, left);
      const plan = planOf(field);
      const now = plan.foods.map((food) => foodCells(c, food));
      const most = plan.foods.map((food) => Math.floor(((c.counters.servings[food] ?? 0) + meals) / g.servingsPerFoodCell));
      if (most.every((cells, i) => cells === now[i])) return true;
      const top = Math.max(...now);
      return now.filter((cells) => cells === top).length === 1 && most.every((cells, i) => now[i] === top || cells < top);
    }
    case "young": {
      const worst = tierOf(withAdded(c, { mistakes: mostMistakes(c, left) }));
      return bestTier(c) === worst;
    }
    default:
      return true;
  }
}

// ---- time ----

// Days between the calendar days of two moments, in the player's own time zone (so a daylight saving change cannot make it 23 or 25 hours).
function dayNumber(ms: number): number {
  const d = new Date(ms);
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
}

// "today", "tomorrow", "yesterday", or the weekday.
export function dayText(ms: number, nowMs: number): string {
  const diff = dayNumber(ms) - dayNumber(nowMs);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  return new Date(ms).toLocaleDateString("en-US", { weekday: "short" });
}

const when = (ms: number, nowMs: number): string => `${dayText(ms, nowMs)} ${clockText(ms)}`;

export interface Timer {
  leftMinutes: number;
  limitMinutes: number;
  endsAt: number;
  text: string;
}

function timerOf(c: Creature, nowMs: number): Timer | null {
  const hours = stageHours(c);
  if (hours === null) return null;
  // The checkpoint the game really uses (`nextForm`). It is NOT clamped to the stage's length like the header's countdown: after a device clock
  // is set back the stage's start stays in the future and the stage runs on until real time catches up (known-issues.md), and a bound on
  // what can still happen has to use the real time left, or "Locked" could be wrong.
  const endsAt = c.stageStartedAt + hours * HOUR;
  const left = Math.max(0, (endsAt - nowMs) / MINUTE);
  const setBack = left > hours * 60 + 1;
  const text =
    Math.floor(left) <= 0
      ? "Ready to grow up."
      : stageOf(c) === "baby"
        ? `Within ${formatHm(left)}, by ${when(endsAt, nowMs)}. A field with ${g.fieldCellsToKid} cells ends it sooner.`
        : `${formatHm(left)} left, until ${when(endsAt, nowMs)}.`;
  return { leftMinutes: left, limitMinutes: hours * 60, endsAt, text: setBack ? `${text} The clock was set back, so this runs longer than the stage's length.` : text };
}

// ---- the whole forecast ----

export interface CareClock {
  minutes: number;
  limitMinutes: number;
  text: string;
}

export interface Confidence {
  kind: "now" | "locked" | "open";
  text: string;
}

export interface LogLine {
  at: number;
  call: CallKind;
  text: string;
}

export interface Forecast {
  stage: Stage;
  leader: string | null; // null for an adult and the special: nothing more to grow into
  tier: Tier | null; // the tier of the leading adult (young), or of this adult (adult)
  timer: Timer | null;
  rows: Row[];
  rivals: Rival[];
  tie: string | null;
  careClock: CareClock | null;
  confidence: Confidence | null;
  rule: string[]; // "What changes this?"
  log: { lines: LogLine[]; unlisted: number }; // the care mistakes of this stage, newest first
}

// The tier of a form that is one of the tiers of an adult in the tree, or null.
export function adultTier(formId: string): Tier | null {
  for (const id of openFieldIds) {
    for (const tiers of Object.values(planOf(id).adults)) {
      const at = tiers.indexOf(formId);
      if (at >= 0) return (at + 1) as Tier;
    }
  }
  return null;
}

function logOf(c: Creature, nowMs: number): Forecast["log"] {
  const entries = c.counters.mistakeLog ?? [];
  const lines = entries
    .slice()
    .reverse()
    .map((e) => ({
      at: e.at,
      call: e.call,
      text: `${when(e.at, nowMs)} · ${callText[e.call]}, not answered for ${tuning.calls.patienceMinutes} awake minutes`,
    }));
  return { lines, unlisted: Math.max(0, c.counters.careMistakes - entries.length) };
}

const levelText = (names: string[], cells: number, unit: string): string =>
  cells === 0 ? `No ${unit} yet.` : `${names.join(" and ")} ${names.length === 1 ? "is" : "are"} level at ${plural(cells, "cell")}.`;

// What decides the stage, from the tuning numbers.
function ruleOf(c: Creature): string[] {
  const special = name(specialId);
  const neglect = `With no care for ${g.neglectHours} awake hours it becomes ${special} instead (a meal, clean-up, medicine, pet or tickle counts as care).`;
  switch (stageOf(c)) {
    case "baby":
      return [
        `The first field to reach ${g.fieldCellsToKid} cells gives the kid. ${g.fieldCellMinutes} awake minutes in a field make one cell.`,
        `After ${g.babyHours} hours the field with the most cells gives it. A tie, or no cells, goes to the field of its egg pattern.`,
        neglect,
      ];
    case "kid":
      return [
        `After ${g.kidHours} hours the food eaten most gives the young. ${g.servingsPerFoodCell} servings make a cell, and only whole cells are compared.`,
        "A tie at the top, or no field food at all, gives the field's fourth young.",
        neglect,
      ];
    case "young":
      return [
        `After ${g.youngHours} hours its care gives the adult.`,
        `Tier 1 needs ${g.careCellsMax} hunger cells, ${g.careCellsMax} happy cells and no mistakes. Tier 2 allows up to ${g.tier2MaxMistakes}, tier 3 up to ${g.tier3MaxMistakes}, tier 4 more.`,
        "Mistakes and cells count from the start of this stage. Mistakes never go down.",
      ];
    case "adult":
      return ["Growth is complete."];
    default:
      return [`${name(c.formId)} is a special form. It grows no further.`];
  }
}

// `simulatedMs` is how far the creature has been simulated (the save's `lastSimulatedAt`; the game catches up about once a second, so it can
// lag `nowMs`). The bounds count from there, because the minutes in between have not happened to the creature yet.
export function forecast(c: Creature, nowMs: number, simulatedMs = nowMs): Forecast {
  const stage = stageOf(c);
  const leader = leadingForm(c);
  const timer = timerOf(c, nowMs);
  // The minutes the bounds count. Rounded up, and one more: the game steps on whole minutes from the last one it ran, and the step that ends
  // the stage still runs the care first (a call can still become a mistake in it), so the stage can take up to this many care steps.
  const left = timer ? Math.ceil(Math.max(0, (timer.endsAt - Math.min(nowMs, simulatedMs)) / MINUTE)) + 1 : 0;
  const base: Forecast = {
    stage,
    leader,
    tier: stage === "young" ? tierOf(c) : stage === "adult" ? adultTier(c.formId) : null,
    timer,
    rows: rowsOf(c, leader),
    rivals: [],
    tie: null,
    careClock: null,
    confidence: null,
    rule: ruleOf(c),
    log: logOf(c, nowMs),
  };
  if (stage === "adult" || stage === "special") return base;

  const growsNow = nextForm(c, nowMs) !== null;
  base.confidence = growsNow
    ? { kind: "now", text: "It grows up at the next minute." }
    : isLocked(c, left)
      ? { kind: "locked", text: `Locked. Nothing it can still do in the ${formatHm(timer!.leftMinutes)} left changes this.` }
      : {
          kind: "open",
          text:
            stage === "baby"
              ? `Still open. Up to ${formatHm(timer!.leftMinutes)} left, and a field with ${g.fieldCellsToKid} cells ends it sooner.`
              : stage === "kid"
                ? `Still open. ${formatHm(timer!.leftMinutes)} left, and every meal can still count.`
                : `Still open. ${formatHm(timer!.leftMinutes)} left, and cells and mistakes can still change the tier.`,
        };

  if (stage === "baby" || stage === "kid") {
    const awake = c.counters.neglectMinutes ?? 0;
    const limit = g.neglectHours * 60;
    base.careClock = {
      minutes: awake,
      limitMinutes: limit,
      text: `${formatHm(awake)} of ${formatHm(limit)} awake hours with no care (time away on a job does not count). At ${formatHm(limit)} it becomes ${name(specialId)} instead.`,
    };
  }
  if (growsNow) return base;

  if (stage === "baby" || stage === "kid") base.rivals = tieAndRivals(c, base, left);
  else base.rivals = tierRivals(c, base, left);
  if (stage === "baby" || stage === "kid") {
    const most = Math.max(...base.rows.map((r) => r.value));
    const top = base.rows.filter((r) => r.value === most);
    if (stage === "baby" && top.length > 1 && leader) {
      base.tie = `${levelText(top.map((r) => r.label), most, "field cell")} A tie goes to the field of its egg pattern: ${fields[fieldOfForm(leader) ?? openFieldIds[0]!].name}.`;
    }
    if (stage === "kid" && top.length > 1) {
      base.tie = `${levelText(top.map((r) => r.label), most, "field food")} A tie gives the fourth young: ${name(leader)}.`;
    }
  }
  return base;
}

// Baby and kid: for each row that is not leading, how much it takes to change the leader.
function tieAndRivals(c: Creature, f: Forecast, left: number): Rival[] {
  const lead = f.leader;
  const baby = f.stage === "baby";
  const meals = baby ? 0 : mostMeals(c, left);
  const topCells = Math.max(0, ...f.rows.map((r) => r.value));
  return f.rows
    .filter((r) => !r.leads)
    .map((r): Rival => {
      const cap = baby ? g.fieldCellsToKid * g.fieldCellMinutes : g.servingsPerFoodCell * (topCells + 1) + 1;
      const hit = firstChange(c, cap, (n) => { const add: Added = {}; addInput(add, r.input, n); return add; }, (l) => l !== lead);
      const own = baby && r.input.kind === "field" ? planOf(r.input.field).kid : r.input.kind === "food" && fieldOfForm(c.formId) ? planOf(fieldOfForm(c.formId)!).young[r.input.food] ?? null : null;
      const enough = hit !== null && hit.n <= (baby ? left : meals);
      const unit = baby ? "awake minute" : `${r.label} serving`;
      let text: string;
      if (hit === null) text = `${r.label}: nothing it can add changes the leader.`;
      else if (!enough) text = `${r.label}: it takes ${plural(hit.n, unit)}, more than the time left allows.`;
      else {
        text = `${r.label}: ${plural(hit.n, unit)} more would make ${name(hit.leader)} the leader`;
        const tied = !baby && hit.leader !== own;
        if (tied) {
          // A tie gives the fourth young; the food leads on its own a little later.
          const take = firstChange(c, cap, (n) => { const add: Added = {}; addInput(add, r.input, n); return add; }, (l) => l === own);
          if (take) text += take.n <= meals ? `, and ${take.n} more would give ${name(own)}` : `, and ${name(own)} would take ${take.n} more, more than the time left allows`;
        }
        text += ".";
      }
      return { label: r.label, becomes: hit?.leader ?? null, amount: hit?.n ?? null, unit: baby ? "minutes" : "servings", enough, text };
    });
}

// Young: the tier above and the tier below.
function tierRivals(c: Creature, f: Forecast, left: number): Rival[] {
  const field = fieldOfForm(c.formId);
  const tier = f.tier;
  if (!field || !tier) return [];
  const adults = planOf(field).adults[c.formId];
  if (!adults) return [];
  const out: Rival[] = [];
  const k = c.counters;
  if (tier > 1) {
    const better = adults[tier - 2]!;
    const reachable = bestTier(c) < tier;
    const needHunger = g.careCellsMax - k.hungerCells;
    const needHappy = g.careCellsMax - k.happyCells;
    const inTime = needHunger <= mostMeals(c, left) && needHappy <= mostHappyCells(left);
    const text = !reachable
      ? `Tier ${tier - 1} (${name(better)}): out of reach in this stage, it has made ${plural(k.careMistakes, "mistake")}.`
      : `Tier ${tier - 1} (${name(better)}): ${plural(needHunger, "more hunger cell")} and ${plural(needHappy, "more happy cell")}, with no mistakes${inTime ? "" : ". That is more than the time left allows"}.`;
    out.push({ label: `Tier ${tier - 1}`, becomes: better, amount: reachable ? needHunger + needHappy : null, unit: "cells", enough: reachable && inTime, text });
  }
  if (tier < 4) {
    const worse = adults[tier as 1 | 2 | 3];
    const hit = firstChange(c, g.tier3MaxMistakes + 1, (n) => ({ mistakes: n }), (l) => l !== f.leader);
    const allowed = mostMistakes(c, left);
    const text = hit
      ? `Tier ${tier + 1} (${name(worse)}): after ${plural(hit.n, "more care mistake")}${hit.n > allowed ? `, more than the time left allows` : ""}.`
      : `Tier ${tier + 1} (${name(worse)}): not in range.`;
    out.push({ label: `Tier ${tier + 1}`, becomes: hit?.leader ?? null, amount: hit?.n ?? null, unit: "mistakes", enough: hit !== null && hit.n <= allowed, text });
  }
  return out;
}
