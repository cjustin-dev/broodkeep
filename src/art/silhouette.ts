// A picture with every colour replaced by one flat colour: the same shape, with the face and the markings gone. The Creature Book shows
// this for a creature the player has not raised yet. The colour is a muted violet that stands out from the book's near-black page (about
// 3.2 to 1), so a missing creature is easy to see.
import type { Sprite } from "./pixel";

export const SILHOUETTE = "#6a58a8";

export function silhouette(sprite: Sprite, color = SILHOUETTE): Sprite {
  return { rows: sprite.rows, palette: Object.fromEntries(Object.keys(sprite.palette).map((letter) => [letter, color])) };
}
