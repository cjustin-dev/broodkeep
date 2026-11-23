// Resting: a hurt creature gets its HP back over real time. Called for every simulated minute (see sim.ts),
// so it also happens while the app is closed.

import { combatTuning } from "../../data/combat";
import type { Creature } from "../state";
import { currentHp, maxHp } from "./stats";

export function stepRecovery(c: Creature): void {
  if (c.hp === undefined) return; // never hurt: nothing to recover
  const max = maxHp(c);
  const hp = currentHp(c);
  const neglected = c.stats.hunger < combatTuning.neglectBelow || c.stats.hygiene < combatTuning.neglectBelow;
  const rate = (max / combatTuning.recoverMinutes) * (c.sleep ? combatTuning.asleepFactor : 1) * (neglected ? combatTuning.neglectFactor : 1);
  const next = hp + rate;
  // Back to full is the same as never hurt. (A hair of slack, so adding up many small steps still lands on full.)
  if (next >= max - 1e-9) delete c.hp;
  else c.hp = next;
}
