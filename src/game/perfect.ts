// The Perfect star (docs/adult-a4-plan.md section 14, Spec 8 part 2): a creature that grows up into a tier 1 adult having made no care mistake in
// any stage earns it. This file holds the rule, the count it needs and every word of it, so the screen and the tests read the same strings. Pure: no screen code.
//
// The stage counters are replaced at every evolution (`evolveTo`), so the mistakes of the stages already finished are kept on the creature as
// `pastMistakes`. A creature with no such record (one made before this build, or hatched past its baby stage by the dev panel) is UNKNOWN, not clean:
// it can never earn the star.

import { adultTier } from "./growth";
import { formOf } from "./retire";
import { logEvent } from "./state";
import type { Creature, Save } from "./state";
import { specialId } from "../data/special";

const isCount = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;

// The care mistakes this creature has made in its whole life so far, or null when that is not known. The one reader of `pastMistakes`, and it never throws:
// a form the game does not know gives null, a baby has no earlier stage (so whatever is stored is ignored), any other stage needs a stored whole number,
// and the stage's own count must be a whole number too.
export function lifeMistakes(c: Creature): number | null {
  const form = formOf(c.formId);
  const now = c.counters?.careMistakes;
  if (!form || !isCount(now)) return null;
  if (form.stage === "baby") return now;
  return isCount(c.pastMistakes) ? c.pastMistakes + now : null;
}

// Call just before a creature changes form and its stage counters are replaced: the finished stage's mistakes join the earlier ones (an unknown life stays unknown).
export function recordFinishedStage(c: Creature): void {
  const total = lifeMistakes(c);
  if (total === null) delete c.pastMistakes;
  else c.pastMistakes = total;
}

// Would this creature earn the star by growing into `nextFormId`? Call before the change, while the creature still has its old form and counters.
// Tier 1 itself needs no mistake in the young stage, so what this adds is no mistake in the baby and kid stages.
export function isPerfectGrowUp(c: Creature, nextFormId: string): boolean {
  return adultTier(nextFormId) === 1 && lifeMistakes(c) === 0;
}

// Call after the creature has grown into its tier 1 form: the flag on the creature, the form in the Book's list (which outlives the creature), a line in the log.
export function awardPerfect(save: Save, c: Creature, t: number): void {
  c.perfect = true;
  if (!save.perfect.includes(c.formId)) save.perfect.push(c.formId);
  logEvent(save, t, `${formOf(c.formId)?.name ?? "A creature"} grew up as a perfect run`);
}

// ---- what the Growth Forecast says (Adult Mode) ----

export const perfectText = {
  on: "Perfect run: still possible. No mistake so far in this life.",
  kept: "Perfect run. It grew up with no mistake, and the Book keeps its star.",
  star: "Perfect star",
  // The count line of the Book, after "N of 65 creatures raised": only said when there is at least one.
  count: (n: number) => `, ${n} with a Perfect star`,
};

export interface PerfectLine {
  kind: "on" | "kept";
  text: string;
}

// The live line for the Forecast. It exists only while the run is still possible (a baby, kid or young that is not the special, with no mistake so far in a
// known life) and for an adult that has the star. Nothing is ever said to a creature that is short of it, and no mistake count is printed.
export function perfectLine(c: Creature): PerfectLine | null {
  const form = formOf(c.formId);
  if (!form || c.formId === specialId) return null;
  if (form.stage === "adult") return c.perfect === true ? { kind: "kept", text: perfectText.kept } : null;
  return lifeMistakes(c) === 0 ? { kind: "on", text: perfectText.on } : null;
}
