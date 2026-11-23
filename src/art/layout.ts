// Where things sit in the room. The room is drawn on a tiny 128 x 128 pixel canvas
// and scaled up, which is what gives the chunky pixel look. (The fields, the habitat and the arena use the same size.)

// The widest a lying or slumped picture gets, and the bed it lies on: an adult (48) plus 8.
export const BED_WIDTH = 56;

export const ROOM = {
  w: 128,
  h: 128,
  floorTop: 82, // the wall ends and the floor starts here
  sprite: 16, // eggs are 16 x 16 pixels. Babies are 20, kids 24, young 36, adults 48
  groundY: 112, // the bottom edge of a standing creature's picture (the bottom row is its outline, so the feet touch the floor)
  walkMinX: 8, // furthest left a walking creature goes (left edge of the sprite)
  walkRight: 84, // furthest right it goes (right edge of the sprite), so a bigger creature has less room to walk. Never past bedLeft + 16, so food beside a walking creature is never put on the bed
  bedLeft: 68, // the left edge of the bed (room.ts draws it there), so nothing else is put on it
  bedCenter: 96, // the middle of the bed, and of a sleeping creature
  bedY: 82, // where room.ts draws the bed from: the top of a 16 pixel creature lying on it. Bigger ones rest on the same line
  deadCenter: 30, // the middle of a dead creature, clear of the bed (the tombstone goes beside it)
  eggX: 56,
  eggY: 92,
};

// Where a creature of a given size (the width and height of its picture) goes. Eggs are 16, babies 20, and the later stages
// grow from there. All the sizes are even, so the middle is a whole pixel.
export const standY = (size: number): number => ROOM.groundY - size; // top of the sprite while standing
export const walkMaxX = (size: number): number => ROOM.walkRight - size; // furthest right the left edge goes
export const bedSpot = (size: number): { x: number; y: number } => ({
  x: ROOM.bedCenter - size / 2,
  y: ROOM.bedY + ROOM.sprite - size,
});
export const deadX = (size: number): number => ROOM.deadCenter - size / 2;

// The lying and slumped pictures are wider than the standing one, and a creature is drawn centered
// on the same spot. 8 wider, but never wider than the bed (an adult, 48 + 8, is exactly as wide).
export const wideWidth = (size: number): number => Math.min(size + 8, BED_WIDTH);

// The tombstone's left edge: it overlaps the end of the lying creature by two pixels.
export const stoneX = (size: number): number => deadX(size) + (wideWidth(size) + size) / 2 - 2;
export const STONE_WIDTH = 10;

// Spots on the floor where poop can appear (left edge, top edge), below the bed and the walking line.
export const POOP_SPOTS: Array<[number, number]> = [
  [30, 108],
  [46, 112],
  [66, 109],
  [88, 112],
  [106, 114],
];
