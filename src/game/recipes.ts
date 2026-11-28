// Book recipes (docs/adult-a4-plan.md section 14, Spec 8 part 1): what a creature needs to be raised, read off the growth rules and `tuning.growth`, never stored.
// One step for each form of its family line, in order, and one note about the care every baby and kid needs on the way. The words name no creature, only fields,
// foods and stages, so a creature that has not been raised stays "???" and its parents' names are never printed. This file holds every word, so the screen and the
// tests read the same strings. Pure: no screen code.

import { bookIds, lineageOf } from "../data/book";
import { eggField, eggPatterns } from "../data/eggs";
import { fieldOfForm, fields, planOf } from "../data/fields";
import { foods } from "../data/foods";
import { specialId } from "../data/special";
import { tuning } from "../data/tuning";
import { adultTier } from "./growth";
import { perfectText } from "./perfect";
import { formOf } from "./retire";
import type { FoodId } from "./types";

const g = tuning.growth;

export type RecipeStage = "baby" | "kid" | "young" | "adult" | "special";

export interface RecipeStep {
  formId: string; // the form this step produces
  stage: RecipeStage;
  text: string;
}

export interface Recipe {
  steps: RecipeStep[];
  note: string | null; // the care a baby and a kid need on the way, said once on the card; null for the baby and the special (the special's own step says it)
}

const mistakes = (n: number): string => `${n} mistake${n === 1 ? "" : "s"}`;
const range = (lo: number, hi: number): string => (lo === hi ? mistakes(lo) : `${lo} to ${hi} mistakes`);

const careWords = "A meal, a clean-up when there is something to clean, medicine while it is sick, a pet or a tickle counts as care.";

export const recipeText = {
  hatch: "Hatch an egg.",
  kid: (field: string) =>
    `Baby: spend ${g.fieldCellsToKid * g.fieldCellMinutes} awake minutes in the ${field} (${g.fieldCellsToKid} cells of ${g.fieldCellMinutes} minutes) before another field gets ${g.fieldCellsToKid}. ` +
    `If ${g.babyHours} hours pass first, the field with the most cells wins, and a tie goes to the field of the egg's pattern ` +
    `(${eggPatterns.map((p) => `${p} ${fields[eggField[p]].name}`).join(", ")}), even when that field is not in the tie.`,
  young: (food: string) =>
    `Kid: feed it more ${food} than any other food, counted in whole cells (${g.servingsPerFoodCell} servings make a cell). After ${g.kidHours} hours the food with the most whole cells wins.`,
  youngOther: () =>
    `Kid: feed it pellets and treats only, or keep the top foods tied in whole cells (${g.servingsPerFoodCell + 1} servings against ${g.servingsPerFoodCell} is a tie). ` +
    `After ${g.kidHours} hours, a tie at the top gives this one.`,
  adult: (tier: 1 | 2 | 3 | 4): string => {
    const after = `Young: after ${g.youngHours} hours, with`;
    switch (tier) {
      case 1:
        return (
          `${after} ${g.careCellsMax} hunger cells (a feeding that fills it up), ${g.careCellsMax} happy cells (happiness reaching full) and no mistakes. ` +
          "Add no mistake in the baby and kid stages for a Perfect star."
        );
      case 2:
        return `${after} ${mistakes(g.tier2MaxMistakes)}, or no mistake but fewer than ${g.careCellsMax} hunger or happy cells.`;
      case 3:
        return `${after} ${range(g.tier2MaxMistakes + 1, g.tier3MaxMistakes)}.`;
      default:
        return `${after} ${g.tier3MaxMistakes + 1} or more mistakes.`;
    }
  },
  special: `Leave a baby or a kid at home with no care for ${g.neglectHours} awake hours. Sleep and time away on a job do not count. ${careWords}`,
  note: `Keep caring as you go: a baby or a kid with no care for ${g.neglectHours} awake hours becomes the special form instead. ${careWords}`,
};

const stageOf = (formId: string): RecipeStage | null => {
  if (formId === specialId) return "special";
  const stage = formOf(formId)?.stage;
  return stage === "baby" || stage === "kid" || stage === "young" || stage === "adult" ? stage : null;
};

// The words of the step that makes `formId`, or null when the game has no such form or it has no place in a family line.
function stepText(formId: string, stage: RecipeStage): string | null {
  if (stage === "baby") return recipeText.hatch;
  if (stage === "special") return recipeText.special;
  const field = fieldOfForm(formId);
  if (!field) return null;
  const plan = planOf(field);
  if (stage === "kid") return recipeText.kid(fields[field].name);
  if (stage === "young") {
    const food = (Object.keys(plan.young) as FoodId[]).find((f) => plan.young[f] === formId);
    return food ? recipeText.young(foods[food].name) : recipeText.youngOther();
  }
  const tier = adultTier(formId);
  return tier ? recipeText.adult(tier) : null;
}

// The recipe for a form of the Book, or null for anything else (an unknown id, "constructor", an id that is in no family line).
export function recipeOf(formId: string): Recipe | null {
  if (!formOf(formId)) return null;
  const line = lineageOf(formId);
  if (line.length === 0) return null;
  const steps: RecipeStep[] = [];
  for (const id of line) {
    const stage = stageOf(id);
    const text = stage ? stepText(id, stage) : null;
    if (!stage || text === null) return null;
    steps.push({ formId: id, stage, text });
  }
  const stage = steps[steps.length - 1]!.stage;
  return { steps, note: stage === "baby" || stage === "special" ? null : recipeText.note };
}

// ---- the words for a creature that has not been raised: where it sits, never what it is called ----

// "the baby", "a kid in the Water", "a young in the Water", "a tier 1 adult in the Water" or "the special form".
export function describeForm(formId: string): string {
  const stage = stageOf(formId);
  if (stage === "baby") return "the baby";
  if (stage === "special") return "the special form";
  const field = fieldOfForm(formId);
  const place = field ? ` in the ${fields[field].name}` : "";
  if (stage === "adult") {
    const tier = adultTier(formId);
    return `${tier ? `a tier ${tier} adult` : "an adult"}${place}`;
  }
  return `a ${stage ?? "creature"}${place}`;
}

export const nextText = {
  lead: "Next to find: ",
  all: "Every creature is raised.",
};

export interface NextToFind {
  formId: string;
  label: string; // describeForm
  step: string; // the last step of its recipe: its parent is raised, so every step before it is done
}

// The first creature, in Book order, that is not raised and can be reached now: the baby always, any other once its parent (the one before it in its family line) is
// raised. Null only when every creature of the Book is raised. An id in `found` that is not in the Book changes nothing.
export function nextToFind(found: ReadonlySet<string>): NextToFind | null {
  for (const id of bookIds()) {
    if (found.has(id)) continue;
    const line = lineageOf(id);
    if (line.length > 1 && !found.has(line[line.length - 2] as string)) continue;
    const recipe = recipeOf(id);
    if (!recipe) continue;
    return { formId: id, label: describeForm(id), step: recipe.steps[recipe.steps.length - 1]!.text };
  }
  return null;
}

// ---- the Book card ----

export const cardText = {
  notRaised: "Not raised yet",
  raised: "Raised",
  done: "Done",
  close: "Close",
  hidden: "???",
};

// What a cell says to a screen reader: it starts with the word the cell shows, and for a creature that is not raised it never holds the creature's name.
export function cellLabel(found: boolean, name: string, perfect: boolean): string {
  return found ? `${name}, raised${perfect ? `, ${perfectText.star}` : ""}` : `${cardText.hidden}, not raised yet`;
}
