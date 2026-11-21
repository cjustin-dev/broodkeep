// Every creature form, by id. Add a new creature by writing its file and listing it here.
import type { Form } from "../../game/types";
import { blip } from "./blip";
import { fennix } from "./fennix";
import { pip } from "./pip";

export const forms: Record<string, Form> = { blip, pip, fennix };

export function getForm(id: string): Form {
  const form = forms[id];
  if (!form) throw new Error(`Unknown creature form: ${id}`);
  return form;
}
