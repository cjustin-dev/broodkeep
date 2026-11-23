// Retire: a grown-up creature leaves to the Creature Book as a completed life, and a new egg starts. This file holds the rule (who may
// retire), the states the Book panel shows, and every word of it, so the screen and the tests read the same strings. Pure: no screen code.
// The words follow the spec's copy rule: "retire, complete, pass on", never a word of loss (a test checks the whole words).

import { forms } from "../data/forms";
import { spots } from "../data/habitat";
import type { Creature, RetiredLife, Save } from "./state";
import type { Form } from "./types";

// The form with this id, or undefined for an id this version does not know. (A plain `forms[id]` answers for "constructor" and "toString"
// too, because the table is an ordinary object: a bad stored record must show as "A creature", not as a function.)
export const formOf = (formId: string): Form | undefined => (Object.prototype.hasOwnProperty.call(forms, formId) ? forms[formId] : undefined);

export type RetireRefusal = "unavailable" | "not-adult" | "away";

// Why this creature cannot retire now, in the order the action checks: no living creature, not grown up (the special never is), out working.
// `save` must already be caught up to now (the action does that first).
export function retireRefusal(save: Save): RetireRefusal | null {
  const c = save.creature;
  if (save.phase !== "alive" || !c) return "unavailable";
  if (formOf(c.formId)?.stage !== "adult") return "not-adult";
  if (c.job) return "away";
  return null;
}

// What the Book panel's "This creature" section shows.
export type RetireStatus =
  | { kind: "none" } // an egg or a dead creature: nothing to say
  | { kind: "teaser" } // alive but not grown up
  | { kind: "away"; name: string; spot: string }
  | { kind: "fighting"; name: string } // a fight is on screen (not part of the save, so the screen says so)
  | { kind: "ready"; name: string };

export function retireStatus(save: Save, fighting: boolean): RetireStatus {
  const refusal = retireRefusal(save);
  const c: Creature | null = save.creature;
  if (refusal === "unavailable" || !c) return { kind: "none" };
  if (refusal === "not-adult") return { kind: "teaser" };
  const name = formName(c.formId);
  if (refusal === "away") return { kind: "away", name, spot: c.job ? spots[c.job.spot].name : "" };
  return fighting ? { kind: "fighting", name } : { kind: "ready", name };
}

export const formName = (formId: string): string => formOf(formId)?.name ?? "A creature";

export const retireText = {
  teaser: "A grown-up creature can retire here, to be kept in the Book as a completed life.",
  ready: (name: string) => `${name} is grown up.`,
  button: (name: string) => `Retire ${name}`,
  away: (name: string, spot: string) => `${name} is away at ${spot}. It can retire once it is home.`,
  fighting: (name: string) => `Finish the fight first, then ${name} can retire.`,
  cardTitle: (name: string) => `Retire ${name}?`,
  cardBody: (name: string) =>
    `${name} has lived a full life. Retiring keeps it in the Book as a completed life. It will not be in your home or need care again, and a new egg starts. Your coins, bag and Book stay as they are. You cannot bring it back, and you can look at ${name} under Completed lives.`,
  confirm: "Retire, complete, pass on",
  keep: "Keep playing",
  done: (name: string) => `${name} is in your Book as a completed life. A new egg has started.`,
  livesHeading: "Completed lives",
  thisHeading: "This creature",
};

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getDate()} ${months[d.getMonth()]}`;
};

// "12 Nov to 22 Nov": the day it hatched and the day it retired, in the device's own time zone.
export const lifeDates = (life: RetiredLife): string => `${day(life.bornAt)} to ${day(life.retiredAt)}`;
