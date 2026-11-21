// Where things sit in the room. The room is drawn on a tiny 96 x 96 pixel canvas
// and scaled up, which is what gives the chunky pixel look.

export const ROOM = {
  w: 96,
  h: 96,
  floorTop: 61, // the wall ends and the floor starts here
  sprite: 16, // creature and egg sprites are 16 x 16 pixels
  walkMinX: 6, // furthest left and right the creature walks (left edge of the sprite)
  walkMaxX: 60,
  walkY: 56, // top of the sprite while standing on the floor
  bedX: 68, // where the creature sleeps
  bedY: 54,
  deadX: 24, // where a dead creature lies, clear of the bed (the tombstone goes beside it)
  eggX: 40,
  eggY: 52,
};

// Spots on the floor where poop can appear (left edge, top edge).
export const POOP_SPOTS: Array<[number, number]> = [
  [30, 80],
  [46, 84],
  [60, 79],
  [18, 86],
  [74, 85],
];
