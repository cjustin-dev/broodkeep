// What the things the player owns do to the care rules. The care rules (care.ts, growth.ts, actions.ts), the adult HUD (hud.ts) and the Growth
// Forecast (forecast.ts) all ask here, so what the screen says is what the simulation does. `owned` is `save.owned`.

import { tuning } from "../data/tuning";

export type Owned = readonly string[];

// Comfy Bed: the share of the usual asleep drain that happiness loses while the creature sleeps at home (1 with no bed).
export const bedFactor = (owned: Owned): number => (owned.includes("comfy-bed") ? tuning.shop.bedHappinessFactor : 1);

// Feeding Mat: how far under the full line a meal may end and still count as a hunger cell (0 with no mat).
export const hungerGrace = (owned: Owned): number => (owned.includes("feeding-mat") ? tuning.shop.matHungerGrace : 0);
