// Every creature form, by id. Add a new creature by writing its file and listing it here.
import type { Form } from "../../game/types";
import { aurelith } from "./aurelith";
import { bastion } from "./bastion";
import { blip } from "./blip";
import { citadrake } from "./citadrake";
import { dreadmaw } from "./dreadmaw";
import { drip } from "./drip";
import { fennix } from "./fennix";
import { gloomtoad } from "./gloomtoad";
import { grumblot } from "./grumblot";
import { gruntle } from "./gruntle";
import { hollowking } from "./hollowking";
import { lumiwing } from "./lumiwing";
import { mothlet } from "./mothlet";
import { nubbin } from "./nubbin";
import { pip } from "./pip";
import { pyrefang } from "./pyrefang";
import { shellby } from "./shellby";
import { smudge } from "./smudge";
import { solarion } from "./solarion";
import { thornback } from "./thornback";

export const forms: Record<string, Form> = {
  blip, drip, pip, nubbin, smudge, fennix, shellby, gruntle, mothlet, grumblot, pyrefang, bastion, lumiwing, thornback, gloomtoad, solarion, citadrake, aurelith, dreadmaw, hollowking,
};

export function getForm(id: string): Form {
  const form = forms[id];
  if (!form) throw new Error(`Unknown creature form: ${id}`);
  return form;
}
