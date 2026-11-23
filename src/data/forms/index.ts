// Every creature form, by id. The drawings are generated from the Python art tools (see baby.ts, land.ts, water.ts, sky.ts and special.ts), and the stats
// come from the stage and role (stats.ts). The tree that links the forms is in ../fields.ts.
import type { Form, FormSource } from "../../game/types";
import { baby } from "./baby";
import { land } from "./land";
import { sky } from "./sky";
import { special } from "./special";
import { derivedStats } from "./stats";
import { water } from "./water";

const sources: FormSource[] = [...baby, ...land, ...water, ...sky, ...special];

export const forms: Record<string, Form> = Object.fromEntries(
  sources.map((source) => [source.id, { ...source, softLook: null, baseStats: derivedStats(source.stage, source.role) } satisfies Form]),
);

export function getForm(id: string): Form {
  const form = forms[id];
  if (!form) throw new Error(`Unknown creature form: ${id}`);
  return form;
}
