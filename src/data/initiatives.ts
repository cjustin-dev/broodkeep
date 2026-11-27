// Creature initiatives (docs/adult-a3-plan.md section 14): the creature starts something now and then while the game is open. Every number is a starting value, tuned like the rest of tuning.ts.

export type InitiativeKind = "play" | "craving" | "gift";

// The fixed order the draw walks and ties are broken in.
export const initiativeKinds: readonly InitiativeKind[] = ["play", "craving", "gift"];

export const initiativeTuning = {
  delayMs: [60_000, 90_000] as [number, number], // from the start of one initiative to the start of the next (the spec's 60 to 90 seconds), counted on seen, unblocked time
  clockCapMs: 2000, // the most one tick adds to the initiative clock, so a page that was hidden cannot bank time
  fadeMs: 30_000, // an unanswered craving or gift is gone after this, with no cost
  playMs: 15_000, // a play ends this long after its first toss
  tosses: 6, // and after this many
  tossXp: 2, // Bond XP for each toss
  cravingXp: 8, // Bond XP for feeding what it asked for
  giftCoins: 2, // a coin gift is this many coins
  giftCoinChance: 1 / 3, // of a gift; the rest is one of the materials
  base: { play: 3, craving: 2, gift: 2 } as Record<InitiativeKind, number>, // the weights before the form's step and the Bond level
  stepSteps: 3, // a form's step for a kind is 0 to stepSteps - 1
  playPerBond: 0.25, // play weighs this much more for each Bond level above 1
};
