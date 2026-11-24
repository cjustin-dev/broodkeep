// The words of the spot cards and the job card (Adult Mode). Pure, no screen code, so the screen and the tests read the same strings.
// Every number comes from data/habitat.ts or from the haul rule (callBackHaul), never typed here. No word of loss (a test checks the whole strings).

import { materials, spots } from "../../data/habitat";
import type { MaterialId, SpotId } from "../../data/habitat";
import type { Creature } from "../state";
import { callBackHaul } from "./jobs";

// Herbs is a plural name: one of them is a Herb.
const single: Partial<Record<MaterialId, string>> = { herb: "Herb" };

export const coinsText = (n: number): string => `${n} ${n === 1 ? "coin" : "coins"}`;
export const materialText = (id: MaterialId, n: number): string => `${n} ${n === 1 ? (single[id] ?? materials[id].name) : materials[id].name}`;

// "2 to 4 coins", or "2 coins" when the range is one number.
export const rangeText = (range: [number, number], text: (n: number) => string): string =>
  range[0] === range[1] ? text(range[0]) : `${range[0]} to ${text(range[1])}`;

export const cardText = {
  title: (spot: SpotId): string => `${spots[spot].name}: ${materials[spots[spot].material].name}`,
  cost: (spot: SpotId): string => `${spots[spot].minutes} min, ${spots[spot].energyCost} energy`,
  haul: (spot: SpotId): string => {
    const s = spots[spot];
    return `Haul: ${rangeText(s.coins, coinsText)}, ${rangeText(s.amount, (n) => materialText(s.material, n))}`;
  },
  send: "Send",
  // The energy a trip took stays spent, said before the tap (the player is told, not surprised).
  spent: (spot: SpotId): string => `Spent ${spots[spot].energyCost} energy, which does not come back.`,
  // The button's words: exactly what a tap now adds to the bag (the same callBackHaul the action uses).
  callBack: (job: NonNullable<Creature["job"]>, nowMs: number): string => {
    const { coins, amount } = callBackHaul(job, nowMs);
    const parts = [coins > 0 ? coinsText(coins) : null, amount > 0 ? materialText(spots[job.spot].material, amount) : null].filter(
      (part) => part !== null,
    );
    return `Call back now: ${parts.length > 0 ? parts.join(", ") : "nothing earned yet"}`;
  },
};
