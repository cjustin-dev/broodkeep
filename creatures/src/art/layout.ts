// Where things sit in the room. The room is drawn on a tiny 96 x 96 pixel canvas
// and scaled up, which is what gives the chunky pixel look.

export const ROOM = {
  w: 96,
  h: 96,
  floorTop: 61, // the wall ends and the floor starts here
  sprite: 16, // eggs, the two babies and the in training forms are 16 x 16 pixels. Rookies are 22, champions 28, ultimates 32
  groundY: 72, // the bottom edge of a standing creature's picture (its last row is empty, so the feet touch the floor)
  walkMinX: 6, // furthest left a walking creature goes (left edge of the sprite)
  walkRight: 76, // furthest right it goes (right edge of the sprite), so a bigger creature has less room to walk
  bedLeft: 62, // the left edge of the bed (room.ts draws it there), so nothing else is put on it
  bedCenter: 78, // the middle of the bed, and of a sleeping creature
  bedY: 54, // where room.ts draws the bed from: the top of a 16 pixel creature lying on it. Bigger ones rest on the same line
  deadCenter: 32, // the middle of a dead creature, clear of the bed (the tombstone goes beside it)
  eggX: 40,
  eggY: 52,
};

// Where a creature of a given size (the width and height of its picture) goes. Eggs, babies and
// in training forms are 16, the later stages grow from there. All the sizes are even, so the middle
// is a whole pixel.
export const standY = (size: number): number => ROOM.groundY - size; // top of the sprite while standing
export const walkMaxX = (size: number): number => ROOM.walkRight - size; // furthest right the left edge goes
export const bedSpot = (size: number): { x: number; y: number } => ({
  x: ROOM.bedCenter - size / 2,
  y: ROOM.bedY + ROOM.sprite - size,
});
export const deadX = (size: number): number => ROOM.deadCenter - size / 2;

// The lying and slumped pictures are wider than the standing one, and a creature is drawn centered
// on the same spot. 8 wider, but never wider than the bed (32), so a big creature only gets flatter.
export const wideWidth = (size: number): number => Math.min(size + 8, 32);

// The tombstone's left edge: it overlaps the end of the lying creature by two pixels.
export const stoneX = (size: number): number => deadX(size) + (wideWidth(size) + size) / 2 - 2;
export const STONE_WIDTH = 10;

// Spots on the floor where poop can appear (left edge, top edge).
export const POOP_SPOTS: Array<[number, number]> = [
  [30, 80],
  [46, 84],
  [60, 79],
  [18, 86],
  [74, 85],
];
