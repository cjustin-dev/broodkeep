// The Creature Book (CLAUDE.md section 7.8): which creatures it lists and in what order, how a missing one is hinted, and which forms a
// creature went through to become the one it is now. Which forms the player has raised is saved in Save.book (game/book.ts).
import { fieldOfForm, fields, openFieldIds, planOf } from "./fields";
import { foods } from "./foods";
import { forms } from "./forms";
import { specialId } from "./special";

export interface BookPage {
  title: string; // "Baby", or a field's name
  rows: string[][]; // form ids, row by row
}

const babyIds = Object.values(forms)
  .filter((form) => form.stage === "baby")
  .map((form) => form.id);

// A field's four young, in the order of its foods and then the fourth ("other") young: also the order of the columns of its adults.
function youngOf(field: (typeof openFieldIds)[number]): string[] {
  const plan = planOf(field);
  return [...plan.foods.map((food) => plan.young[food] as string), plan.youngOther];
}

// The pages: the baby, then one page per open field, then the special. A field page has six rows: its kid, its four young, and under each young its four
// adults from tier 1 (the top) to tier 4, so below the young a column is one line of the family tree. Built on first use, not when the
// file is loaded: the save code imports this file, and loading a save should not read the whole growth tree.
let pages: BookPage[] | undefined;
export function bookPages(): BookPage[] {
  if (!pages) {
    pages = [
      { title: "Baby", rows: [babyIds] },
      ...openFieldIds.map((id): BookPage => {
        const plan = planOf(id);
        const young = youngOf(id);
        const tiers = [0, 1, 2, 3].map((tier) => young.map((y) => plan.adults[y]![tier] as string));
        return { title: fields[id].name, rows: [[plan.kid], young, ...tiers] };
      }),
      { title: "Special", rows: [[specialId]] },
    ];
  }
  return pages;
}

export const bookIds = (): string[] => bookPages().flatMap((page) => page.rows.flat());
export const bookTotal = (): number => bookIds().length;

// The forms a creature went through to become this one, baby first: [baby, kid], [baby, kid, young] or [baby, kid, young, adult]. A baby
// is just [itself] and an unknown id gives []. The special is [baby, itself]: it can come from a baby or a kid, and every route starts at the
// baby. (With more than one baby form the first would be named: there is one, Blip.)
export function lineageOf(formId: string): string[] {
  const form = forms[formId];
  if (!form) return [];
  if (form.stage === "baby") return [formId];
  if (formId === specialId) return [babyIds[0] as string, formId];
  const field = fieldOfForm(formId);
  if (!field) return [];
  const plan = planOf(field);
  const baby = babyIds[0] as string;
  if (formId === plan.kid) return [baby, formId];
  if (youngOf(field).includes(formId)) return [baby, plan.kid, formId];
  const young = Object.keys(plan.adults).find((y) => plan.adults[y]!.includes(formId));
  return young ? [baby, plan.kid, young, formId] : [];
}

// What to say about a creature the player has not raised yet, by tier for an adult. Words, not numbers: the care rules are in tuning.ts.
const tierHints = ["Perfect care", "Good care", "A few care mistakes", "Neglect it"];

// A short hint for a missing creature, or null. The book only points at what could grow from a creature the player has already raised
// (its parent in the family tree), so it guides without giving the whole tree away.
export function hintFor(formId: string, found: ReadonlySet<string>): string | null {
  const line = lineageOf(formId);
  if (formId === specialId) return found.has(line[0] as string) ? "Leave a baby or kid alone for hours" : null;
  const field = fieldOfForm(formId);
  const form = forms[formId];
  if (line.length < 2 || !field || !form) return null; // a baby, or an unknown id
  const parent = line[line.length - 2] as string;
  if (!found.has(parent)) return null;
  const plan = planOf(field);
  if (form.stage === "kid") return `Take a baby to the ${fields[field].name}`;
  if (form.stage === "young") {
    const food = plan.foods.find((f) => plan.young[f] === formId);
    return food ? `Feed it lots of ${foods[food].name.toLowerCase()}` : "Pellets only, or an even mix"; // no field food, or a tie at the top
  }
  return tierHints[plan.adults[parent]!.indexOf(formId)] ?? null;
}
