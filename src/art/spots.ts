// Where the fixed things are, for each of the two worlds a creature can stand in: the old ONE-LINE room (128 x 128, in the fields too: layout.ts) and the HOME
// (768 x 192 with three rooms built, 1032 x 192 with four, on a tile grid: home.ts). The drawing code asks this for a position instead of reading `ROOM` or the home directly, so one piece of code draws both.
// A creature's standing picture has its top at `view.y - size`; `view.y` is its feet line (the old room's `ROOM.groundY`, always, in the line world).

import { AWAY_BUBBLE } from "../data/home";
import { HOME, bedLying, deadCenter, deadFeet, eggSpot, poopSpot } from "./home";
import { POOP_SPOTS, ROOM, STONE_WIDTH, bedSpot, deadX, standY, stoneX, wideWidth } from "./layout";

export type World = "line" | "home";

export interface Spots {
  w: number; // the width of the world, to keep a floating Z inside it
  egg: { x: number; y: number }; // top left of the 16 pixel egg
  poop: (i: number) => { x: number; y: number } | null;
  bed: (size: number) => { x: number; y: number }; // top left of a creature lying on the bed
  dead: (size: number) => { x: number; y: number }; // top left of a dead creature's lying picture's standing box (its middle is at the grave)
  stone: (size: number) => { x: number; y: number }; // top left of the tombstone
  bubble: { x: number; y: number }; // top left of the bubble over an empty room
}

const line: Spots = {
  w: ROOM.w,
  egg: { x: ROOM.eggX, y: ROOM.eggY },
  poop: (i) => {
    const s = POOP_SPOTS[i];
    return s ? { x: s[0], y: s[1] } : null;
  },
  bed: bedSpot,
  dead: (size) => ({ x: deadX(size), y: standY(size) }),
  stone: (size) => ({ x: stoneX(size), y: ROOM.groundY - 12 }),
  bubble: { x: ROOM.w / 2 - 6, y: 54 },
};

const home: Spots = {
  get w() {
    return HOME.w; // (the width of the home built now)
  },
  egg: eggSpot(),
  poop: poopSpot,
  bed: bedLying,
  dead: (size) => ({ x: deadCenter() - size / 2, y: deadFeet() - size }),
  stone: (size) => ({ x: deadCenter() - size / 2 + (wideWidth(size) + size) / 2 - 2, y: deadFeet() - 12 }),
  bubble: { x: AWAY_BUBBLE.x - 6, y: AWAY_BUBBLE.y },
};

export const spotsOf = (world: World): Spots => (world === "home" ? home : line);
export { STONE_WIDTH };
