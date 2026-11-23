// Seeded random numbers. The same seed always gives the same sequence,
// so catching up on missed time gives the same result however it is split up.
// The generator state is kept in the save (rngState).

export interface Rng {
  next(): number; // 0 up to (not including) 1
  int(min: number, max: number): number; // whole number, both ends included
  chance(p: number): boolean; // true with probability p (0 to 1)
  pick<T>(items: T[]): T;
  state(): number; // store this to continue the sequence later
}

// "mulberry32": a tiny, fast generator that is good enough for a game.
export function makeRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (items) => items[Math.floor(next() * items.length)] as (typeof items)[number],
    state: () => s,
  };
}
