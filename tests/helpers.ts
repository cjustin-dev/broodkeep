// Shared helpers for the tests.
import { fields } from "../src/data/fields";
import { forms } from "../src/data/forms";
import { specialId } from "../src/data/special";
import { forceHatch } from "../src/game/dev";
import { feed, clean, giveMedicine, toggleLights, touch } from "../src/game/actions";
import { simulateTo } from "../src/game/sim";
import { newSave } from "../src/game/state";
import type { Creature, Save } from "../src/game/state";
import { MINUTE } from "../src/game/time";
import type { FieldId, Place } from "../src/game/types";

// A moment on the player's own clock (so the tests do not depend on the time zone).
export const at = (hour: number, minute = 0, day = 5): number => new Date(2026, 0, day, hour, minute, 0).getTime();

// Runs `check` with one field locked (its plan taken away), then puts the plan back, even if the check throws. All three fields are open now,
// so a test of the locked case has to lock one itself. (`openFieldIds` is worked out when the data loads, so it does not change.)
export function withLockedField<T>(id: FieldId, check: () => T): T {
  const plan = fields[id].plan;
  fields[id].plan = null;
  try {
    return check();
  } finally {
    fields[id].plan = plan;
  }
}

// The id of a form of the given stage (never the special one, which is a kid by stage that never grows).
export const stageForm = (stage: string): string => Object.values(forms).find((f) => f.stage === stage && f.id !== specialId)!.id;

// A save with a creature that just hatched.
export function aliveSave(formId = "blip", t = at(8), seed = 1234): Save {
  const save = newSave(t, seed);
  forceHatch(save, formId, t);
  return save;
}

// A creature of the form with its state set directly (at `t` the simulation has nothing to catch up on, so the state is what an action sees).
export function careState(
  formId: string,
  set: { sleep?: Creature["sleep"]; away?: boolean; hunger?: number; energy?: number; hygiene?: number; poop?: number; sick?: boolean; place?: Place },
  t = at(8),
): Save {
  const save = aliveSave(formId, t);
  const c = save.creature!;
  c.sleep = set.sleep ?? null;
  if (set.away) c.job = { spot: "meadow", startedAt: t, endsAt: t + 3 * MINUTE };
  if (set.hunger !== undefined) c.stats.hunger = set.hunger;
  if (set.energy !== undefined) c.stats.energy = set.energy;
  if (set.hygiene !== undefined) c.stats.hygiene = set.hygiene;
  if (set.poop !== undefined) c.poop = set.poop;
  if (set.sick !== undefined) c.sick = set.sick;
  if (set.place !== undefined) c.place = set.place;
  return save;
}

// The least care that keeps a baby or a kid from turning into the special (game/growth.ts): a pet every `everyMinutes`, then the time caught up
// exactly to endMs. For tests that need a creature to grow up on its own timetable.
export function petUntil(save: Save, startMs: number, endMs: number, everyMinutes = 60): void {
  for (let t = startMs + everyMinutes * MINUTE; t < endMs; t += everyMinutes * MINUTE) {
    simulateTo(save, t);
    touch(save, "pet", t);
  }
  simulateTo(save, endMs);
}

// A simple stand-in for a caring player. Every 10 minutes it looks at the creature
// and does the obvious thing. Returns the final game time.
export function careForUntil(save: Save, startMs: number, endMs: number): number {
  let t = startMs;
  while (t < endMs && save.phase === "alive") {
    t += 10 * MINUTE;
    simulateTo(save, t);
    const c = save.creature;
    if (!c || save.phase !== "alive") break;
    if (c.sleep) {
      clean(save, t);
      if (c.sick) giveMedicine(save, t);
      continue;
    }
    if (c.sick) giveMedicine(save, t);
    if (c.poop > 0) clean(save, t);
    if (c.stats.hunger < 50) feed(save, "pellet", t);
    if (c.stats.happiness < 60) for (let i = 0; i < 5; i++) touch(save, "pet", t);
    if (c.stats.energy < 20) toggleLights(save, t);
  }
  return t;
}
