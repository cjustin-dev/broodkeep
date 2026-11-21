// Combat numbers: stats, HP, damage, the opponent ladder, what a fight costs and what it pays.
// First guesses, like everything in tuning.ts. Plan section 7.6.

import type { Stage } from "../game/types";

export const combatTuning = {
  // A creature may fight from this stage up (babies are too small).
  minStage: "training" as Stage,

  // Max HP is vitality times this.
  hpPerVit: 3,
  // Trained points a creature can have in each stat, by stage (they come from winning fights). Half of them carry
  // over when it evolves. A creature can never train past the cap of its stage.
  trainedCap: { baby: 0, training: 12, rookie: 20, champion: 32, ultimate: 50 } as Record<Stage, number>,

  // Opponent stats are a wild creature's base stats times the number for the rung. The last rung is the boss.
  ladder: [0.7, 0.85, 1.0, 1.15, 1.4],

  // Damage = attacker's stat times `power`, times a random 0.85 to 1.15, minus the target's defense times `soak`
  // (at least 1). Guarding halves it. A special uses spirit, hits harder and soaks less.
  attack: { power: 1.5, soak: 0.5 },
  special: { power: 2.4, soak: 0.25 },
  variance: [0.85, 1.15] as [number, number],
  guardFactor: 0.5,
  // Speed decides who goes first and the chance of a critical hit (speed times this, up to the maximum).
  crit: { perSpeed: 0.01, max: 0.25, factor: 1.5 },
  // The special meter: +1 for guarding and +1 for every hit taken. A special needs it full and empties it.
  meterMax: 3,
  // How the wild creature chooses: special when it can (this chance), else guard (this chance), else attack.
  foe: { specialChance: 0.7, guardChance: 0.2 },
  // A creature below 50 discipline sometimes sulks and ignores the command: (50 - discipline) in a hundred, at most this.
  sulk: { below: 50, perPoint: 0.01, max: 0.3 },

  // A fight costs energy, and the creature must keep this much energy afterwards.
  energyCost: 10,
  energyFloor: 20,
  // Losing: it wakes at this share of its max HP and loses this much more energy.
  knockedOut: { hpShare: 0.25, energy: 10 },

  // Resting: awake minutes to refill from empty. Twice as fast asleep, half as fast while hungry or dirty.
  recoverMinutes: 30,
  asleepFactor: 2,
  neglectFactor: 0.5,
  neglectBelow: 25, // hunger or hygiene under this counts as neglected

  // A win pays this many coins (rung up to rung + 2; double for the boss), sometimes a material, and trains one stat.
  coinsExtra: 2,
  bossFactor: 2,
  materialChance: 0.5,
  statGain: 1, // a boss win gains double
};
