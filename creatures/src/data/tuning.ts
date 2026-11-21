// Every number that decides how the game feels lives here.
// Change a number, and the whole game changes. No other file needs to be touched.
//
// Time is counted in minutes of game time. Stats run from 0 to 100, and high is good.

export const tuning = {
  // If the device clock jumps back by more than this, the game carries on from the new time.
  // A smaller step back is ignored until the clock catches up.
  clockRewindToleranceMinutes: 60,

  // The creature sleeps at night. The player can change these hours in Settings.
  sleepDefaults: { startHour: 20, endHour: 7 },

  egg: {
    minutes: 30, // time to hatch with no help
    tapShaveMinutes: 0.5, // each tap takes this much off the wait
    maxShaveMinutes: 10, // taps can save at most this much (about a third)
  },

  // Stats of a newborn creature.
  newborn: { hunger: 70, happiness: 70, energy: 100, hygiene: 100, wellness: 100, discipline: 50 },

  // How many AWAKE hours it takes for a stat to fall from 100 to 0.
  emptyAfterAwakeHours: { hunger: 14, happiness: 20, energy: 16, hygiene: 24 },
  // While asleep, hunger, happiness and hygiene fall this much slower.
  asleepDecayFactor: 0.25,
  // Energy gained per minute while asleep.
  sleepEnergyPerMinute: 0.25,
  // A nap can start when energy is below this, and ends when energy reaches the wake level.
  napBelowEnergy: 90,
  napWakeAtEnergy: 100,

  // Poop makes the creature dirtier: extra hygiene lost per minute for each poop.
  poopHygieneDrainPerMinute: 0.04,
  maxPoop: 5,

  // Refuses food when hunger is at or above this.
  fullAtHunger: 95,

  wellness: {
    sickDrain: 100 / (20 * 60), // lost per minute while sick
    starvingDrain: 0.07, // hunger at zero
    dirtyDrain: 0.04, // hygiene at zero
    exhaustedDrain: 0.04, // energy at zero
    asleepDrainFactor: 0.5, // drains are this much slower while asleep
    regen: 0.05, // gained per minute when everything is fine
    healthyHungerAbove: 20,
    healthyHygieneAbove: 20,
    sickBelow: 25, // low wellness makes the creature sick
  },

  // The creature dies when wellness has been zero for this long.
  // With the numbers above, a newborn that is never looked after dies after 43 to 51 hours
  // ("roughly two days"), depending on the time of day it hatched. The test suite checks this.
  deathAfterWellnessZeroMinutes: 480,

  sickness: {
    // Chance per awake minute, for each poop beyond the first one left lying around.
    perExtraPoopChance: 0.003,
    // Chance per awake minute while hygiene is at zero.
    hygieneZeroChance: 0.004,
    // Candy: each candy eaten in the last window makes the next one riskier.
    candyWindowMinutes: 180,
    candyChancePerRecent: 0.2,
  },

  medicine: { wellnessBoost: 20, wellnessFloor: 40 },

  // The creature "calls" for attention when a need gets low.
  calls: {
    hungryBelow: 25,
    sadBelow: 25,
    dirtyHygieneBelow: 25,
    dirtyPoopAtLeast: 2,
    sleepyBelow: 15,
    // An unanswered call this long (awake minutes) counts as one care mistake.
    patienceMinutes: 60,
  },

  // Petting and tickling make the creature happier, but only so much per hour.
  affection: { windowMinutes: 60, maxGainPerWindow: 15, pet: 2, tickle: 3 },

  // The dev log keeps this many lines.
  logMax: 300,
};
