// The Creature Book's record: the forms the player has raised, kept on the save (so it outlives one creature) and added to the moment a
// creature takes a form, whether it hatched into it or grew into it. What the book shows is in data/book.ts and ui/BookPanel.tsx.
import { bookTotal } from "../data/book";
import { getForm } from "../data/forms";
import { logEvent } from "./state";
import type { Save } from "./state";

// Note that the player now has a creature of this form. Returns true the first time, false if it was already in the book.
export function discover(save: Save, formId: string, t: number): boolean {
  if (save.book.includes(formId)) return false;
  save.book.push(formId);
  logEvent(save, t, `New in the Creature Book: ${getForm(formId).name} (${save.book.length} of ${bookTotal()})`);
  return true;
}
